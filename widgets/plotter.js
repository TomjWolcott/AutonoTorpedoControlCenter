const DIM_TYPE = {
    NONE: "none",
    DIM2: "2d",
    DIM3: "3d",
    DIM4: "4d"
};

const axisSettings = {
    t: { label: "Time (s)" },
    accX: { label: "Acceleration X (g)" },
    accY: { label: "Acceleration Y (g)" },
    accZ: { label: "Acceleration Z (g)" },
    gyrX: { label: "Gyroscope X (°/s)" },
    gyrY: { label: "Gyroscope Y (°/s)" },
    gyrZ: { label: "Gyroscope Z (°/s)" },
    magX: { label: "Magnetometer X (nT)" },
    magY: { label: "Magnetometer Y (nT)" },
    magZ: { label: "Magnetometer Z (nT)" },
    batt_v: { label: "Battery Voltage (V)" },
    temp_c: { label: "Temperature (°C)" },
    pos_x: { label: "Position X (m)" },
    pos_y: { label: "Position Y (m)" },
    pos_z: { label: "Position Z (m)" },
    yaw: { label: "Yaw (°)" },
    pitch: { label: "Pitch (°)" },
    roll: { label: "Roll (°)" },
    pressure: { label: "Pressure (Pa)" },
    temperature: { label: "Temperature (°C)" }
}

const MAX_DATA_POINTS = 500;

let plotSettings = {
    type: DIM_TYPE.DIM2,
    xAxis: null,
    yAxis: null,
    zAxis: null,
    colorAxis: null,
    currentPlot: null,
    sparsenessFactor: 1,
    numDataPoints: 0
};

let isPlotSettingsValid = () => {
    if (plotSettings.type == DIM_TYPE.DIM2) {
        return plotSettings.xAxis != null && plotSettings.yAxis != null && plotSettings.yAxis.length > 0;
    } else if (plotSettings.type == DIM_TYPE.DIM3) {
        return plotSettings.xAxis != null && plotSettings.yAxis != null && plotSettings.zAxis != null && plotSettings.zAxis.length > 0;
    } else if (plotSettings.type == DIM_TYPE.DIM4) {
        return plotSettings.xAxis != null && plotSettings.yAxis != null && plotSettings.zAxis != null && plotSettings.colorAxis != null && plotSettings.colorAxis.length > 0;
    } else {
        return false;
    }
};

$("#plotDimDropdown").on("change", () => {
    let selectedDim = $("#plotDimDropdown").val();
    let plotArea = $("#plot-area");
    
    plotArea.empty();

    $("#btn-export-selection-csv").prop("disabled", selectedDim == "none");
    $("#btn-export-all-csv").prop("disabled", selectedDim == "none");

    plotSettings.type = selectedDim;

    if (selectedDim == DIM_TYPE.DIM2) {
        $(".plot-axes-container").show();
        $(".plot-axis-3-container").hide();
        $(".plot-axis-4-container").hide();
        $("#plot-axis-2").prop("multiple", true);
        $("#plot-axis-3").prop("multiple", false);
        $("#plot-axis-4").prop("multiple", false);
        initializePlot();

    } else if (selectedDim == DIM_TYPE.DIM3) {
        $(".plot-axes-container").show();
        $(".plot-axis-3-container").show();
        $(".plot-axis-4-container").hide();
        $("#plot-axis-2").prop("multiple", false);
        $("#plot-axis-3").prop("multiple", true);
        $("#plot-axis-4").prop("multiple", false);
        initializePlot();

    } else if (selectedDim == DIM_TYPE.DIM4) {
        $(".plot-axes-container").show();
        $(".plot-axis-3-container").show();
        $(".plot-axis-4-container").show();
        $("#plot-axis-2").prop("multiple", false);
        $("#plot-axis-3").prop("multiple", false);
        $("#plot-axis-4").prop("multiple", true);
        initializePlot();

    } else {
        plotArea.append(`<div class="d-flex justify-content-center align-items-center" style="width:100%;height:100%;">No plot selected</div>`);
        $(".plot-axes-container").hide();
        $(".plot-axis-3-container").hide();
        $(".plot-axis-4-container").hide();
    }
});

