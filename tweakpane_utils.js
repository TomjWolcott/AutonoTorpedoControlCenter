import { Pane } from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js';

/**
 * Description of the function
 * @name InitWidgetFn
 * @function
 * @param {Pane} pane
*/

/**
 * @typedef {Object} WidgetDef
 * @property {string} name
 * @property {Object} paneSettings - Contains the settings for the pane
 * @property {InitWidgetFn} initWidget
 * @property {boolean} onlyOne - wether or not multiple windows can be open at the same time
 */

/**
 * @typedef {Object} widget
 * @property {WidgetDef} def
 * @property {string} id
 */

const registeredWidgets = {};
const openWidgets = []

function generateID() {
	return Math.random() + "-" + Math.random();
}

/**
 * Will be called by modules in the widgets folder, to register their widgets
 * @param {WidgetDef|null} widgetDef
 */
export function registerWidgets(widgetDef = null) {
	if (widgetDef == null) { return; }

	registeredWidgets[widgetDef.name] = {
		def: widgetDef,
		id: generateID()
	};
}

function spawnWidget(spawnPosOpt = null, widget) {
	const pane = new Pane({title: widget.name, ...widget.paneSettings});
	pane.element.pane = pane;
	pane.widget = widget;
	openWidgets.push(pane);
	widget.initWidget(spawnPosOpt);
}

// Replace right click context window with options for widgets to spawn,
// and also give the usual options too ---------
const widgetArea = $("#widgetArea");

widgetArea.on("contextmenu", (e) => {
	const contextMenu = new Pane();

	for (const [name, widget] of Object.entries(registeredWidgets)) {
		contextMenu.addButton({
			title: name,
			disabled: widget.onlyOne && openWidgets.some(pane => pane.widget.id == widget.id)
		}).on('click', () => {
			spawnWidget([e.pageX, e.pageY], widget);
		});
	}

	// hr

	// save workflow
});

// hide context menu

// Handle spawning windows with a good size and location --------
function getSpawnDefaults() {
	// loop through windows and find unoccupied screen realestate

	// select size based off of window size and available space

	return {
		size: [200, 200],
		position: [200, 200]
	}
}

// Handle dragging & resizing tweakpane windows -----------------------------
const DragType = { Resize: 0, Move: 1 };
let dragSelection = null;

const paneHeaderEls = $(".tp-rotv_b");
const paneEls = $(".tp-rotv");

paneHeaderEls.on("onmousedown", (e) => {
	if (dragSelection == null || dragSelection.type >= DragType.Move) {
		dragSelection = {
			pane: e.target.parent.pane,
			type: DragType.Move,
			initialPos: [e.pageX, e.pageY]
		};
	}
})

paneEls.on("mousemove", (e) => {
	
});

paneEls.on("mouseout", (e) => {

});

const EDGE_TOLERANCE = 5;

function getEdgeIndex(pos, bb) {
	let isOnLeftEdge = (pos.x <= bb.x + EDGE_TOLERANCE && pos.x - bb.x < bb.width / 2);
	let isOnRightEdge = (bb.x + bb.width - EDGE_TOLERANCE <= pos.x && pos.x - bb.x > bb.width / 2);
	let isOnTopEdge = (pos.y <= bb.y + EDGE_TOLERANCE && pos.y - bb.y < bb.height / 2);
	let isOnBottomEdge = (bb.y + bb.height - EDGE_TOLERANCE <= pos.y && pos.y - bb.y > bb.height / 2);
}

paneEls.on("onmousedown", (e) => {
	let pane = e.target.pane;
	let pos = [e.pageX, e.pageY];

	let edgeIndex = getEdgeIndex(pos, e.target.getBoundingClientRect());

	if (edgeIndex > 0 && (dragSelection == null || dragSelection.type >= DragType.Resize)) {
		dragSelection = {
			pane: e.target.parent.pane,
			type: DragType.Move,
			initialPos: pos
		};
	}
});

paneEls.on("onmouseup", (e) => {
	let pane = e.target.pane;
});

document.addEventListener("onmousemove", (e) => {
	if (paneEdgeHovering.pane != null) {
		// expand and resize the window
	} else if (selectedWindow != null) {
		// move the window
	}
});

document.addEventListener("onmouseup", () => {
	selectedWindow
});