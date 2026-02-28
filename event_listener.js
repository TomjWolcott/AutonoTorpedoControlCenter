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
quat = new Quaternion(0, 0, 0, 1);

let timeSinceLastBatteryReminder = 0;

prev1000Messages = [];

messageHandler();
async function messageHandler() {
    while (true) {
        let msg = await recieveWait({ isExpectedMessage: () => true });

        if (prev1000Messages.length >= 1000) {
            prev1000Messages.shift();
        }
        prev1000Messages.push(msg);

        if (msg.id == MESSAGE_IDS.TEXT) {
            appendLog(msg.text, ORIGIN.DEVICE);
        } else if (msg.id == MESSAGE_IDS.SEND_CONFIG) {
            console.log("Recieved send config", msg);
            appendLog(`${msg.name} (ID: ${msg.id}) received (originally set at ${msg.config.dateUploaded})`, ORIGIN.CONTROLLER);
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
                $("#freeHeap")[0].input[0].value = msg.otherData.freeHeap;
            }

            if ("adcData" in msg) {
                $("#battVoltageInput")[0].input[0].value = msg.adcData.batt_v.toFixed(3);
                $("#refVoltageInput")[0].input[0].value = msg.adcData.vref_v.toFixed(3);
                $("#ipropiVoltagesInput-0")[0].input[0].value = msg.adcData.ipropis_v[0].toFixed(3);
                $("#ipropiVoltagesInput-1")[0].input[0].value = msg.adcData.ipropis_v[1].toFixed(3);
                $("#ipropiVoltagesInput-2")[0].input[0].value = msg.adcData.ipropis_v[2].toFixed(3);
                $("#ipropiVoltagesInput-3")[0].input[0].value = msg.adcData.ipropis_v[3].toFixed(3);
                $("#selfTempInput")[0].input[0].value = msg.adcData.self_temp_C.toFixed(0);

                if (msg.adcData.batt_v < 3.8 && msg.adcData.batt_v > 1.5 && Date.now() - timeSinceLastBatteryReminder > 20 * 1000) {
                    let beat = new Audio("assets/eas-alarm-81032.mp3");
                    beat.play();
                    timeSinceLastBatteryReminder = Date.now();

                    setTimeout(() => alert(`Warning: Battery voltage is low! (${msg.adcData.batt_v.toFixed(2)} V)`), 400);
                }
            }

            if ("mag" in msg) {
                $("#mag-0")[0].input[0].value = msg.mag[0];
                $("#mag-1")[0].input[0].value = msg.mag[1];
                $("#mag-2")[0].input[0].value = msg.mag[2];

                let magCal = [
                    (msg.mag[0] - configs[CURRENT_CONFIG_ID].mag.bias[0]) / configs[CURRENT_CONFIG_ID].mag.scale[0],
                    (msg.mag[1] - configs[CURRENT_CONFIG_ID].mag.bias[1]) / configs[CURRENT_CONFIG_ID].mag.scale[1],
                    (msg.mag[2] - configs[CURRENT_CONFIG_ID].mag.bias[2]) / configs[CURRENT_CONFIG_ID].mag.scale[2]
                ];

                $("#cal-mag-0")[0].input[0].value = magCal[0].toFixed(3);
                $("#cal-mag-1")[0].input[0].value = magCal[1].toFixed(3);
                $("#cal-mag-2")[0].input[0].value = magCal[2].toFixed(3);

                mag = [magCal[0], magCal[1], magCal[2]];
            }

            if ("accGyro" in msg) {
                $("#acc-0")[0].input[0].value = msg.accGyro.acc[0].toFixed(4);
                $("#acc-1")[0].input[0].value = msg.accGyro.acc[1].toFixed(4);
                $("#acc-2")[0].input[0].value = msg.accGyro.acc[2].toFixed(4);

                $("#gyr-0")[0].input[0].value = msg.accGyro.gyro[0].toFixed(4);
                $("#gyr-1")[0].input[0].value = msg.accGyro.gyro[1].toFixed(4);
                $("#gyr-2")[0].input[0].value = msg.accGyro.gyro[2].toFixed(4);

                let accCal = [
                    (msg.accGyro.acc[0] - configs[CURRENT_CONFIG_ID].imu.accBias[0]) / configs[CURRENT_CONFIG_ID].imu.accScale[0],
                    (msg.accGyro.acc[1] - configs[CURRENT_CONFIG_ID].imu.accBias[1]) / configs[CURRENT_CONFIG_ID].imu.accScale[1],
                    (msg.accGyro.acc[2] - configs[CURRENT_CONFIG_ID].imu.accBias[2]) / configs[CURRENT_CONFIG_ID].imu.accScale[2]
                ];

                acc = [accCal[0], accCal[1], accCal[2]];

                $("#cal-acc-0")[0].input[0].value = accCal[0].toFixed(3);
                $("#cal-acc-1")[0].input[0].value = accCal[1].toFixed(3);
                $("#cal-acc-2")[0].input[0].value = accCal[2].toFixed(3);

                $("#cal-gyr-0")[0].input[0].value = (msg.accGyro.gyro[0] - configs[CURRENT_CONFIG_ID].imu.gyrBias[0]).toFixed(3);
                $("#cal-gyr-1")[0].input[0].value = (msg.accGyro.gyro[1] - configs[CURRENT_CONFIG_ID].imu.gyrBias[1]).toFixed(3);
                $("#cal-gyr-2")[0].input[0].value = (msg.accGyro.gyro[2] - configs[CURRENT_CONFIG_ID].imu.gyrBias[2]).toFixed(3);
            }

            if ("localization" in msg) {
                $("#position-x")[0].input[0].value = msg.localization.position[0].toFixed(3);
                $("#position-y")[0].input[0].value = msg.localization.position[1].toFixed(3);
                $("#position-z")[0].input[0].value = msg.localization.position[2].toFixed(3);

                $("#orientation-qw")[0].input[0].value = msg.localization.orientation.w.toFixed(4);
                $("#orientation-qx")[0].input[0].value = msg.localization.orientation.x.toFixed(4);
                $("#orientation-qy")[0].input[0].value = msg.localization.orientation.y.toFixed(4);
                $("#orientation-qz")[0].input[0].value = msg.localization.orientation.z.toFixed(4);

                $("#orientation-yaw")[0].input[0].value = msg.localization.euler.yaw.toFixed(2);
                $("#orientation-pitch")[0].input[0].value = msg.localization.euler.pitch.toFixed(2);
                $("#orientation-roll")[0].input[0].value = msg.localization.euler.roll.toFixed(2);

                quat = msg.localization.orientation;
            }

            if ("motorData" in msg) {
                setAllDisplays(msg.motorData.motorVoltage, msg.motorData.motorCurrent, msg.motorData.motorInput);
                // console.log([...msg.motorData.motorCurrent], [...msg.motorData.motorVoltage]);
            }

            if (("mag" in msg) && ("accGyro" in msg) && ("adcData" in msg) && ("otherData" in msg)  && ("localization" in msg) && ("motorData" in msg) && ("otherData" in msg) && (msg.mag[0]*msg.mag[0] + msg.mag[1]*msg.mag[1] + msg.mag[2]*msg.mag[2])**0.5 < 1000000) {
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
                controlCenterState.data.batt_v.push(msg.adcData.batt_v);
                controlCenterState.data.temp_c.push(msg.adcData.self_temp_C);
                controlCenterState.data.pos_x.push(msg.localization.position[0]);
                controlCenterState.data.pos_y.push(msg.localization.position[1]);
                controlCenterState.data.pos_z.push(msg.localization.position[2]);
                controlCenterState.data.yaw.push(msg.localization.euler.yaw);
                controlCenterState.data.pitch.push(msg.localization.euler.pitch);
                controlCenterState.data.roll.push(msg.localization.euler.roll);

                controlCenterState.data.motor_voltage_tl.push(msg.motorData.motorVoltage[0]);
                controlCenterState.data.motor_voltage_tr.push(msg.motorData.motorVoltage[1]);
                controlCenterState.data.motor_voltage_bl.push(msg.motorData.motorVoltage[2]);
                controlCenterState.data.motor_voltage_br.push(msg.motorData.motorVoltage[3]);

                controlCenterState.data.motor_current_tl.push(msg.motorData.motorCurrent[0]);
                controlCenterState.data.motor_current_tr.push(msg.motorData.motorCurrent[1]);
                controlCenterState.data.motor_current_bl.push(msg.motorData.motorCurrent[2]);
                controlCenterState.data.motor_current_br.push(msg.motorData.motorCurrent[3]);

                controlCenterState.data.motor_power_tl.push(msg.motorData.motorVoltage[0] * msg.motorData.motorCurrent[0]);
                controlCenterState.data.motor_power_tr.push(msg.motorData.motorVoltage[1] * msg.motorData.motorCurrent[1]);
                controlCenterState.data.motor_power_bl.push(msg.motorData.motorVoltage[2] * msg.motorData.motorCurrent[2]);
                controlCenterState.data.motor_power_br.push(msg.motorData.motorVoltage[3] * msg.motorData.motorCurrent[3]);

                controlCenterState.data.free_heap_bytes.push(msg.otherData.freeHeap);

                updatePlot(controlCenterState.data.t.length - 1);
            }
        } else if (msg.id == MESSAGE_IDS.PING_WITH_MS) {
            controlCenterState.msConvert = Date.now() - msg.ms;
            // sendPing(controlCenterState.port);
        }
    }
}

function onMessage(msg) {

}

document.getElementById("send-ping-btn").onclick = async () => {
    sendPing(controlCenterState.port);
}

document.getElementById("send-vroll-pid-btn").onclick = async () => {
    await sendAction(controlCenterState.port, ACTION_IDS.EDIT_CONTROL_LOOPS);
}