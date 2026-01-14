const NOT_CONNECTED = "not-connected";
const SETUP = "setup";
const TELEOP = "teleop";
const AUTONOMY = "autonomy";

controlCenterState = {
    state: NOT_CONNECTED,
    port: null,
    msConvert: 0,
    configurations: {},
    data: {
        t: [],
        batt_v: [],
        temp_c: [],
        magX: [],
        magY: [],
        magZ: [],
        accX: [],
        accY: [],
        accZ: [],
        gyrX: [],
        gyrY: [],
        gyrZ: [],
        pos_x: [],
        pos_y: [],
        pos_z: [],
        yaw: [],
        pitch: [],
        roll: [],
    }
};

setState(NOT_CONNECTED);

function setState(newState) {
    controlCenterState.state = newState;

    for (const object of document.getElementsByClassName("state-based")) {
        if (object.classList.contains(`show-${newState}`)) {
            object.style.display = "";
        } else {
            object.style.display = "none";
        }
    }
}

const domLog = document.getElementById("log");