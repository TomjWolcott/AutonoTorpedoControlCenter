let devicePort = null;

const MESSAGE_SEPARATOR_REGEX = /\*\*[\*]+[^\*]/g; // three or more consecutive stars followed by a non-star
const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();
const MESSAGE_HEADER = [0x11, 0x0F, 0xFF, 0x00];

const MESSAGE_IDS = {
    /** Used by: Device & Controller. @type{int} */
    PING: 0,
    /** Used by: Controller. @type{int} */
    ACTION: 1,
    /** Used by: Device. @type{int} */
    SEND_DATA: 2,
    /** Used by: Device. @type{int} */
    PING_WITH_MS: 3,
    /** Used by: Device & Controller. @type{int} */
    SEND_CONFIG: 4,
    /** Used by: Device. @type{int} */
    TEXT: 5,
    /** Used by: Device & Controller. @type{int} */
    CALIBRATION_DATA: 6,
    /** Used by: Device & Controller. @type{int} */
    ECHO: 7,
};

/**
 * Equivalent to MATCHES_HEADER(message, size) 
 * @param {Uint8Array} message Expected message format: [0x11, 0x0F, 0xFF, 0x00, #bytes in message, message id, ...]
 * @returns {boolean}
 */
function isValidMessage(message) {
    return (message.length >= 6 && 
        message[0] == MESSAGE_HEADER[0] && 
        message[1] == MESSAGE_HEADER[1] && 
        message[2] == MESSAGE_HEADER[2] && 
        message[3] == MESSAGE_HEADER[3] &&
        message[4] == message.length
    );
}

/**
* User type definition
* @typedef {Object} ConvertedMessage
* @property {Uint8Array} rawData
* @property {int} id
* @property {string} name
* @property {Uint8Array} [data]
* @property {string} [text]
*/

/**
 * Reads invalid messages as strings and converts valid messages to objects with an id parameter
 * @param {Uint8Array} message 
 * @returns {ConvertedMessage}
 */
function convertMessage(message) {
    if (isValidMessage(message)) {
        switch (message[5]) {
            case (MESSAGE_IDS.PING):
                return { rawData: message, id: message[5], name: "Ping" };
            case (MESSAGE_IDS.SEND_DATA):
                let data = convertData(message[6], message.slice(7));
                return { rawData: message, id: message[5], name: "SendData", ...data };
            case (MESSAGE_IDS.PING_WITH_MS):
                return { rawData: message, id: message[5], name: "PingWithMs", ms: ((message[6] << 24) | (message[7] << 16) | (message[8] << 8) | message[9]) };
            case (MESSAGE_IDS.SEND_CONFIG):
                return { rawData: message, id: message[5], name: "SendConfig", config: convertMessageToConfiguration(message.slice(6)) };
            case (MESSAGE_IDS.TEXT):
                return { rawData: message, id: message[5], name: "Text", text: DECODER.decode(message.slice(6)) };
            case (MESSAGE_IDS.CALIBRATION_DATA):
                return { 
                    rawData: message, id: message[5], name: "CalibrationData", isComplete: message[6] == 1, 
                    vectors: convertCalibrationDataToVectors(message.slice(7))
                };
            case (MESSAGE_IDS.ECHO):
                return { rawData: message, id: message[5], name: "Echo", origin: message[6], data: message.slice(7) };
            default:
                return {
                    rawData: message,
                    id: message[5],
                    data: message.slice(6)
                };
        }
    } else {
        return { rawData: message, id: -1, name: "BadMessage" };
    }
}

async function requestPort() {
    try {
        return await navigator.serial.requestPort({ filters: [{ usbVendorId: 1155 }] });
    } catch (e) { 
        console.log("RequestPort err: ", e);
        return null;
    }
}

async function openPort(port) {
    try {
        await port.open({ baudRate: 115200 });
        return true;
    } catch (e) { 
        console.log("OpenPort err: ", e);
        return false;
    }
}

/**
 * 
 * @param {Uint8Array} data 
 * @returns {[Uint8Array|null, Uint8Array]}
 */
