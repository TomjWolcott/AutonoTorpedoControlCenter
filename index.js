const NOT_CONNECTED = "not-connected";
const SETUP = "setup";
const TELEOP = "teleop";
const AUTONOMY = "autonomy";

controlCenterState = {
    state: NOT_CONNECTED
};

showHideHtmlStateClasses(controlCenterState.state);

function showHideHtmlStateClasses(newState) {
    for (const object of document.getElementsByClassName("state-based")) {
        if (object.classList.contains(`show-${newState}`)) {
            object.style.display = "";
        } else {
            object.style.display = "none";
        }
    }
}

document.getElementById("log").innerHTML = "ABC<br /> asdhfoisdhfia<br /> asoudfgoaudf";