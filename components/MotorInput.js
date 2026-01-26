//   Create a component for a motor input that includes a vertical slider that 
// ranges from -1 to 1 that snaps to 0.  The slider should use a triangle for 
// the slider handle.  To the right of the slider, there should be (in a column)
// a label at the top, a range input for the motor input value, and a range 
// input display showing the current consumption in amps.  The component should,
// all in all be a square aspect ratio.  The label is the only input at the 
// start and the motor input value is kept synced with the slider.  The current
// input is assigned elsewhere.

import './RangeInput.js';

class MotorInput extends HTMLElement {
    constructor() {
        super();

        const shadow = this.attachShadow({mode: 'open'});

        let label = this.getAttribute("label");

        shadow.innerHTML = `
            <style>
                .motor-input-container {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: center;
                    margin: 10px 20px;
                }

                .slider-wrapper {
                    border-top: 3px solid #999;
                    border-bottom: 3px solid #999;
                    padding: 0 5px 0 5px;
                    margin-right: 25px;
                    margin-left: 5px;
                    display: flex;
                    position: relative;
                }
                .slider-mid-bar {
                    position: absolute;
                    top: 50%;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: #999;
                    transform: translateY(-50%);
                    z-index: 1;
                }
                input[type=range] {
                    -webkit-appearance: none;
                    writing-mode: sideways-lr; /* vertical orientation */
                    width: 3px;
                    margin: 0;
                    z-index: 2;
                    background: #999;
                }
                input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 0;
                    height: 0;
                    border-bottom: 10px solid transparent;
                    border-top: 10px solid transparent;
                    border-right: 15px solid #ccc;
                    cursor: pointer;
                    transform: translateX(6px);
                    z-index: 2;
                }
                .info-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }

                /*TODO: Do range input properly so it doesn't need css on the outside*/
                .configInput {
                    padding:0px;
                    margin: 2px 4px;
                    width: 80px;
                    text-align: center;
                    border: 0;
                    border-radius: 5px;
                }

                .configInput::-webkit-outer-spin-button,
                .configInput::-webkit-inner-spin-button {
                    /* display: none; <- Crashes Chrome on hover */
                    -webkit-appearance: none;
                    margin: 0; /* <-- Apparently some margin are still there even though it's hidden */
                }

                .configInput[type=number] {
                    -moz-appearance:textfield; /* Firefox */
                }
            </style>
            <div class="motor-input-container">
                <div class="slider-container">
                    <div class="slider-wrapper">
                        <input type="range" min="-1" max="1" step="0.01" value="0" id="motor-slider">
                        <span class="slider-mid-bar"></span>
                    </div>
                </div>
                <div class="info-container">
                    <div id="motor-label">${label}</div>
                    <range-input id="motor-value" width="50px" default="0" min="-1" max="1" fixed="2" disabled="false"></range-input>
                    <span><range-input type="display" id="motor-voltage" width="60px" default="0"></range-input> <span style="width: 15px">V</span></span>
                    <span><range-input type="display" id="motor-current" width="60px" default="0"></range-input> <span style="width: 15px">A</span></span>
                    <span><range-input type="display" id="motor-power" width="60px" default="0"></range-input> <span style="width: 15px">W</span></span>
                </div>
            </div>
        `;

        this.slider = shadow.getElementById('motor-slider');
        this.motorValueInput = shadow.getElementById('motor-value');

        // Sync slider and motor value input
        this.slider.addEventListener('input', () => {
            if (Math.abs(parseFloat(this.slider.value)) < 0.1) {
                this.slider.value = 0;
            }

            this.motorValueInput.input[0].value = parseFloat(this.slider.value).toFixed(2);

            $(this).trigger("change");
        });

        console.log(this.motorValueInput, $(this.motorValueInput));

        $(this.motorValueInput).on('change', () => {
            console.log("hi2");
            let val = parseFloat(this.motorValueInput.input[0].value);
            if (isNaN(val)) val = 0;
            val = Math.max(-1, Math.min(1, val)); // clamp between -1 and 1
            this.slider.value = val;
            this.motorValueInput.input[0].value = val.toFixed(2);

            $(this).trigger("change");
        });
    }

    set label(text) {
        this.shadowRoot.getElementById('motor-label').innerText = text;
    }

    set input(input) {
        this.shadowRoot.getElementById('motor-value').input[0].value = input.toFixed(2);
        this.slider.value = parseFloat(input);
    }

    get input() {
        return parseFloat(this.shadowRoot.getElementById('motor-value').input[0].value);
    }

    set_displays(voltage, current) {
        this.shadowRoot.getElementById('motor-voltage').input[0].value = voltage.toFixed(2);
        this.shadowRoot.getElementById('motor-current').input[0].value = current.toFixed(2);
        this.shadowRoot.getElementById('motor-power').input[0].value = (voltage * current).toFixed(2);
    }
}

customElements.define('motor-input', MotorInput);