function extractMessage(data) {
    let data_copy = new Uint8Array([...data]);
    let matches_header = (data) => (
        MESSAGE_HEADER[0] == data[0] &&
        MESSAGE_HEADER[1] == data[1] &&
        MESSAGE_HEADER[2] == data[2] &&
        MESSAGE_HEADER[3] == data[3]
    );

    while (data_copy.length >= 6 && !matches_header(data_copy)) {
        data_copy = data_copy.slice(1);
    }

    if (data_copy.length < 6) {
        return [null, data];
    } 

    let msgSize = data_copy[4];
    
    if (data_copy.length >= msgSize) {
        return [data_copy.slice(0, msgSize), data_copy.slice(msgSize)];
    } else {
        return [null, data];
    }
}

async function readUntilClosed(port, onMessage = null, timeout = 1000) {
    while (port.readable) {
        let rx_data = new Uint8Array();
        let msg_data = null;
        let reader = port.readable.getReader();
        
        try {
            while (true) {
                const { value, done } = await reader.read();

                if (done) {
                    msg_data = rx_data;
                    break;
                }

                rx_data = new Uint8Array([...rx_data, ...value]);

                [msg_data, rx_data] = extractMessage(rx_data);

                if (msg_data) {
                    let msg = convertMessage(msg_data);
                    MessageAwaiter.handleMessage(msg);
                }
            }
        } catch (error) {
            console.log("readUntilClosed err: ", error);
        } finally {
            // Allow the serial port to be closed later.
            reader.releaseLock();
        }
    }

    console.log("PORT NO LONGER READABLE");

    await port.close();
}

class MessageAwaiter {
    static awaiters = {};
    static handleMessage(msg) {
        for (let id in MessageAwaiter.awaiters) {
            let awaiter = MessageAwaiter.awaiters[id];
            if (awaiter.isExpectedMessage(msg)) {
                awaiter.receiveMessage(msg);
            }
        }
    }
    constructor({onReceive = () => {}, onTimeout = () => {}, isExpectedMessage = (msg) => true, timeout = null, removeAfterMatch = true} = {}) {
        this.id = Math.random().toString(36).substring(2, 15);
        this.onReceive = onReceive;
        this.isExpectedMessage = isExpectedMessage;
        this.timeout = timeout;
        this.startTime = Date.now();
        this.removeAfterMatch = removeAfterMatch;

        MessageAwaiter.awaiters[this.id] = this;

        if (this.timeout != null) {
            setTimeout(() => {
                onTimeout();
                delete MessageAwaiter.awaiters[this.id];
            }, this.timeout);
        }
    }
    receiveMessage(msg) {
        this.onReceive(msg);

        if (this.removeAfterMatch) {
            delete MessageAwaiter.awaiters[this.id];
        }
    }
}

async function recieveWait({isExpectedMessage = (msg) => true, timeout = null} = {}) {
    return new Promise((resolve, _reject) => {
        new MessageAwaiter({
            isExpectedMessage: isExpectedMessage,
            timeout: timeout,
            onReceive: (msg) => {
                resolve(msg);
            },
            onTimeout: () => {
                resolve(null);
            }
        });
    });
}

async function sendPing(port) {
    let writer = port.writable.getWriter();
    
    await writer.write(new Uint8Array([...MESSAGE_HEADER, 6, MESSAGE_IDS.PING]));
    writer.releaseLock();
}

const ECHO_ORIGIN = {
    CONTROLLER: 0,
    DEVICE: 1,
}

async function sendReceiveEcho(port, data) {
    let writer = port.writable.getWriter();

    await writer.write(new Uint8Array([...MESSAGE_HEADER, 7 + data.length, MESSAGE_IDS.ECHO, ECHO_ORIGIN.CONTROLLER, ...data]));
    writer.releaseLock();

    return await recieveWait({isExpectedMessage: (msg) => {
        return msg.id == MESSAGE_IDS.ECHO && msg.origin == ECHO_ORIGIN.CONTROLLER && arraysEqual(msg.data, data);
    }});
}

async function repeatEchoes(port) {
    while (true) {
        let msg = await recieveWait({isExpectedMessage: (msg) => {
            return msg.id == MESSAGE_IDS.ECHO && msg.origin == ECHO_ORIGIN.DEVICE && arraysEqual(msg.data, data);
        }});

        let writer = port.writable.getWriter();
        await writer.write(new Uint8Array(msg.rawData));
        writer.releaseLock();
    }
}

