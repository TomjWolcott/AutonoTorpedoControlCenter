// parent class for action queue items, each item in the action queue will be an instance of a subclass of this
class ActionQueueItem {
    constructor(type) {
        this.type = type;
        this.id = queueItemIdCounter++;
        this.item = null; // this will hold the html element for this item in the queue once spawned
    }

    spawn() {
        this.item.prop("itemID", this.id);
        this.item.css("background", colors[this.id % colors.length]);

        this.item.find(".actionQueueDeleteButton").on("click", () => {
            let index = actionQueueItems.findIndex(queueItem => queueItem.id == this.id);
            if (index != -1) {
                actionQueueItems.splice(index, 1);
            }

            this.item.remove();
            setActionQueueItems();
        });

        $("#actionQueueArea").append(this.item);

        unsortedItems.push(this);
        setActionQueueItems();
    }

    toU8Array() {
        // to be overwritten by subclasses, should return a u8 array representing this item to be sent to the torpedo
    }

    fromU8Array(data) {
        // to be overwritten by subclasses, should set the properties of this item based on the data array (inverse of toU8Array)
    }

    itemlessClone() {
        let item = this.item;
        delete this.item;
        let clone = structuredClone(this);
        this.item = item;
        return clone;
    }

    asJson() {
        let item = this.item;
        delete this.item;
        let json = JSON.stringify(this);
        this.item = item;
        return json;
    }

    static fromObject(data) {
        let obj;

        switch (data.type) {
            case ACTION_QUEUE_ITEM.WAIT:
                obj = Object.assign(new WaitMs(), data);
                break;
            case ACTION_QUEUE_ITEM.WAIT_FOR:
                obj = Object.assign(new WaitFor(), data);
                break;
            case ACTION_QUEUE_ITEM.SET_MOVING_MODE:
                obj = Object.assign(new SetMovingMode(), data);
                break;
            case ACTION_QUEUE_ITEM.START_RECORDING:
                obj = Object.assign(new StartRecording(), data);
                break;
            case ACTION_QUEUE_ITEM.STOP_RECORDING:
                obj = Object.assign(new StopRecording(), data);
                break;
            default:
                throw new Error("Invalid action queue item type");
        }

        obj.id = queueItemIdCounter++; // assign a new unique ID when loading from json to avoid conflicts

        return obj;
    }
}

function setActionQueueItems() {
    actionQueueItems = [];

    for (let i = 0; i < actionQueueArea.children.length; i++) {
        let itemID = $(actionQueueArea.children[i]).prop("itemID");
        let item = unsortedItems.find(item => item.id == itemID);
        if (item) {
            actionQueueItems.push(item);
        }
    }

    saveCurrent();
}

function saveCurrent() {
    savedActionQueues[CURRENT_AQ_ID] = actionQueueItems.map(item => ("itemlessClone" in item) ? item.itemlessClone() : item); // store clones of the items without the html element to avoid issues with circular references when saving to json

    let json = savedActionQueueToJson();
    localStorage.setItem(LOCAL_STORAGE_AQ_KEY, json);
}

function savedActionQueueToJson() {
    let json = JSON.stringify(savedActionQueues);
    return json;
}

function clearActionQueueArea() {
    $("#actionQueueArea").empty();
    unsortedItems = [];
    actionQueueItems = [];
}

function loadActionQueue(newActionQueueItems) {
    clearActionQueueArea();
    let aq = newActionQueueItems.map(item => ActionQueueItem.fromObject(item));
    unsortedItems = [...aq];
    actionQueueItems = [...aq];
    for (let i = 0; i < aq.length; i++) {
        aq[i].spawn();
    }
}

const ACTION_QUEUE_ITEM = {
    "WAIT": 0,
    "WAIT_FOR": 1,
    "SET_MOVING_MODE": 2,
    "START_RECORDING": 3,
    "STOP_RECORDING": 4
}

