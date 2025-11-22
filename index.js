const NOT_CONNECTED = "not-connected";
const SETUP = "setup";
const TELEOP = "teleop";
const AUTONOMY = "autonomy";

controlCenterState = {
    state: NOT_CONNECTED,
    port: null,
    msConvert: 0
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