function arraysEqual(a, b) {
    return a.length === b.length && a.every((val, index) => { return val === b[index]; });
}

function floatToIEEE754(float, reverse=true) {
    let floatArray = new Float32Array(1);
    floatArray[0] = float;
    let bytes = new Uint8Array(floatArray.buffer);
    if (reverse) {
        bytes = bytes.reverse();
    }
    return bytes;
}
function IEEE754ToFloat(bytes, reverse=true) {
    if (reverse) {
        bytes = bytes.reverse();
    }
    let byteArray = new Uint8Array(bytes);
    let floatArray = new Float32Array(byteArray.buffer);
    return floatArray[0];
}

const ACTION_IDS = {
    NOOP: 0,
    CALIBRATION_SETTINGS: 1,
    SPIN_MOTOR: 2,
    SEND_CONFIG: 3,
    CALIBRATION_MSG: 4
}

const CALIBRATION_TYPES = {
    MAGNETOMETER: 1,
    ACCELEROMETER: 0,
    GYROSCOPE: 2,
}

const CALIBRATION_MSG_TYPE = {
	DONE: 0,
	GO_AGAIN: 1,
	START: 2
};


const CALIBRATION_START_SIGNAL = {
	NOW: 0,
	ON_UNPLUG: 1,
};

async function sendAction(port, action, actionData = null) {
    let writer = port.writable.getWriter();
    let data = null;

    switch (action) {
        case (ACTION_IDS.CALIBRATION_SETTINGS):
            data = new Uint8Array([...MESSAGE_HEADER, 15, MESSAGE_IDS.ACTION, action,
                actionData.type,
                actionData.startSignal,
                (actionData.waitMsAfterUnplug >> 8) & 0xFF,
                actionData.waitMsAfterUnplug & 0xFF,
                (actionData.dataCollectRateHz >> 8) & 0xFF,
                actionData.dataCollectRateHz & 0xFF,
                (actionData.dataCollectTimeMs >> 8) & 0xFF,
                actionData.dataCollectTimeMs & 0xFF
            ]);
            break;
        case (ACTION_IDS.SPIN_MOTOR):
            data = new Uint8Array([...MESSAGE_HEADER, 11, MESSAGE_IDS.ACTION, action,
                floatToUint8((actionData.speed0 + 1) * 128),
                floatToUint8((actionData.speed1 + 1) * 128),
                floatToUint8((actionData.speed2 + 1) * 128),
                floatToUint8((actionData.speed3 + 1) * 128),
            ]);
            break;
        case (ACTION_IDS.CALIBRATION_MSG):
            data = new Uint8Array([...MESSAGE_HEADER, 8, MESSAGE_IDS.ACTION, action,
                actionData.calibrationMessageType
            ]);
            break;
        case (ACTION_IDS.SEND_CONFIG):
            data = new Uint8Array([...MESSAGE_HEADER, 7, MESSAGE_IDS.ACTION, action]);
            break;
    }

    if (data != null) {
        await writer.write(data);
    }

    writer.releaseLock();
}

/** Config format: [ (all 4 bytes float IEEE 754)
 *      mag_bias_x|mag_bias_y|mag_bias_z|
 *      mag_scale_x|mag_scale_y|mag_scale_z|
 *      acc_bias_x|acc_bias_y|acc_bias_z|
 *      acc_scale_x|acc_scale_y|acc_scale_z|
 *      gyr_bias_x|gyr_bias_y|gyr_bias_z|
 *      pid_roll_proportional|pid_roll_integral|pid_roll_derivative|pid_roll_min|pid_roll_max|
 *      pid_pitch_proportional|pid_pitch_integral|pid_pitch_derivative|pid_pitch_min|pid_pitch_max|
 *      pid_yaw_proportional|pid_yaw_integral|pid_yaw_derivative|pid_yaw_min|pid_yaw_max|
 *      pid_depth_proportional|pid_depth_integral|pid_depth_derivative|pid_depth_min|pid_depth_max|
 *      localization_madgwick_beta|
 *      motors_maximum_duty|motors_duty_scaler
 * ] */