// add queue item options to select
$("#addActionQueueItemSelect").append(new Option("Wait(____ ms)", ACTION_QUEUE_ITEM.WAIT));
$("#addActionQueueItemSelect").append(new Option("WaitFor(___)", ACTION_QUEUE_ITEM.WAIT_FOR));
$("#addActionQueueItemSelect").append(new Option("SetMovingMode(___)", ACTION_QUEUE_ITEM.SET_MOVING_MODE));
$("#addActionQueueItemSelect").append(new Option("StartRecording { dataToBeSaved }", ACTION_QUEUE_ITEM.START_RECORDING));
$("#addActionQueueItemSelect").append(new Option("StopRecording", ACTION_QUEUE_ITEM.STOP_RECORDING));

queueItemIdCounter = 0; // global counter to assign unique IDs to queue items, used for editing specific items in the queue

/* The overall workflow here is that class will be spawned with default values when the user clicks the add button, 
then the user can edit the values and those will be stored in the instance of the class. 
When the user clicks save, the entire action queue will be serialized (json) and sent to localStorage, 
later it can be loaded from localStorage.  The user will also be able to upload the current action queue to the torpedo, 
which will require conversion to a u8 array (each item should define this).  
The inverse of this process happens when Uploaded queue is selected and loaded.*/

// Wait(___ ms)
class WaitMs extends ActionQueueItem {
    constructor() {
        super(ACTION_QUEUE_ITEM.WAIT);
        this.ms = 1000;
    }

    spawn() {
        this.item = $(`<li class="actionQueueItem">
            <div class="actionQueueItemContent">
                <span class="actionQueueItemHandle">::</span>
                <div>Wait(<input type="number" value="${this.ms}"> ms)</div>
            </div>
            <button type="button" class="btn btn-danger actionQueueDeleteButton"><i class="bi bi-trash"></i></button>
        </li>`);

        let input = this.item.find("input");
        
        input.on("change", (e) => {
            console.log(this, parseInt(e.target.value));
            this.ms = parseInt(e.target.value);
            saveCurrent();
        });

        input.on("keyup", (e) => {
            this.ms = parseInt(e.target.value);
            saveCurrent();
        });

        super.spawn();
    }

    toU8Array() {
        let array = new Uint8Array(6);
        array[0] = this.type;
        array[1] = 6;
        let msArray = new Uint8Array(new Uint32Array([this.ms]).buffer);
        array.set(msArray, 2);
        return array;
    }

    fromU8Array(data) {
        if (data[0] != this.type) {
            throw new Error("Invalid type");
        } else if (data[1] != 6) {
            throw new Error("Invalid length");
        }

        let msArray = data.slice(2, 6);
        this.ms = new Uint32Array(msArray.buffer)[0];
    }
}

    // ...

// WaitFor(___)
const ACTION_QUEUE_EVENT = {
    "UNDERWATER": { id: 0, name: "Underwater" },
    "UPSIDEDOWN": { id: 1, name: "Upside down" },
    "BIG_MAGNET_NEARBY": { id: 2, name: "Big magnet nearby" },
    "SURFACED": { id: 3, name: "Surfaced" }
};

class WaitFor extends ActionQueueItem {
    constructor() {
        super(ACTION_QUEUE_ITEM.WAIT_FOR);
        this.event = ACTION_QUEUE_EVENT.UPSIDEDOWN.id;
    }

    spawn() {
        this.item = $(`<li class="actionQueueItem">
            <div class="actionQueueItemContent">
                <span class="actionQueueItemHandle">::</span>
                <div>WaitFor(
                    <select>
                        ${Object.entries(ACTION_QUEUE_EVENT).map(([key, value]) => 
                            `<option value="${value.id}" ${this.event == value.id ? "selected" : ""}>${value.name}</option>`
                        ).join("")}
                    </select>
                )</div>
            </div>
            <button type="button" class="btn btn-danger actionQueueDeleteButton"><i class="bi bi-trash"></i></button>
        </li>`);

        this.item.find("select").on("change", (e) => {
            this.event = parseInt(e.target.value);
            saveCurrent();
        });

        super.spawn();
    }

