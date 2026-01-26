let activeRangeInput = null;

class RangeInput extends HTMLElement {
    constructor() { 
        super();

        let width = this.getAttribute("width");
        width = (width == null) ? "60px" : width;

        let defaultValue = this.getAttribute("default");
        defaultValue = (defaultValue == null) ? 1.0 : defaultValue;

        this.type = this.getAttribute("type");

        this.span = $(`<span style="user-select: none; cursor: ew-resize; padding-left: 5px;" onmousedown="spanMouseDown">↔</span>`);
        this.input = $(`
        <input type="${(this.type=="display") ? "text" : "number"}" class="configInput" value="${this.formatFloat(defaultValue)}" style="
            text-align: center; 
            width: ${width}; 
            background: none; 
            border: 0; 
            padding: 0; 
            margin: 0;
        ">`);

        this.span[0].onmousedown = (e) => {
            activeRangeInput = {
                rangeInput: this,
                lastPosX: e.x,
                delta: (this.getAttribute("delta") == null) ? 0.01 : this.getAttribute("delta")
            };
        }

        this.input[0].onblur = () => {
            let val = parseFloat(this.input[0].value);
            val = (val == null) ? 0 : val;

            this.input[0].value = this.formatFloat(val);
        }

        this.div = $(`
        <div style="
            border: 0; 
            border-radius: 5px; 
            background: #8884; 
            width: fit-content; 
            padding: 0;
            margin: 2px;
            display: inline-flex;
        "></div>`);

        this.div.append(this.span);
        this.div.append(this.input);
        
        this.appendChild(this.div[0]);

        this.attributeChangedCallback("disabled", null, this.getAttribute("disabled"));
    }

    attributeChangedCallback(name, _, newValue) {
        if (name == "disabled") {
            if (newValue != "false") {
                this.span[0].style.display = "none";
                this.input[0].disabled = true;
                if (this.type == "display") this.input[0].style.color = "#fff";
            } else {
                this.span[0].style.display = "inline-flex";
                this.input[0].disabled = false;
                if (this.type == "display") this.input[0].style.color = "";
            }
        }
    }

    formatFloat(value) {
        let {min, max, fixed} = this.formattingOptions();

        return Math.min(max, Math.max(min, value)).toFixed(fixed);
    }
    setVal(value) {
        if (typeof value === "number")
            this.input[0].value = this.formatFloat(value);
        else
            this.input[0].value = value;
    }

    getVal() {
        return parseFloat(this.input[0].value);
    }

    formattingOptions() {
        return {
            fixed: (this.getAttribute("fixed") == null) ? 2 : parseInt(this.getAttribute("fixed")),
            min: (this.getAttribute("min") == null) ? 0 : parseInt(this.getAttribute("min")),
            max: (this.getAttribute("max") == null) ? 1 : parseInt(this.getAttribute("max")),
        }
    }

}

document.addEventListener("mousemove", (e) => {
    if (activeRangeInput != null) {
        console.log("hi", activeRangeInput);
        let {
            lastPosX,
            rangeInput,
            delta
        } = activeRangeInput;

        if (e.shiftKey) delta *= 10;
        if (e.ctrlKey || e.metaKey) delta *= 0.1;
        
        let prevVal = parseFloat(rangeInput.input[0].value);
        rangeInput.input[0].value = rangeInput.formatFloat(prevVal + delta * (e.x - lastPosX));

        activeRangeInput.lastPosX = e.x;
        $(rangeInput).trigger("change");
    }
})

document.addEventListener("mouseup", () => {
    activeRangeInput = null;
})

customElements.define('range-input', RangeInput);