function convertConfigurationToMessage(configObj) {
    let now = Date.now();
    return new Uint8Array([
        // date sent
        Math.floor(now / 2**56) % 256, Math.floor(now / 2**48) % 256, Math.floor(now / 2**40) % 256, Math.floor(now / 2**32) % 256,
        Math.floor(now / 2**24) % 256, Math.floor(now / 2**16) % 256, Math.floor(now / 2**8) % 256, now % 256,

        // mag bias
        ...floatToIEEE754(configObj.mag.bias[0]), ...floatToIEEE754(configObj.mag.bias[1]), ...floatToIEEE754(configObj.mag.bias[2]),
        // mag scale
        ...floatToIEEE754(configObj.mag.scale[0]), ...floatToIEEE754(configObj.mag.scale[1]), ...floatToIEEE754(configObj.mag.scale[2]),
        // acc bias
        ...floatToIEEE754(configObj.imu.accBias[0]), ...floatToIEEE754(configObj.imu.accBias[1]), ...floatToIEEE754(configObj.imu.accBias[2]),
        // acc scale
        ...floatToIEEE754(configObj.imu.accScale[0]), ...floatToIEEE754(configObj.imu.accScale[1]), ...floatToIEEE754(configObj.imu.accScale[2]),
        // gyr bias
        ...floatToIEEE754(configObj.imu.gyrBias[0]), ...floatToIEEE754(configObj.imu.gyrBias[1]), ...floatToIEEE754(configObj.imu.gyrBias[2]),
        // pid roll
        ...floatToIEEE754(configObj.pid.roll.proportional), ...floatToIEEE754(configObj.pid.roll.integral), 
        ...floatToIEEE754(configObj.pid.roll.derivative), ...floatToIEEE754(configObj.pid.roll.min), 
        ...floatToIEEE754(configObj.pid.roll.max),
        // pid pitch
        ...floatToIEEE754(configObj.pid.pitch.proportional), ...floatToIEEE754(configObj.pid.pitch.integral), 
        ...floatToIEEE754(configObj.pid.pitch.derivative), ...floatToIEEE754(configObj.pid.pitch.min), 
        ...floatToIEEE754(configObj.pid.pitch.max),
        // pid yaw
        ...floatToIEEE754(configObj.pid.yaw.proportional), ...floatToIEEE754(configObj.pid.yaw.integral), 
        ...floatToIEEE754(configObj.pid.yaw.derivative), ...floatToIEEE754(configObj.pid.yaw.min), 
        ...floatToIEEE754(configObj.pid.yaw.max),
        // pid depth
        ...floatToIEEE754(configObj.pid.depth.proportional), ...floatToIEEE754(configObj.pid.depth.integral), 
        ...floatToIEEE754(configObj.pid.depth.derivative), ...floatToIEEE754(configObj.pid.depth.min), 
        ...floatToIEEE754(configObj.pid.depth.max),
        // localization madgwick beta
        ...floatToIEEE754(configObj.localization.madgwickBeta),
        // motors
        ...floatToIEEE754(configObj.motors.maximumDuty), ...floatToIEEE754(configObj.motors.dutyScaler)
    ]);
}

function convertMessageToConfiguration(message) {
    let date_bytes = message.slice(0, 8);
    message = message.slice(8);
    message = [...message];

    return {
        dateUploaded: new Date(date_bytes[0] * 2**56 + date_bytes[1] * 2**48 + date_bytes[2] * 2**40 + date_bytes[3] * 2**32 +
                      date_bytes[4] * 2**24 + date_bytes[5] * 2**16 + date_bytes[6] * 2**8  + date_bytes[7]),
        mag: {
            bias: [
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
            ],
            scale: [
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
            ],
        },
        imu: {
            accBias: [
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
            ],
            accScale: [
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
            ],
            gyrBias: [
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
                IEEE754ToFloat(message.splice(0, 4)),
            ],
        },
        pid: {
            roll: {
                proportional: IEEE754ToFloat(message.splice(0, 4)),
                integral: IEEE754ToFloat(message.splice(0, 4)),
                derivative: IEEE754ToFloat(message.splice(0, 4)),
                min: IEEE754ToFloat(message.splice(0, 4)),
                max: IEEE754ToFloat(message.splice(0, 4)),
            },
            pitch: {
                proportional: IEEE754ToFloat(message.splice(0, 4)),
                integral: IEEE754ToFloat(message.splice(0, 4)),
                derivative: IEEE754ToFloat(message.splice(0, 4)),
                min: IEEE754ToFloat(message.splice(0, 4)),
                max: IEEE754ToFloat(message.splice(0, 4)),
            },
            yaw: {
                proportional: IEEE754ToFloat(message.splice(0, 4)),
                integral: IEEE754ToFloat(message.splice(0, 4)),
                derivative: IEEE754ToFloat(message.splice(0, 4)),
                min: IEEE754ToFloat(message.splice(0, 4)),
                max: IEEE754ToFloat(message.splice(0, 4)),
            },
            depth: {
                proportional: IEEE754ToFloat(message.splice(0, 4)),
                integral: IEEE754ToFloat(message.splice(0, 4)),
                derivative: IEEE754ToFloat(message.splice(0, 4)),
                min: IEEE754ToFloat(message.splice(0, 4)),
                max: IEEE754ToFloat(message.splice(0, 4)),
            },
        },
        localization: {
            madgwickBeta: IEEE754ToFloat(message.splice(0, 4)),
        },
        motors: {
            maximumDuty: IEEE754ToFloat(message.splice(0, 4)),
            dutyScaler: IEEE754ToFloat(message.splice(0, 4)),
        }
    };
}