    toU8Array() {
        let array = new Uint8Array(3);
        array[0] = this.type;
        array[1] = 3;
        array[2] = this.event;
        return array;
    }

    fromU8Array(data) {
        if (data[0] != this.type) {
            throw new Error("Invalid type");
        } else if (data[1] != 3) {
            throw new Error("Invalid length");
        }
        this.event = data[2];
    }
}

// SetMovingMode(___)
const MOVING_MODE = {
    "NONE": {id: 0, name: "None" },
    "HOLDING_PATTERN": { id: 1, name: "Holding pattern" },
    "FORWARD": { id: 2, name: "Forward" }, // TODO: Add the option to put additional parameters here
    "RETURN_TO_SURFACE": { id: 3, name: "Return to surface" },
    "VERTICAL_ROLL_CL_TEST": { id: 4, name: "Vertical roll control loop test" }
}

class SetMovingMode extends ActionQueueItem {
    constructor() {
        super(ACTION_QUEUE_ITEM.SET_MOVING_MODE);
        this.mode = MOVING_MODE.NONE.id;
    }

    spawn() {
        this.item = $(`<li class="actionQueueItem">
            <div class="actionQueueItemContent">
                <span class="actionQueueItemHandle">::</span>
                <div>SetMovingMode(
                    <select>
                        ${Object.entries(MOVING_MODE).map(([key, value]) => 
                            `<option value="${value.id}" ${this.mode == value.id ? "selected" : ""}>${value.name}</option>`
                        ).join("")}
                    </select>
                )</div>
            </div>
            <button type="button" class="btn btn-danger actionQueueDeleteButton"><i class="bi bi-trash"></i></button>
        </li>`);

        this.item.find("select").on("change", (e) => {
            this.mode = parseInt(e.target.value);
            saveCurrent();
        });

        super.spawn();
    }

    toU8Array() {
        let array = new Uint8Array(3);
        array[0] = this.type;
        array[1] = 3;
        array[2] = this.mode;
        return array;
    }

    fromU8Array(data) {
        if (data[0] != this.type) {
            throw new Error("Invalid type");
        } else if (data[1] != 3) {
            throw new Error("Invalid length");
        }
        this.mode = data[2];
    }
}

// use checkboxes
// StartRecording { [_] video, [_] localizationData, [_] rawData, [_] powerUssageData }

class StartRecording extends ActionQueueItem {
    constructor() {
        super(ACTION_QUEUE_ITEM.START_RECORDING);
        this.dataToBeSaved = {
            video: false,
            localizationData: false,
            rawData: false,
            powerUsageData: false
        }
    }

    spawn() {
        this.item = $(`<li class="actionQueueItem">
            <div class="actionQueueItemContent">
                <span class="actionQueueItemHandle">::</span>
                <div>
                    SetRecording {
                        <br><label class="AQI-SR-video" style="margin-left: 10px;"><input type="checkbox" ${this.dataToBeSaved.video ? "checked" : ""}> video</label>, 
                        <label class="AQI-SR-localizationData"><input type="checkbox" ${this.dataToBeSaved.localizationData ? "checked" : ""}> localizationData</label>,
                        <br><label class="AQI-SR-rawData" style="margin-left: 10px;"><input type="checkbox" ${this.dataToBeSaved.rawData ? "checked" : ""}> rawData</label>, 
                        <label class="AQI-SR-powerUsageData"><input type="checkbox" ${this.dataToBeSaved.powerUsageData ? "checked" : ""}> powerUsageData</label>
                    <br>}
                </div>
            </div>
            <button type="button" class="btn btn-danger actionQueueDeleteButton"><i class="bi bi-trash"></i></button>
        </li>`);

        this.item.find("input[type='checkbox']").on("change", (e) => {
            let checkbox = $(e.target);
            let label = checkbox.parent().attr("class").split("AQI-SR-")[1];

            if (label == "video") {
                this.dataToBeSaved.video = checkbox.prop("checked");
            } else if (label == "localizationData") {
                this.dataToBeSaved.localizationData = checkbox.prop("checked");
            } else if (label == "rawData") {
                this.dataToBeSaved.rawData = checkbox.prop("checked");
            } else if (label == "powerUsageData") {
                this.dataToBeSaved.powerUsageData = checkbox.prop("checked");
            }

            saveCurrent();
        });

        super.spawn();
    }