$(".plot-axis-options").on("change", () => {
    let selectedDim = $("#plotDimDropdown").val();

    plotSettings.type = selectedDim;
    plotSettings.xAxis = $("#plot-axis-1").val();
    plotSettings.yAxis = $("#plot-axis-2").val();
    plotSettings.zAxis = $("#plot-axis-3").val();
    plotSettings.colorAxis = $("#plot-axis-4").val();
    initializePlot();
});

let getDataPointSparsenessFactor = (numPoints) => {
    if (numPoints <= MAX_DATA_POINTS) {
        return 1;
    } else {
        return 2 ** Math.floor(1 + Math.log2(numPoints / MAX_DATA_POINTS));
    }
};

function getData(axes, firstAxisRange = [-Infinity, Infinity]) {
    let filteredData = {};
    
    for (let axis of axes) {
        filteredData[axis] = [];
    }
    for (let i = 0; i < controlCenterState.data.t.length; i++) {
        let xValue = controlCenterState.data[axes[0]][i];

        if (xValue >= firstAxisRange[0] && xValue <= firstAxisRange[1]) {
            for (let axis of axes) {
                filteredData[axis].push(controlCenterState.data[axis][i]);
            }
        }
    }

    if (filteredData[axes[0]].length > MAX_DATA_POINTS) {
        let sparsenessFactor = getDataPointSparsenessFactor(filteredData[axes[0]].length);

        for (let axis of axes) {
            let averagedData = [];
            for (let i = 0; i < filteredData[axis].length; i += sparsenessFactor) {
                let avg = filteredData[axis].slice(i, i + sparsenessFactor).reduce((a, b) => a + b, 0) / Math.min(sparsenessFactor, filteredData[axis].length - i);
                averagedData.push(avg);
            }
            filteredData[axis] = averagedData;
        }
    }

    return filteredData;
}
function initializePlot() {
    let plotArea = $("#plot-area");
    plotArea.empty();

    if (!isPlotSettingsValid()) {
        plotSettings.currentPlot = null;
        plotArea.append(`<div class="d-flex justify-content-center align-items-center" style="width:100%;height:100%;">Axes not fully selected</div>`);
        return;
    }

    let depAxes = (plotSettings.type == DIM_TYPE.DIM2) ? plotSettings.yAxis :
                  (plotSettings.type == DIM_TYPE.DIM3) ? plotSettings.zAxis :
                  (plotSettings.type == DIM_TYPE.DIM4) ? plotSettings.colorAxis : null;

    depAxes = (Array.isArray(depAxes)) ? depAxes : [depAxes];

    let filteredData = getData([plotSettings.xAxis].concat(depAxes));

    plotSettings.sparsenessFactor = getDataPointSparsenessFactor(filteredData[plotSettings.xAxis].length);
    plotSettings.numDataPoints = filteredData[plotSettings.xAxis].length;
    
    let traces = depAxes.map(depAxis => {
        let trace = {
            x: filteredData[plotSettings.xAxis],
            mode: 'lines+markers',
            type: 'scatter',
            name: depAxis,
            marker: { size: 6 }
        };

        if (plotSettings.type == DIM_TYPE.DIM2) {
            trace.y = filteredData[depAxis];
        } else if (plotSettings.type == DIM_TYPE.DIM3) {
            trace.y = filteredData[plotSettings.yAxis];

            trace.z = filteredData[depAxis];
            trace.type = 'scatter3d';
        } else if (plotSettings.type == DIM_TYPE.DIM4) {
            trace.y = filteredData[plotSettings.yAxis];
            trace.z = filteredData[plotSettings.zAxis];
            trace.marker.color = filteredData[depAxis];
            trace.marker.colorbar = { title: axisSettings[depAxis].label };
            trace.marker.colorscale = 'Viridis';
            trace.type = 'scatter3d';
        }

        return trace;
    });

    let layout = {
        autosize: true,
        xaxis: { title: {text: axisSettings[plotSettings.xAxis].label} },
        yaxis: { title: {text: (Array.isArray(plotSettings.yAxis) && plotSettings.yAxis.length > 1) ? "" : axisSettings[plotSettings.yAxis].label}}
    };

    if (plotSettings.type == DIM_TYPE.DIM3 || plotSettings.type == DIM_TYPE.DIM4) {
        layout.zaxis = { title: {text: (Array.isArray(plotSettings.zAxis) && plotSettings.zAxis.length > 1) ? "" : axisSettings[plotSettings.zAxis].label} };
    }

    plotSettings.currentPlot = plotArea[0];
    Plotly.newPlot(plotArea[0], traces, layout);
}