async function sendConfiguration(port, configObj) {
    let writer = port.writable.getWriter();
    let data = new Uint8Array([...MESSAGE_HEADER, 166, MESSAGE_IDS.SEND_CONFIG,
        ...convertConfigurationToMessage(configObj)
    ]);

    await writer.write(data);
    writer.releaseLock();
}

function convertCalibrationDataToVectors(message) {
    let vectors = [];

    while (message.length >= 12) {
        let vector = [];

        for (let i = 0; i < 3; i++) {
            vector.push(IEEE754ToFloat(message.slice(0, 4)));
            message = message.slice(4);
        }

        vectors.push(vector);
    }

    return vectors;
}

accMin = [0, 0, 0];
magMin = [0, 0, 0];
accMax = [0, 0, 0];
magMax = [0, 0, 0];

accBias = [-0.009842087763419105, 0.015468163423381864, -0.001253971724430314];
magBias = [45000, -15000, -15000];
accScale = [0.9490046891694587, 0.9474597360720785, 0.9301767494947298];
magScale = [1, 1, 1];

const DATA_SENT_BITFLAGS = {
    /** Data from the ADC, stored as [vref_mv|vref_mv|self_temp_C|self_temp_C|batt_mv|batt_mv|batt_temp_mv|batt_temp_mv|ipropis_mv[0]|ipropis_mv[0]|ipropis_mv[1]|ipropis_mv[1]|ipropis_mv[2]|ipropis_mv[2]|ipropis_mv[3]|ipropis_mv[3]] */
    ADC_DATA: 0x01,
    /** Data from the AK09940A, stored as [x|x|x|y|y|y|z|z|z] */
    MAG:          0x02,
    /** Data from the ICM42688P, stored as [acc_x|acc_x|acc_y|acc_y|acc_z|acc_z|gyr_x|gyr_x|gyr_y|gyr_y|gyr_z|gyr_z] */
    ACC_GYRO:     0x04,
    /** Data from the MS5837, stored as [depth|depth|temp|temp] */
    DEPTH_TEMP:   0x08,
    /** Data from the localization algorithm, stored as [x|x|y|y|z|z|roll|roll|pitch|pitch|yaw|yaw] */
    LOCALIZED_DATA: 0x10,
    /** Data from the MS5837, stored as [pres|pres|temp|temp] */
    AIR_PRESSURE: 0x20,
    /** Other data, stored as [timestamp_ms|timestamp_ms|timestamp_ms|timestamp_ms|data_refresh_rate|data_refresh_rate|firmware_major|firmware_minor]*/
    OTHER_DATA:  0x40,
};

/**
 * 
 * @param {int} flags 
 * @param {Uint8Array} data 
 */