    toU8Array() {
        let array = new Uint8Array(5);
        array[0] = this.type;
        array[1] = 5;
        array[2] = 
            (this.dataToBeSaved.video ? 1 : 0) | 
            (this.dataToBeSaved.localizationData ? 2 : 0) | 
            (this.dataToBeSaved.rawData ? 4 : 0) | 
            (this.dataToBeSaved.powerUsageData ? 8 : 0);
        array[3] = 0; // reserved for future use
        array[4] = 0; // reserved for future use
        return array;
    }

    fromU8Array(data) {
        if (data[0] != this.type) {
            throw new Error("Invalid type");
        } else if (data[1] != 5) {
            throw new Error("Invalid length");
        }

        let bitfield = data[2] | (data[3] << 8) | (data[4] << 16); // in case we need more than 8 options in the future, we can use the reserved bytes
        this.dataToBeSaved.video = (bitfield & 1) != 0;
        this.dataToBeSaved.localizationData = (bitfield & 2) != 0;
        this.dataToBeSaved.rawData = (bitfield & 4) != 0;
        this.dataToBeSaved.powerUsageData = (bitfield & 8) != 0;
    }
}


// StopRecording (no parameters needed for this one, it just stops the recording started by StartRecording)
class StopRecording extends ActionQueueItem {
    constructor() {
        super(ACTION_QUEUE_ITEM.STOP_RECORDING);
    }

    spawn() {
        this.item = $(`<li class="actionQueueItem">
            <div class="actionQueueItemContent">
                <span class="actionQueueItemHandle">::</span>
                <div>StopRecording</div>
            </div>
            <button type="button" class="btn btn-danger actionQueueDeleteButton"><i class="bi bi-trash"></i></button>
        </li>`);

        super.spawn();
    }

    toU8Array() {
        let array = new Uint8Array(2);
        array[0] = this.type;
        array[1] = 2;
        return array;
    }

    fromU8Array(data) {
        if (data[0] != this.type) {
            throw new Error("Invalid type");
        } else if (data[1] != 2) {
            throw new Error("Invalid length");
        }
    }
}

$("#addActionQueueItemSelect").on("change", (e) => {
    let selected = parseInt(e.target.value);
    $("#addActionQueueItemBtn").prop("disabled", (selected == -1));
});

$("#addActionQueueItemBtn").on("click", () => {
    let selected = parseInt($("#addActionQueueItemSelect").val());

    if (selected == -1) return;

    switch (selected) {
        case ACTION_QUEUE_ITEM.WAIT:
            (new WaitMs()).spawn();
            break;

        case ACTION_QUEUE_ITEM.WAIT_FOR:
            (new WaitFor()).spawn();
            break;

        case ACTION_QUEUE_ITEM.SET_MOVING_MODE:
            (new SetMovingMode()).spawn();
            break;

        case ACTION_QUEUE_ITEM.START_RECORDING:
            (new StartRecording()).spawn();
            break;
        case ACTION_QUEUE_ITEM.STOP_RECORDING:
            (new StopRecording()).spawn();
            break;
    }
});

// saving, loading, and queue deleting logic
function updateAQOptions() {
    let options = Object.entries(savedActionQueues)
        .filter(([key, value]) => key != CURRENT_AQ_ID)
        .map(([key, value]) => 
            `<option value="${key}">${value.name || key}</option>`
        ).join("");

    $("#actionQueueOptions").html(options);
}

function updateActionQueueNameChange(e) {
    let selected = e.target.value;

    if (selected in savedActionQueues) {
        $("#btnLoadActionQueue").prop("disabled", false);
        $("#btnDeleteActionQueue").prop("disabled", savedActionQueues[selected].readonly == true);
        $("#btnSaveActionQueue").prop("disabled", savedActionQueues[selected].readonly == true);
    } else {
        $("#btnLoadActionQueue").prop("disabled", true);
        $("#btnDeleteActionQueue").prop("disabled", true);
        $("#btnSaveActionQueue").prop("disabled", selected.length == 0);
    }
}