function updatePlot(newDataStartIndex) {
    if (plotSettings.currentPlot == null) return;

    // if (getDataPointSparsenessFactor(plotSettings.numDataPoints) != plotSettings.sparsenessFactor) {
    //     initializePlot();
    //     return;
    // }

    // if (plotSettings.sparsenessFactor > 1) {
    //     if (newDataStartIndex % plotSettings.sparsenessFactor != 0) {
    //         return;
    //     }

    //     newDataStartIndex = Math.floor(newDataStartIndex / plotSettings.sparsenessFactor);
    // }

    let depAxes = (plotSettings.type == DIM_TYPE.DIM2) ? plotSettings.yAxis :
                  (plotSettings.type == DIM_TYPE.DIM3) ? plotSettings.zAxis :
                  (plotSettings.type == DIM_TYPE.DIM4) ? plotSettings.colorAxis : null;

    depAxes = (Array.isArray(depAxes)) ? depAxes : [depAxes];

    let traceIndices = depAxes.map((_, i) => i);
    let traceUpdates = {x: [] , y: []};

    if (plotSettings.type == DIM_TYPE.DIM4) {
        traceUpdates['marker.color'] = [];
    }
    
    if (plotSettings.type == DIM_TYPE.DIM3 || plotSettings.type == DIM_TYPE.DIM4) {
        traceUpdates.z = [];
    }

    for (let depAxis of depAxes) {
        traceUpdates.x.push(controlCenterState.data[plotSettings.xAxis].slice(newDataStartIndex));

        if (plotSettings.type == DIM_TYPE.DIM2) {
            traceUpdates.y.push(controlCenterState.data[depAxis].slice(newDataStartIndex));
        } else if (plotSettings.type == DIM_TYPE.DIM3) {
            traceUpdates.y.push(controlCenterState.data[plotSettings.yAxis].slice(newDataStartIndex));
            traceUpdates.z.push(controlCenterState.data[depAxis].slice(newDataStartIndex));
        } else if (plotSettings.type == DIM_TYPE.DIM4) {
            traceUpdates.y.push(controlCenterState.data[plotSettings.yAxis].slice(newDataStartIndex));
            traceUpdates.z.push(controlCenterState.data[plotSettings.zAxis].slice(newDataStartIndex));
            traceUpdates['marker.color'].push(controlCenterState.data[depAxis].slice(newDataStartIndex));
        }
    }

    // plotSettings.numDataPoints += newDataStartIndex;

    Plotly.extendTraces(plotSettings.currentPlot, traceUpdates, traceIndices);
}

$("#plotDimDropdown").trigger("change");

for (const axisSelect of $(".plot-axis-options")) {
    for (const key in controlCenterState.data) {
        $(axisSelect).append(`<option value="${key}">${key}</option>`);
    }
}

$("#btn-export-all-csv").on("click", () => {
    let content = "data:text/csv;charset=utf-8,";
    let headers = Object.keys(controlCenterState.data).map(key => axisSettings[key].label);
    content += headers.join(",") + "\n";
    let numRows = controlCenterState.data.t.length;

    for (let i = 0; i < numRows; i++) {
        let row = Object.keys(controlCenterState.data).map(key => controlCenterState.data[key][i]);
        content += row.join(",") + "\n";
    }

    let encodedUri = encodeURI(content);
    let link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ATCC_${new Date().toISOString()}_data.csv`);
    document.body.appendChild(link); // Required for FF

    link.click();
    document.body.removeChild(link);
});

$("#btn-clear-all").on("click", () => {
    for (const key in controlCenterState.data) {
        controlCenterState.data[key] = [];
    }
    initializePlot();
});