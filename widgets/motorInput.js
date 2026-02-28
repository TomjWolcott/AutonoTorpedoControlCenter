// keep direct inputs and f/r/p/y inputs synced at all times.

function directToFrpy([tl, tr, bl, br] = [0, 0, 0, 0]) {
    return [
        Math.max(-1, Math.min(1, (tl + tr + bl + br) / 4)),
        Math.max(-1, Math.min(1, (tl - tr - bl + br) / 4)),
        Math.max(-1, Math.min(1, (tl + tr - bl - br) / 4)),
        Math.max(-1, Math.min(1, (tl - tr + bl - br) / 4))
    ];
}

function frpyToDirect([f, r, p, y] = [0, 0, 0, 0]) {
    return [
        Math.max(-1, Math.min(1, (f + r + p + y))),
        Math.max(-1, Math.min(1, (f - r + p - y))),
        Math.max(-1, Math.min(1, (f - r - p + y))),
        Math.max(-1, Math.min(1, (f + r - p - y)))
    ];
}

const MOTOR_INPUT = {
    TL: "motor-tl",
    TR: "motor-tr",
    BL: "motor-bl",
    BR: "motor-br",

    FORWARD: "motor-forward",
    ROLL: "motor-roll",
    PITCH: "motor-pitch",
    YAW: "motor-yaw",
};

directInputs = [0, 0, 0, 0];
frpyInputs = [0, 0, 0, 0];
lastSetInputs = 0;

$(".tester-motor-input").on("change", async (e) => {
    switch (e.target.id) {
        case MOTOR_INPUT.TL:
            directInputs[0] = e.target.input;
            break;
        case MOTOR_INPUT.TR:
            directInputs[1] = e.target.input;
            break;
        case MOTOR_INPUT.BL:
            directInputs[2] = e.target.input;
            break;
        case MOTOR_INPUT.BR:
            directInputs[3] = e.target.input;
            break;


        case MOTOR_INPUT.FORWARD:
            frpyInputs[0] = e.target.input;
            break;
        case MOTOR_INPUT.ROLL:
            frpyInputs[1] = e.target.input;
            break;
        case MOTOR_INPUT.PITCH:
            frpyInputs[2] = e.target.input;
            break;
        case MOTOR_INPUT.YAW:
            frpyInputs[3] = e.target.input;
            break;
    }

    switch (e.target.id) {
        case MOTOR_INPUT.TL:
        case MOTOR_INPUT.TR:
        case MOTOR_INPUT.BL:
        case MOTOR_INPUT.BR:
            frpyInputs = directToFrpy(directInputs);
            directInputs = frpyToDirect(frpyInputs);
            break;

        case MOTOR_INPUT.FORWARD:
        case MOTOR_INPUT.ROLL:
        case MOTOR_INPUT.PITCH:
        case MOTOR_INPUT.YAW:
            directInputs = frpyToDirect(frpyInputs);
            frpyInputs = directToFrpy(directInputs);
            break;
    }

    $(`#${MOTOR_INPUT.FORWARD}`)[0].input = frpyInputs[0];
    $(`#${MOTOR_INPUT.ROLL}`)[0].input = frpyInputs[1];
    $(`#${MOTOR_INPUT.PITCH}`)[0].input = frpyInputs[2];
    $(`#${MOTOR_INPUT.YAW}`)[0].input = frpyInputs[3];
    $(`#${MOTOR_INPUT.TL}`)[0].input = directInputs[0];
    $(`#${MOTOR_INPUT.TR}`)[0].input = directInputs[1];
    $(`#${MOTOR_INPUT.BL}`)[0].input = directInputs[2];
    $(`#${MOTOR_INPUT.BR}`)[0].input = directInputs[3];
    
    // console.log(frpyInputs, directInputs, e);
    

    await sendAction(controlCenterState.port, ACTION_IDS.SET_MOTOR_SPEEDS, {
        speeds: directInputs
    });

    lastSetInputs = Date.now();
})

function setAllDisplays(voltages, currents, inputs) {
    if (Date.now() - lastSetInputs < 1000) return;

    $(`#${MOTOR_INPUT.TL}`)[0].set_displays(voltages[0], currents[0], inputs[0]);
    $(`#${MOTOR_INPUT.TR}`)[0].set_displays(voltages[1], currents[1], inputs[1]);
    $(`#${MOTOR_INPUT.BL}`)[0].set_displays(voltages[2], currents[2], inputs[2]);
    $(`#${MOTOR_INPUT.BR}`)[0].set_displays(voltages[3], currents[3], inputs[3]);

    frpyVoltages = directToFrpy(voltages);
    frpyCurrents = directToFrpy(currents);
    frpyInputs = directToFrpy(inputs);

    $(`#${MOTOR_INPUT.FORWARD}`)[0].set_displays(frpyVoltages[0], frpyCurrents[0], frpyInputs[0]);
    $(`#${MOTOR_INPUT.ROLL}`)[0].set_displays(frpyVoltages[1], frpyCurrents[1], frpyInputs[1]);
    $(`#${MOTOR_INPUT.PITCH}`)[0].set_displays(frpyVoltages[2], frpyCurrents[2], frpyInputs[2]);
    $(`#${MOTOR_INPUT.YAW}`)[0].set_displays(frpyVoltages[3], frpyCurrents[3], frpyInputs[3]);


}

$("#zeroOutMotorInputs").on("click", () => {
    directInputs = [0, 0, 0, 0];

    $(`#${MOTOR_INPUT.TL}`)[0].input = directInputs[0];
    $(`#${MOTOR_INPUT.TR}`)[0].input = directInputs[1];
    $(`#${MOTOR_INPUT.BL}`)[0].input = directInputs[2];
    $(`#${MOTOR_INPUT.BR}`)[0].input = directInputs[3];
    $(`#${MOTOR_INPUT.BR}`).trigger("change");
});