const CLEAR_LOG_COMMAND = "[1;1H";
let searchForConnectionInterval = {
    handle: null,
    rate: 1000
};

document.getElementById("connect-btn").onclick = async () => {
    controlCenterState.port = await requestPort();
    if (controlCenterState.port == null) return;

    if (!await openPort(controlCenterState.port)) return;
    controlCenterState.state = setState(SETUP);

    readUntilClosed(controlCenterState.port, onMessage);
    repeatEchoes(controlCenterState.port);
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

mag = [0, 0, 0];
acc = [0, 0, 0];
let dataReceiveTimes = [];

messageHandler();
async function messageHandler() {
    while (true) {
        let msg = await recieveWait({ isExpectedMessage: () => true });

        if (msg.id == MESSAGE_IDS.TEXT) {
            appendLog(msg.text, ORIGIN.DEVICE);
        } else if (msg.id != MESSAGE_IDS.ECHO) {
            appendLog(`${msg.name} (ID: ${msg.id}) received`, ORIGIN.CONTROLLER);
        }

        if (msg.id == MESSAGE_IDS.PING) {
            // sendPing(controlCenterState.port);
        } else if (msg.id == MESSAGE_IDS.SEND_DATA) {
            // Update data receive rate
            let now = Date.now();
            dataReceiveTimes.push(now);
            while (dataReceiveTimes.length > 0 && dataReceiveTimes[0] < now - 1000) {
                dataReceiveTimes.shift();
            }
            
            $("#dataReceiveRateInput")[0].input[0].value = dataReceiveTimes.length;

            if ("otherData" in msg) {
                let ms = msg.otherData.timestamp_s * 1000 + controlCenterState.msConvert;
                $("#dataTakenTimestampInput")[0].input[0].value = (new Date(ms).toLocaleTimeString()).replace(" ", ((ms / 1000) % 1).toFixed(3).slice(1) + " ");

                $("#dataRefreshRateInput")[0].input[0].value = msg.otherData.dataRefreshRate_hz.toFixed(1);
                $("#firmwareVersionInput")[0].input[0].value = msg.otherData.firmwareVersion;
            }

            if ("adcData" in msg) {
                $("#battVoltageInput")[0].input[0].value = msg.adcData.batt_v.toFixed(3);
                $("#refVoltageInput")[0].input[0].value = msg.adcData.vref_v.toFixed(3);
                $("#ipropiVoltagesInput-0")[0].input[0].value = msg.adcData.ipropis_v[0].toFixed(3);
                $("#ipropiVoltagesInput-1")[0].input[0].value = msg.adcData.ipropis_v[1].toFixed(3);
                $("#ipropiVoltagesInput-2")[0].input[0].value = msg.adcData.ipropis_v[2].toFixed(3);
                $("#ipropiVoltagesInput-3")[0].input[0].value = msg.adcData.ipropis_v[3].toFixed(3);
                $("#selfTempInput")[0].input[0].value = msg.adcData.self_temp_C.toFixed(0);
            }

            if ("mag" in msg) {
                $("#mag-0")[0].input[0].value = msg.mag[0];
                $("#mag-1")[0].input[0].value = msg.mag[1];
                $("#mag-2")[0].input[0].value = msg.mag[2];
            }

            if ("accGyro" in msg) {
                $("#acc-0")[0].input[0].value = msg.accGyro.acc[0].toFixed(4);
                $("#acc-1")[0].input[0].value = msg.accGyro.acc[1].toFixed(4);
                $("#acc-2")[0].input[0].value = msg.accGyro.acc[2].toFixed(4);

                $("#gyr-0")[0].input[0].value = msg.accGyro.gyro[0].toFixed(4);
                $("#gyr-1")[0].input[0].value = msg.accGyro.gyro[1].toFixed(4);
                $("#gyr-2")[0].input[0].value = msg.accGyro.gyro[2].toFixed(4);
            }

            if (("mag" in msg) && ("accGyro" in msg) && (msg.mag[0]*msg.mag[0] + msg.mag[1]*msg.mag[1] + msg.mag[2]*msg.mag[2])**0.5 < 60000) {
                for (let i=0; i < 3; i++) {
                    accMin[i] = Math.min(accMin[i], msg.accGyro.acc[i]);
                    magMin[i] = Math.min(magMin[i], msg.mag[i]);
                    accMax[i] = Math.max(accMax[i], msg.accGyro.acc[i]);
                    magMax[i] = Math.max(magMax[i], msg.mag[i]);

                    // accBias[i] = (accMax[i] + accMin[i]) / 2;
                    // magBias[i] = (magMax[i] + magMin[i]) / 2;
                    // accScale[i] = 1 / ((accMax[i] - accMin[i]) / 2);
                    // magScale[i] = 1 / ((magMax[i] - magMin[i]) / 2);

                    if (accScale <= 0)
                        accScale[i] = 1;
                    if (magScale <= 0)
                        magScale[i] = 1;
                }

                mag = msg.mag;
                acc = msg.accGyro.acc;
            }

            if (("mag" in msg) && ("accGyro" in msg) && ("adcData" in msg) && ("otherData" in msg) && (msg.mag[0]*msg.mag[0] + msg.mag[1]*msg.mag[1] + msg.mag[2]*msg.mag[2])**0.5 < 1000000) {
                controlCenterState.data.t.push(msg.otherData.timestamp_s);
                controlCenterState.data.magX.push(msg.mag[0]);
                controlCenterState.data.magY.push(msg.mag[1]);
                controlCenterState.data.magZ.push(msg.mag[2]);
                controlCenterState.data.accX.push(msg.accGyro.acc[0]);
                controlCenterState.data.accY.push(msg.accGyro.acc[1]);
                controlCenterState.data.accZ.push(msg.accGyro.acc[2]);
                controlCenterState.data.gyrX.push(msg.accGyro.gyro[0]);
                controlCenterState.data.gyrY.push(msg.accGyro.gyro[1]);
                controlCenterState.data.gyrZ.push(msg.accGyro.gyro[2]);

                updatePlot(controlCenterState.data.t.length - 1);
            }
        } else if (msg.id == MESSAGE_IDS.PING_WITH_MS) {
            controlCenterState.msConvert = Date.now() - msg.ms;
            // sendPing(controlCenterState.port);
        } else if (msg.id == MESSAGE_IDS.SEND_CONFIG) {
            let configs = controlCenterState.configurations;
            configs[UPLOADED_CONFIG_ID] = msg.config;
            configs[UPLOADED_CONFIG_ID].readonly = true;
            if ($("#configOptionsDatalist").val() == UPLOADED_CONFIG_ID) {
                configs[CURRENT_CONFIG_ID] = window.structuredClone(configs[UPLOADED_CONFIG_ID]);
                configs[CURRENT_CONFIG_ID].readonly = false;
                setHtmlFromConfiguration(configs[CURRENT_CONFIG_ID]);
            }
        }
    }
}

function onMessage(msg) {
}

document.getElementById("send-ping-btn").onclick = async () => {
    sendPing(controlCenterState.port);
}