$("#actionQueueOptionsDatalist").on("change", updateActionQueueNameChange);
$("#actionQueueOptionsDatalist").on("keyup", updateActionQueueNameChange);

$("#btnLoadActionQueue").on("click", async () => {
    let selected = $("#actionQueueOptionsDatalist").val();

    if (selected == UPLOADED_AQ_ID) {
        // load from torpedo
        // sendAction(...)
    } else if (selected in savedActionQueues) {
        loadActionQueue(savedActionQueues[selected]);
    }
    saveCurrent();
});

// save 
$("#btnSaveActionQueue").on("click", () => {
    let actionQueueSelected = $("#actionQueueOptionsDatalist").val();

    if (actionQueueSelected in savedActionQueues && !savedActionQueues[actionQueueSelected].readonly) {
        savedActionQueues[actionQueueSelected] = actionQueueItems.map(item => ("itemlessClone" in item) ? item.itemlessClone() : item);
        savedActionQueues[actionQueueSelected].readonly = false;
        $("#btnLoadActionQueue").prop("disabled", false);
    } else if (!(actionQueueSelected in savedActionQueues)) {
        savedActionQueues[actionQueueSelected] = actionQueueItems.map(item => ("itemlessClone" in item) ? item.itemlessClone() : item);
        savedActionQueues[actionQueueSelected].readonly = false;
        $("#btnLoadActionQueue").prop("disabled", false);
    }

    localStorage.setItem(LOCAL_STORAGE_AQ_KEY, savedActionQueueToJson());

    updateAQOptions();
});

$("#btnDeleteActionQueue").on("click", () => {
    let actionQueueSelected = $("#actionQueueOptionsDatalist").val();
    if (actionQueueSelected in savedActionQueues && !savedActionQueues[actionQueueSelected].readonly) {
        delete savedActionQueues[actionQueueSelected];
        localStorage.setItem(LOCAL_STORAGE_AQ_KEY, savedActionQueueToJson());
        updateAQOptions();
        $("#actionQueueOptionsDatalist").trigger("change");
    }
});



const CURRENT_AQ_ID = "--current-aq-autosave--";
const DEFAULT_AQ_ID = "Default AQ";
const UPLOADED_AQ_ID = "Uploaded AQ";
const LOCAL_STORAGE_AQ_KEY = "actionQueues";

// random pastel colors for queue items to distinguish them, 
const colors = [
    "#ffb3ba22",
    "#ffdfba22",
    "#ffffba22",
    "#baffc922",
    "#bae1ff22"
];

var actionQueueArea = document.getElementById('actionQueueArea');
var sortable = Sortable.create(actionQueueArea, {
    handle: '.actionQueueItemHandle', // handle's class
    animation: 150,
    onSort: setActionQueueItems
});

let unsortedItems = [];
let actionQueueItems = [];
let savedActionQueues = localStorage.getItem(LOCAL_STORAGE_AQ_KEY) ? JSON.parse(localStorage.getItem(LOCAL_STORAGE_AQ_KEY)) : {};

if (!savedActionQueues[DEFAULT_AQ_ID]) savedActionQueues[DEFAULT_AQ_ID] = [];
savedActionQueues[DEFAULT_AQ_ID].readonly = true;
savedActionQueues[DEFAULT_AQ_ID].name = "Default Action Queue";

if (savedActionQueues[CURRENT_AQ_ID]) {
    loadActionQueue(savedActionQueues[CURRENT_AQ_ID]);
} else {
    savedActionQueues[CURRENT_AQ_ID] = [];
}

if (!savedActionQueues[UPLOADED_AQ_ID]) savedActionQueues[UPLOADED_AQ_ID] = [];
savedActionQueues[UPLOADED_AQ_ID].readonly = true;

updateAQOptions();