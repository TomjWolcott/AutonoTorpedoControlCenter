// NOTE: The torpedo can only communicate to the website when it is plugged in via USB!!

/* Magnetometer Calibration Sequence:
    1. (Step 1 tab) User reads instructions.
    2. (Step 1 tab) User clicks next to go to Step 2.

    3. (Step 2 tab) User reads instructions, selects either "Calibrate while plugged in" or "Unplug to calibrate", and sets `totalTimeSeconds`
        a. If "Unplug to calibrate" is selected, user also sets `waitSecondsAfterUnplug` and `datapointsPerSecond`.
        b. If "Calibrate while plugged in" is selected a 3d scatter plot of live data is shown as the user moves the torpedo around.
    3. (Step 2 tab) Website waits for all data to be sent from the torpedo.
    4. (Step 2 tab) User unplugs torpedo, LED turns on after `waitSecondsAfterUnplug` seconds and turns off after `totalTimeSeconds` seconds.
    5. (Step 2 tab) During this time the torpedo collects and stores magnetometer data points.
    6. (Step 2 tab) After `totalTimeSeconds` seconds, the torpedo stops collecting data and turns off the LED.
    7. (Step 2 tab) User plugs torpedo back in and all data is transferred, website detects reconnection or the data collection is done.

    8. (Step 3 tab) Data from the torpedo and loads it into a plotly 3d scatter plot for visualization alongside any previously collected data.
    9. (Step 3 tab) The user looks at the data and can approve, reject it, or collect more data.
       a. Approve => Go to Step 4 tab
       b. Reject => Go back to Step 1 tab
       c. Collect more data => Go back to Step 2 tab

    10. (Step 4 tab) The user selects `calibrationType` (ellipse fit or min/max) and clicks "Compute Calibration".
    11. (Step 4 tab) The results are also shown in this tab with the newly centered and scaled data in the 3D viewer, the user can adjust these parameters themselves and as they adjust them the plot is automatically updated.
    12. (Step 4 tab) The user can click Accept Calibration or cancel.
*/

const magnetometerModal = $(`<div class="modal fade" id="magCalibration" tabindex="-1" aria-labelledby="magCalibrationLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="magCalibration-calibration">Magnetometer Calibration</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div id="step1-tab">
                    <div class="d-flex flex-column">
                        <b>Step 1:</b>
                        <p>
                            Rotate the torpedo in all directions to capture magnetic field data. 
                            Follow the on-screen instructions to ensure accurate calibration.
                        </p>
                        <button type="button" class="btn btn-primary mb-3" id="step1-next-mag">Start Calibration</button>
                    </div>
                </div>
                <div id="step2-tab" style="display: none;">
                    <div class="d-flex flex-column">
                        <b>Step 2:</b>
                        <p>
                            Select your calibration mode and settings below to begin data collection.
                        </p>
                        <label for="totalTimeSeconds" class="form-label">Total Calibration Time (Seconds)</label>
                        <input type="number" class="form-control" id="totalTimeSeconds" value="30" min="10" max="300">
                        <hr>
                        <select id="magCalStartMode" class="form-select" aria-label="Calibration Start Mode">
                            <option value="pluggedIn" selected>Calibrate While Plugged In</option>
                            <option value="unplugToCalibrate">Unplug to Calibrate</option>
                        </select>
                        <div style="padding-left: 10px;">
                            <div class="dataGroup" id="magCalStartPluggedIn">
                                <p>
                                    Click "Start Calibration" to begin collecting data while plugged in.  
                                    Make sure to rotate the torpedo in all directions, the collected data will be shown in the preview below.
                                </p>
                                <b>Preview of Live Data:</b>
                                <div id="magCalLiveDataPlot" style="width: 300px; height: 300px; border: 1px solid #ccc; margin-bottom: 20px;"></div>
                                <button type="button" class="btn btn-primary" id="startMagCalBtn">Start Calibration</button>
                            </div>
                            <div class="dataGroup" id="magCalStartUnplugged" style="display: none;">
                                <p>
                                    Unplug the torpedo to begin data collection. 
                                    After the specified wait time, the LED will turn on to indicate that calibration is in progress.  
                                    Make sure to rotate the torpedo in all directions during this time.
                                    After the total calibration time, the LED will turn off, and you can plug the torpedo back in to transfer the data.
                                </p>
                                <div class="row mb-3 w-100"> 
                                    <div class="col">
                                        <label for="waitSecondsAfterUnplug" class="form-label">Wait Time After Unplug (Seconds)</label>
                                        <input type="number" class="form-control" id="waitSecondsAfterUnplug" value="5" min="2" max="60">
                                    </div>
                                    <div class="col">
                                        <label for="dataAcquisitionRate" class="form-label">Data Acquisition Rate (Hz)</label>
                                        <input type="number" class="form-control" id="dataAcquisitionRate" value="5" min="1" max="100">
                                    </div>
                                </div>
                                <div class="d-flex align-items-center" id="magCalStatus">
                                    <span>Waiting for data</span>   
                                    <div class="spinner-border" role="status" style="width: 1.5rem; height: 1.5rem; margin-left: 10px;">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="step3-tab" style="display: none;">
                
                </div>
                <div id="step4-tab" style="display: none;">...</div>
            </div>
        </div>
    </div>
</div>`);

$("body").append(magnetometerModal);

const magCalModal = new bootstrap.Modal(magnetometerModal[0]);
const magCalTabs = [
    $("#step1-tab"),
    $("#step2-tab"),
    $("#step3-tab"),
    $("#step4-tab")
];

$("#startMagCalBtn").on("click", () => {
    magCalModal.show();
    magCalTabs[0].show();
    magCalTabs[1].hide();
    magCalTabs[2].hide();
    magCalTabs[3].hide();
});

// ------------------------------------------- Page 1
$("#step1-next-mag").on("click", () => {
    // Move to Step 2 tab
    magCalTabs[0].hide();
    magCalTabs[1].show();

    // Initialize Step 2 contents
    // initMagCalStep2();
});

// ------------------------------------------- Page 2
$("#magCalStartMode").on("change", (e) => {
    const mode = e.target.value;

    if (mode == "pluggedIn") {
        $("#magCalStartPluggedIn").show();
        $("#magCalStartUnplugged").hide();
    } else if (mode == "unplugToCalibrate") {
        $("#magCalStartPluggedIn").hide();
        $("#magCalStartUnplugged").show();
    }
});