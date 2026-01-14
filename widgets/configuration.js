const CURRENT_CONFIG_ID = "--current-config-autosave--";
const DEFAULT_CONFIG_ID = "Default Configuration";
const UPLOADED_CONFIG_ID = "Uploaded Configuration";
const LOCAL_STORAGE_CONFIG_KEY = "configurations";

const configurationsString = localStorage.getItem(LOCAL_STORAGE_CONFIG_KEY);

if (configurationsString != null) {
    controlCenterState.configurations = JSON.parse(configurationsString);
}

let configs = controlCenterState.configurations; // ref to configurations in controlCenterState

configs[DEFAULT_CONFIG_ID] = {
    readonly: true,
    mag: {
        bias: [0, 0, 0],
        scale: [1, 1, 1]
    },
    imu: {
        accBias: [0, 0, 0],
        accScale: [1, 1, 1],
        gyrBias: [0, 0, 0]
    },
    pid: {
        roll: {proportional: 1, integral: 0, derivative: 0.7, min: -10, max: 10},
        pitch: {proportional: 1, integral: 0, derivative: 0.7, min: -10, max: 10},
        yaw: {proportional: 1, integral: 0, derivative: 0.7, min: -10, max: 10},
        depth: {proportional: 1, integral: 0, derivative: 0.7, min: -10, max: 10},
    },
    localization: {
        madgwickBeta: 0.1
    },
    motors: {
        maximumDuty: 0.7,
        dutyScaler: 1.0
    },
}

if (!(CURRENT_CONFIG_ID in configs)) {
    configs[CURRENT_CONFIG_ID] = window.structuredClone(configs[DEFAULT_CONFIG_ID]);
}

configs[CURRENT_CONFIG_ID].readonly = false;

configs[UPLOADED_CONFIG_ID] = window.structuredClone(configs[DEFAULT_CONFIG_ID]);

setHtmlFromConfiguration(configs[CURRENT_CONFIG_ID]);

function setHtmlFromConfiguration(configObj, prefix = "", readonly = false) {
    if (configObj == null) return;

    if (typeof configObj == "object") {
        if ("readonly" in configObj && configObj["readonly"]) readonly = true;

        for (key in configObj) {
            if (key == "readonly") continue;

            setHtmlFromConfiguration(configObj[key], `${prefix}${(prefix.length > 0) ? "-" : ""}${key}`, readonly);
        }
    } else if ($(`#${prefix}`).length > 0) {
        let rangeInput = $(`#${prefix}`)[0];

        rangeInput.setAttribute("disabled", readonly);
        if (typeof rangeInput.input == "undefined") {
            rangeInput.setAttribute("default", configObj);
        } else {
            rangeInput.input[0].value = rangeInput.formatFloat(configObj);
        }
    }
}

function updateConfigurationFromHtml(config) {
    for (let configInput of $(".config-input")) {
        if (configInput.id.length == 0) continue;

        let keys = configInput.id.split("-");
        let configObj = config;

        while (keys.length > 1) {
            if (!(keys[0] in configObj)) {
                configObj[keys[0]] = {};
            } 

            configObj = configObj[keys[0]];
            keys.shift();
        }

        if (keys.length == 1) {
            configObj[keys[0]] = parseFloat(configInput.input[0].value);
        }
    }
}

// ------- Configuration Select/Load/Save/Delete -------
function setConfigDropdownOptions() {
    let dropdown = $("#configOptions");
    dropdown.empty();

    for (let configId in configs) {
        if (configId == CURRENT_CONFIG_ID) continue;
        // if (configId == UPLOADED_CONFIG_ID && controlCenterState.state == NOT_CONNECTED) continue;

        let option = $(`<option value="${configId}">${configId}${("readonly" in configs[configId] && configs[configId]["readonly"]) ? " (Read-Only)" : ""}</option>`);
        dropdown.append(option);
    }
}

setConfigDropdownOptions();

// disable load btn if the name doesn't match an existing config, disable save btn if the name matches a read-only config
updateAfterConfigNameChange = () => {
    let selectedConfigId = $("#configOptionsDatalist").val();
    
    if (selectedConfigId in configs) {
        $("#btnLoadConfig").prop("disabled", false);
        let notSavable = ("readonly" in configs[selectedConfigId] && configs[selectedConfigId]["readonly"]);

        $("#btnSaveConfig").prop("disabled", notSavable);
        $("#btnDeleteConfig").prop("disabled", notSavable);
    } else {
        $("#btnLoadConfig").prop("disabled", true);
        $("#btnDeleteConfig").prop("disabled", true);
        $("#btnSaveConfig").prop("disabled", selectedConfigId.length == 0);
    }
}
$("#configOptionsDatalist").on("change", updateAfterConfigNameChange);
$("#configOptionsDatalist").on("keyup", updateAfterConfigNameChange);

$("#btnSaveConfig").on("click", () => {
    let selectedConfigId = $("#configOptionsDatalist").val();
    updateConfigurationFromHtml(configs[CURRENT_CONFIG_ID]);

    configs[selectedConfigId] = window.structuredClone(configs[CURRENT_CONFIG_ID]);
    configs[selectedConfigId].readonly = false;

    $("#configOptionsDatalist").trigger("change");

    setConfigDropdownOptions();
});

$("#btnLoadConfig").on("click", async () => {
    let selectedConfigId = $("#configOptionsDatalist").val();

    if (selectedConfigId == UPLOADED_CONFIG_ID) {
        await sendAction(controlCenterState.port, ACTION_IDS.SEND_CONFIG);

        let msg = await recieveWait({isExpectedMessage: (msg) => msg.id == MESSAGE_IDS.SEND_CONFIG});
        
        configs[UPLOADED_CONFIG_ID] = msg.config;
        configs[UPLOADED_CONFIG_ID].readonly = true;
        configs[CURRENT_CONFIG_ID] = window.structuredClone(configs[UPLOADED_CONFIG_ID]);
        configs[CURRENT_CONFIG_ID].readonly = false;
        setHtmlFromConfiguration(configs[CURRENT_CONFIG_ID]);
    } else if (selectedConfigId in configs) {
        configs[CURRENT_CONFIG_ID] = window.structuredClone(configs[selectedConfigId]);
        configs[CURRENT_CONFIG_ID].readonly = false;

        setHtmlFromConfiguration(configs[CURRENT_CONFIG_ID]);
    }
});

$("#btnDeleteConfig").on("click", () => {
    let selectedConfigId = $("#configOptionsDatalist").val();
    if ((selectedConfigId in configs) && !(("readonly" in configs[selectedConfigId]) && configs[selectedConfigId]["readonly"])) {
        delete configs[selectedConfigId];

        setConfigDropdownOptions();
        $("#configOptionsDatalist").trigger("change");
    }
});

// ------- Configuration Setting Dropdown -------
$("#configSettingsDropdown").on("change", (e) => {
    let selected = e.target.value;

    $(".configDataGroup").hide();
    $(`#${selected}`).show();
})

$("#configSettingsDropdown").trigger("change");


$(".config-input").on("change", () => {
    updateConfigurationFromHtml(configs[CURRENT_CONFIG_ID]);
})

// ------- More configuration setup -------
$("#btnUploadConfig").on("click", async () => {
    sendConfiguration(controlCenterState.port, configs[CURRENT_CONFIG_ID]);
});

// ------- Save configurations to localStorage on unload -------
window.onbeforeunload = () => {
    delete configs[DEFAULT_CONFIG_ID];
    delete configs[UPLOADED_CONFIG_ID];

    localStorage.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify(configs));
}