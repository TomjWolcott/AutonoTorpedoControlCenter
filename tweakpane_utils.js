import { Pane } from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js';

const pane = new Pane({
    container: document.getElementById('tweakpane-tabs'),
});

const configBtn = pane.addButton({
  title: 'Configuration'
});

const plottingBtn = pane.addButton({
  title: 'Plotting'
});

const pane2 = new Pane({
    container: document.getElementById('tweakpane-windows'),
    title: 'Configuration',
});

const PARAMS = {speed: 0.5};

pane2.addBinding(PARAMS, 'speed');


