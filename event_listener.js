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
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

mag = [0, 0, 0];
acc = [0, 0, 0];

function onMessage(msg) {
    console.log("DATA READ", msg);
    $("#log").append(`[${msg.name} received]<br>`);

    if (msg.id == MESSAGE_IDS.PING) {
        // sendPing(controlCenterState.port);
    } else if (msg.id == MESSAGE_IDS.SEND_DATA) {
        if ("adcData" in msg) {
            $("#battVoltage").text(msg.adcData.batt_v.toFixed(3));
            $("#refVoltage").text(msg.adcData.vref_v.toFixed(3));
            $("#ipropiVoltages").text(`[${msg.adcData.ipropis_v.map(v => v.toFixed(3)).join("V, ")}V]`);
            $("#selfTemp").text(msg.adcData.self_temp_C.toFixed(0));
            let ms = msg.adcData.timestamp_s * 1000 + controlCenterState.msConvert;

            $("#dataTakenTimestamp").text((new Date(ms).toLocaleTimeString()).replace(" ", ((ms / 1000) % 1).toFixed(3).slice(1) + " "));
        }

        if ("mag" in msg) {
            $("#magData").text(`[${msg.mag.map(v => {
                // v *= 50000;
                let str = Math.abs(v).toFixed(0);
                str = str.padStart(6, "0");
                
                return `${(v < 0 ? "-" : "+")}${numberWithCommas(str)}`;
            }).join("nT, ")}nT]`);
        }

        if ("accGyro" in msg) {
            $("#accData").text(`[${msg.accGyro.acc.map(v => {
                return `${(v < 0 ? "-" : "+")}${Math.abs(v).toFixed(4)}`
            }).join("g, ")}g]`);
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
    } else if (msg.id == MESSAGE_IDS.PING_WITH_MS) {
        controlCenterState.msConvert = Date.now() - msg.ms;
        // sendPing(controlCenterState.port);
    }
}

document.getElementById("send-ping-btn").onclick = async () => {
    console.log("SEND PING");
    sendPing(controlCenterState.port);
}

document.getElementById("calibrate-mag-btn").onclick = async () => {
    console.log("SEND CALIBRATE MAG");
    sendAction(controlCenterState.port, ACTION_IDS.CALIBRATE_MAG);
}