function convertData(flags, data) {
    let obj = {};

    data = [...data];

    while (flags != 0) {
        if (flags & DATA_SENT_BITFLAGS.ADC_DATA) {
            temp_c = ((data[2] << 8) | data[3]);
            temp_f = temp_c * 9 / 5 + 32;
            obj.adcData = {
                vref_v: ((data[0] << 8) | data[1]) / 1000.0,
                self_temp_C: temp_c,
                self_temp_F: temp_f,
                batt_v: ((data[4] << 8) | data[5]) / 1000.0,
                ipropis_v: [
                    ((data[6] << 8) | data[7]) / 1000.0,
                    ((data[8] << 8) | data[9]) / 1000.0,
                    ((data[10] << 8) | data[11]) / 1000.0,
                    ((data[12] << 8) | data[13]) / 1000.0,
                ]
            };

            flags &= (0xFF ^ DATA_SENT_BITFLAGS.ADC_DATA);
            data = data.slice(14);
        } else if (flags & DATA_SENT_BITFLAGS.MAG) {
            // data is in 2-s complement, so we need to convert it to signed integers
            obj.mag = [
                ((data[0] & 0x80) ? -(2.0**31.0) : 0) + (((data[0] & 0x7F) << 24) | (data[1] << 16) | (data[2] << 8) | data[3]),
                ((data[4] & 0x80) ? -(2.0**31.0) : 0) + (((data[4] & 0x7F) << 24) | (data[5] << 16) | (data[6] << 8) | data[7]),
                ((data[8] & 0x80) ? -(2.0**31.0) : 0) + (((data[8] & 0x7F) << 24) | (data[9] << 16) | (data[10] << 8) | data[11]),
            ];

            flags &= (0xFF ^ DATA_SENT_BITFLAGS.MAG);
            data = data.slice(12);

        } else if (flags & DATA_SENT_BITFLAGS.ACC_GYRO) {
            obj.accGyro = {
                acc: [
                    (((data[0] & 0x80) ? -(2.0**15.0) : 0) + (((data[0] & 0x7F) << 8) | data[1])) / 4096.0,
                    (((data[2] & 0x80) ? -(2.0**15.0) : 0) + (((data[2] & 0x7F) << 8) | data[3])) / 4096.0,
                    (((data[4] & 0x80) ? -(2.0**15.0) : 0) + (((data[4] & 0x7F) << 8) | data[5])) / 4096.0,
                ],
                gyro: [
                    (((data[6] & 0x80) ? -(2.0**15.0) : 0) + (((data[6] & 0x7F) << 8) | data[7])) / 4096.0,
                    (((data[8] & 0x80) ? -(2.0**15.0) : 0) + (((data[8] & 0x7F) << 8) | data[9])) / 4096.0,
                    (((data[10] & 0x80) ? -(2.0**15.0) : 0) + (((data[10] & 0x7F) << 8) | data[11])) / 4096.0,
                ]
            };

            flags &= (0xFF ^ DATA_SENT_BITFLAGS.ACC_GYRO);
            data = data.slice(12);
        } else if (flags & DATA_SENT_BITFLAGS.LOCALIZED_DATA) {
            obj.localization_data = data.slice(0, 28);
            let orientation = new Quaternion(
                IEEE754ToFloat(data.splice(0, 4)),
                IEEE754ToFloat(data.splice(0, 4)),
                IEEE754ToFloat(data.splice(0, 4)),
                IEEE754ToFloat(data.splice(0, 4))
            );

            let [yaw, pitch, roll] = orientation.toEuler("ZYX");

            obj.localization = {
                orientation: orientation,
                euler: {
                    roll: roll * (180.0 / Math.PI),
                    pitch: pitch * (180.0 / Math.PI),
                    yaw: yaw * (180.0 / Math.PI)
                },
                position: [
                    IEEE754ToFloat(data.splice(0, 4)),
                    IEEE754ToFloat(data.splice(0, 4)),
                    IEEE754ToFloat(data.splice(0, 4))
                ]
            };

            flags &= (0xFF ^ DATA_SENT_BITFLAGS.LOCALIZED_DATA);
        } else if (flags & DATA_SENT_BITFLAGS.OTHER_DATA) {
            obj.otherData = {
                timestamp_s: ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) / 1000000.0,
                dataRefreshRate_hz: ((data[4] << 8) | data[5]),
                firmwareVersion: `V${data[6]}.${data[7]}`
            };

            flags &= (0xFF ^ DATA_SENT_BITFLAGS.OTHER_DATA);
            data = data.slice(8);
        } else {
            break;
        }
    }

    return obj;
}