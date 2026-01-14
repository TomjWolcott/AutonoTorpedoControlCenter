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

/* CALIBRATION TASK ON TORPEDO:
	void __NO_RETURN calibrationRoutine(void *parameters) {
		Message msg;
		std::optional<std::vector<Vec3>> data_opt = std::nullopt;
		HAL_GPIO_WritePin(GPIOB, GPIO_PIN_9, GPIO_PIN_RESET);

		printCalibRoutine(0, msg);

		while (1) {
			msg = Message::receiveWait([](Message &msg) {
				return msg.type() == MESSAGE_TYPE_ACTION && msg.asAction().type() == ACTION_TYPE_CALIBRATION_SETTINGS;
			});

			printCalibRoutine(1, msg);

			CalibrationSettings settings = msg.asAction().asCalibrationSettings();
			bool isUnplugged = settings.startSignal == CALIBRATION_START_SIGNAL_ON_UNPLUG;

			while (1) {
				std::optional<Message> msg_opt = Message::receiveWait(WAIT_FOR_UNPLUG_MS);
				printCalibRoutine(2, msg);

				if (!msg_opt.has_value() && isUnplugged) {
					osDelay(pdMS_TO_TICKS(settings.waitMsAfterUnplug));
					break;
				}

				if (!msg_opt.has_value()) { continue; }

				msg = msg_opt.value();

				if (
					msg.type() == MESSAGE_TYPE_ACTION &&
					msg.asAction().type() == ACTION_TYPE_CALIBRATION_MSG &&
					msg.asAction().asCalibrationMsg() == CALIBRATION_MSG_START
				) { break; }

				if (
					msg.type() == MESSAGE_TYPE_ACTION &&
					msg.asAction().type() == ACTION_TYPE_CALIBRATION_SETTINGS
				) {
					settings = msg.asAction().asCalibrationSettings();
				}
			}
			printCalibRoutine(3, msg);

			HAL_GPIO_WritePin(GPIOB, GPIO_PIN_9, GPIO_PIN_SET);

			uint32_t startTime = HAL_GetTick();
			uint32_t loopStartTime;
			uint32_t waitBetweenMeasurements = 1000 / settings.dataCollectRateHz;

			while (HAL_GetTick() - startTime < settings.dataCollectTimeMs) {
				loopStartTime = HAL_GetTick();

				Vec3 vector;

				auto lock = dataMutex.get_lock();
				switch (settings.type) {
				case CALIBRATION_TYPE_MAG: {
					AK09940A_Output mag_output = lock->ak09940a_dev.single_measure_raw();
					for (int i = 0; i < 3; i++) {
						vector[i] = static_cast<float>(mag_output.mag[i]);
					}
					break;
				} case CALIBRATION_TYPE_ACC: {
					ICM42688_Data icm_data = lock->icm42688_dev.get_data_raw();
					for (int i = 0; i < 3; i++) {
						vector[i] = icm_data.acc[i];
					}
					break;
				} case CALIBRATION_TYPE_GYR: {
					ICM42688_Data icm_data = lock->icm42688_dev.get_data_raw();
					for (int i = 0; i < 3; i++) {
						vector[i] = icm_data.gyro[i];
					}
					break;
				} default: {
					vector = {0.0f, 0.0f, 0.0f};
				}}
				lock.unlock();

				if (isUnplugged) {
					data_opt.value().push_back(vector);
				} else {
					Message::sendCalibrationData(std::span{&vector, 1}, false).send();
				}

				osDelay(waitBetweenMeasurements - (HAL_GetTick() - loopStartTime));
			}

			HAL_GPIO_WritePin(GPIOB, GPIO_PIN_9, GPIO_PIN_RESET);

			if (isUnplugged) {
				Message::receiveWait();
				uint32_t index = 0;
				std::span<Vec3> data_span = data_opt.value();

				const uint32_t maxVec3PerMessage = 250 / 12;

				while (index + maxVec3PerMessage < data_span.size()) {
					Message::sendCalibrationData(data_span.subspan(index, index + maxVec3PerMessage), false).send();

					index += maxVec3PerMessage;
				}

				Message::sendCalibrationData(data_span.subspan(index, data_span.size()), true).send();
			} else {
				Message::sendCalibrationData(std::span<Vec3>(), true).send();
			}
			printCalibRoutine(4, msg);

			msg = Message::receiveWait([](Message &msg) {
				return msg.type() == MESSAGE_TYPE_ACTION &&
					   msg.asAction().type() == ACTION_TYPE_CALIBRATION_MSG && (
						   msg.asAction().asCalibrationMsg() == CALIBRATION_MSG_DONE ||
						   msg.asAction().asCalibrationMsg() == CALIBRATION_MSG_GO_AGAIN
					   );
			});

			printCalibRoutine(5, msg);

			CalibrationMsgType calibrationMessage = msg.asAction().asCalibrationMsg();

			if (calibrationMessage == CALIBRATION_MSG_DONE) {
				break;
			} else if (calibrationMessage == CALIBRATION_MSG_GO_AGAIN) {
				continue;
			} else {
				printf("DID NOT EXPECT calibrationMessage: %d", calibrationMessage);
			}
		}
		printCalibRoutine(6, msg);

		auto sm_lock = systemModesSM.get_lock();
		sm_lock->process_event(ConnectedMode::CalibrationStop {});
		sm_lock.unlock();

		osThreadExit();
	}
*/

/// Calibration modal HTML with the routine settings passed in
const calibrationModal = (rs) => {
    const t = rs.type;
    return $(`<div class="modal fade" id="calibrationModal-${t}" tabindex="-1" aria-labelledby="${t}CalibrationLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="${t}-calibration">${rs.text.name}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div id="step1-tab-${t}">
                    <div class="d-flex flex-column">
                        <b>Step 1:</b>
                        <p>${rs.text.step1}</p>
                        <button type="button" class="btn btn-primary mb-3" id="step1-next-${t}">Start Calibration</button>
                    </div>
                </div>
                <div id="step2-tab-${t}" style="display: none;">
                    <div class="d-flex flex-column">
                        <b>Step 2:</b>
                        <p>${rs.text.step2}</p>
                        <label for="totalTimeSeconds-${t}" class="form-label">Total Calibration Time (Seconds)</label>
                        <input type="number" class="form-control" id="totalTimeSeconds-${t}" value="30" min="10" max="300">
                        <hr>
                        <select id="calStartMode-${t}" class="form-select" aria-label="Calibration Start Mode">
                            <option value="pluggedIn" selected>Calibrate While Plugged In</option>
                            <option value="unplugToCalibrate">Unplug to Calibrate</option>
                        </select>
                        <div style="padding-left: 10px;">
                            <div class="dataGroup" id="startPluggedIn-${t}">
                                <p>
                                    Click "Start Calibration" to begin collecting data while plugged in.  
                                    Make sure to rotate the device in all directions, the collected data will be shown in the preview below.
                                </p>
                                <b>Preview of Live Data:</b>
                                <div id="liveDataPlot-${t}" style="width: 300px; height: 300px; border: 1px solid #ccc; margin-bottom: 20px;"></div>
                                <button type="button" class="btn btn-primary" id="startCalibration-${t}">Start Calibration</button>
                                <div id="calibCountdown-${t}" class="mt-2" style="display:none">Time left: <span id="countdownValue-${t}"></span>s</div>
                            </div>
                            <div class="dataGroup" id="startUnplugged-${t}" style="display: none;">
                                <p>
                                    Unplug the device to begin data collection. 
                                    After the specified wait time, the LED will turn on to indicate that calibration is in progress.  
                                    Make sure to rotate the device in all directions during this time.
                                    After the total calibration time, the LED will turn off, and you can plug the device back in to transfer the data.
                                </p>
                                <div class="row mb-3 w-100"> 
                                    <div class="col">
                                        <label for="waitSecondsAfterUnplug-${t}" class="form-label">Wait Time After Unplug (Seconds)</label>
                                        <input type="number" class="form-control" id="waitSecondsAfterUnplug-${t}" value="5" min="2" max="60">
                                    </div>
                                    <div class="col">
                                        <label for="dataAcquisitionRate-${t}" class="form-label">Data Acquisition Rate (Hz)</label>
                                        <input type="number" class="form-control" id="dataAcquisitionRate-${t}" value="5" min="1" max="100">
                                    </div>
                                </div>
                                <div class="d-flex align-items-center" id="waitingForUnplug-${t}">
                                    <span>Waiting for unplug</span>   
                                    <div class="spinner-border" role="status" style="width: 1.5rem; height: 1.5rem; margin-left: 10px;">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex align-items-center" id="waitingForData-${t}" style="display:none;">
                                <span>Waiting for data</span>   
                                <div class="spinner-border" role="status" style="width: 1.5rem; height: 1.5rem; margin-left: 10px;">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="step3-tab-${t}" style="display: none;">
                    <div class="d-flex flex-column">
                        <b>Step 3:</b>
                        <p>${rs.text.step3}</p>
                        <div id="collectedDataPlot-${t}" style="width: 400px; height: 400px; border: 1px solid #ccc; margin-bottom: 20px;"></div>
                        <button type="button" class="btn btn-secondary mb-3" id="removeOutliersBtn-${t}">Remove Outliers</button>
                        <div>
                            <button type="button" class="btn btn-success" id="approveCalBtn-${t}">Approve Calibration</button>
                            <button type="button" class="btn btn-danger" id="rejectCalBtn-${t}">Reject Calibration</button>
                            <button type="button" class="btn btn-secondary" id="collectMoreCalBtn-${t}">Collect More Data</button>
                        </div>
                    </div>
                </div>
                <div id="step4-tab-${t}" style="display: none;">
                    <div class="d-flex flex-column">
                        <b>Step 4:</b>
                        <p>${rs.text.step4}</p>
                        <div id="resultsPlot-${t}" style="width: 400px; height: 400px; border: 1px solid #ccc; margin-bottom: 20px;"></div>
                        <button type="button" class="btn btn-secondary mb-3" id="backToStep3Btn-${t}">Go Back to Step 3</button>
                        <div class="input-group mb-3">
                            ${(rs.includeScale) ? 
                                `<label class="input-group-text" for="calTypeSelect-${t}">Calibration Type</label>
                                <select class="form-select" id="calTypeSelect-${t}">
                                    <option value="ellipseFit" selected>Ellipse Fit</option>
                                    <option value="minMax">Min/Max</option>
                                </select>` : ""
                            }
                            <button class="btn btn-primary" type="button" id="computeCalBtn-${t}">Compute Calibration</button>
                        </div>
                        <div id="calResultsInputs-${t}">
                            <div>Bias: [
                                <range-input id="bias-0-calib-${t}" disabled="false" min="${rs.rangeInputSettings.biasMin}" max="${rs.rangeInputSettings.biasMax}" fixed="${rs.rangeInputSettings.biasFixed}" width="90px" delta="${rs.rangeInputSettings.biasDelta}" default="0"></range-input>${rs.units}, 
                                <range-input id="bias-1-calib-${t}" disabled="false" min="${rs.rangeInputSettings.biasMin}" max="${rs.rangeInputSettings.biasMax}" fixed="${rs.rangeInputSettings.biasFixed}" width="90px" delta="${rs.rangeInputSettings.biasDelta}" default="0"></range-input>${rs.units}, 
                                <range-input id="bias-2-calib-${t}" disabled="false" min="${rs.rangeInputSettings.biasMin}" max="${rs.rangeInputSettings.biasMax}" fixed="${rs.rangeInputSettings.biasFixed}" width="90px" delta="${rs.rangeInputSettings.biasDelta}" default="0"></range-input>${rs.units}
                            ]</div>
                            ${(rs.includeScale) ? 
                                `<div>Scale: [
                                    <range-input id="scale-0-calib-${t}" disabled="false" min="${rs.rangeInputSettings.scaleMin}" max="${rs.rangeInputSettings.scaleMax}" fixed="${rs.rangeInputSettings.scaleFixed}" width="90px" delta="${rs.rangeInputSettings.scaleDelta}"></range-input>, 
                                    <range-input id="scale-1-calib-${t}" disabled="false" min="${rs.rangeInputSettings.scaleMin}" max="${rs.rangeInputSettings.scaleMax}" fixed="${rs.rangeInputSettings.scaleFixed}" width="90px" delta="${rs.rangeInputSettings.scaleDelta}"></range-input>, 
                                    <range-input id="scale-2-calib-${t}" disabled="false" min="${rs.rangeInputSettings.scaleMin}" max="${rs.rangeInputSettings.scaleMax}" fixed="${rs.rangeInputSettings.scaleFixed}" width="90px" delta="${rs.rangeInputSettings.scaleDelta}"></range-input>
                                ]</div>` : ""
                            }
                        </div>
                        <div style="margin-top: 10px;">
                            <button type="button" class="btn btn-success" id="acceptFullCalBtn-${t}">Accept Calibration</button>
                            <button type="button" class="btn btn-secondary" id="cancelFullCalBtn-${t}">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>`);
};

CALIBRATION_ROUTINE_SETTINGS = {};
CALIBRATION_ROUTINE_SETTINGS[CALIBRATION_TYPES.MAGNETOMETER] = {
    type: CALIBRATION_TYPES.MAGNETOMETER,
    text: {
        name: "Magnetometer Calibration",
        step1: "This is the calibration routine for the magnetometer. Follow the on-screen instructions to ensure accurate calibration.",
        step2: "Select your calibration mode and settings below to begin data collection.  Make sure to rotate the torpedo in all directions during data collection.  Avoid large metal objects/magnetic fields nearby.",
        step3: "Review the collected magnetometer data in the 3D plot below. You can choose to approve the calibration, reject it and start over, or collect more data.",
        step4: "Compute and review the magnetometer calibration results below. You can adjust the calibration parameters manually if needed before accepting the calibration."
    },
    rangeInputSettings: {
        biasMin: -1000000,
        biasMax: 1000000,
        biasFixed: 0,
        biasDelta: 10,
        scaleMin: -1000000,
        scaleMax: 1000000,
        scaleFixed: 0,
        scaleDelta: 10,
        finalBiasIdPrefix: "mag-bias-",
        finalScaleIdPrefix: "mag-scale-",
    },
    includeScale: true,
    units: "nT",
};
CALIBRATION_ROUTINE_SETTINGS[CALIBRATION_TYPES.ACCELEROMETER] = {
    type: CALIBRATION_TYPES.ACCELEROMETER,
    text: {
        name: "Accelerometer Calibration",
        step1: "This is the calibration routine for the accelerometer. Follow the on-screen instructions to ensure accurate calibration.",
        step2: "Select your calibration mode and settings below to begin data collection.  Make sure to slowly rotate the torpedo in all directions during data collection.  Avoid sudden movements.",
        step3: "Review the collected accelerometer data in the 3D plot below. You can choose to approve the calibration, reject it and start over, or collect more data.",
        step4: "Compute and review the accelerometer calibration results below. You can adjust the calibration parameters manually if needed before accepting the calibration."
    },
    rangeInputSettings: {
        biasMin: -10,
        biasMax: 10,
        biasFixed: 4,
        biasDelta: 0.1,
        scaleMin: -10,
        scaleMax: 10,
        scaleFixed: 4,
        scaleDelta: 0.1,
        finalBiasIdPrefix: "imu-accBias-",
        finalScaleIdPrefix: "imu-accScale-",  
    },
    includeScale: true,
    units: "g",
};
CALIBRATION_ROUTINE_SETTINGS[CALIBRATION_TYPES.GYROSCOPE] = {
    type: CALIBRATION_TYPES.GYROSCOPE,
    text: {
        name: "Gyroscope Calibration",
        step1: "This is the calibration routine for the gyroscope. Follow the on-screen instructions to ensure accurate calibration.",
        step2: "Select your calibration mode and settings below to begin data collection.  Make sure the torpedo is completely stationary during data collection.",
        step3: "Review the collected gyroscope data in the 3D plot below. You can choose to approve the calibration, reject it and start over, or collect more data.",
        step4: "Compute and review the gyroscope calibration results below. You can adjust the calibration parameters manually if needed before accepting the calibration."
    },
    rangeInputSettings: {
        biasMin: -500,
        biasMax: 500,
        biasFixed: 3,
        biasDelta: 1,
        finalBiasIdPrefix: "imu-gyrBias-",
    },
    includeScale: false,
    units: "°/s",
};


$("body").append(calibrationModal(CALIBRATION_ROUTINE_SETTINGS[CALIBRATION_TYPES.MAGNETOMETER]));
$("body").append(calibrationModal(CALIBRATION_ROUTINE_SETTINGS[CALIBRATION_TYPES.ACCELEROMETER]));
$("body").append(calibrationModal(CALIBRATION_ROUTINE_SETTINGS[CALIBRATION_TYPES.GYROSCOPE]));

// ------------------------------------------- Start Calibration (main UI buttons)
// Assuming #startMagCalBtn / #startAccCalBtn / #startGyroCalBtn exist elsewhere in the app
$("#startMagCalBtn").on("click", () => startCalibration(CALIBRATION_TYPES.MAGNETOMETER));
$("#startAccCalBtn").on("click", () => startCalibration(CALIBRATION_TYPES.ACCELEROMETER));
$("#startGyroCalBtn").on("click", () => startCalibration(CALIBRATION_TYPES.GYROSCOPE));

// ------------------------------------------- Generic per-routine state & helpers
let currentRoutine = null; // { rs, modalInstance, tabs:[], calibrationSettings, checkInterval, calibrationData, countdownTimer }

function idFor(name) {
    return `#${name}-${currentRoutine.rs.type}`;
}
function el(name) {
    return $(idFor(name));
}

function startCalibration(type) {
    const rs = CALIBRATION_ROUTINE_SETTINGS[type];
    // show modal
    currentRoutine = {
        rs,
        modalInstance: new bootstrap.Modal($(`#calibrationModal-${type}`)[0]),
        tabs: [
            $(`#step1-tab-${type}`),
            $(`#step2-tab-${type}`),
            $(`#step3-tab-${type}`),
            $(`#step4-tab-${type}`)
        ],
        calibrationSettings: {
            type: rs.type,
            startSignal: CALIBRATION_START_SIGNAL.NOW,
            dataCollectTimeMs: 30000,
            waitMsAfterUnplug: 5000,
            dataCollectRateHz: 5
        },
        checkInterval: null,
        calibrationData: [],
        countdownTimer: null
    };

    // show step1
    currentRoutine.tabs[0].show();
    currentRoutine.tabs[1].hide();
    currentRoutine.tabs[2].hide();
    currentRoutine.tabs[3].hide();

    // bind step1-next for this routine
    $(`#step1-next-${type}`).off('click').on('click', async () => {
        // clear any prior data
        currentRoutine.calibrationData = [];
        await initializeStep2();
    });

    // show modal
    currentRoutine.modalInstance.show();
}

// ------------------------------------------- Page 2 (generalized)
async function initializeStep2() {
    const rs = currentRoutine.rs;
    const tabs = currentRoutine.tabs;
    tabs[0].hide();
    tabs[1].show();
    tabs[2].hide();
    tabs[3].hide();

    await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.START});

    // Reset Step 2 inputs
    $(`#totalTimeSeconds-${rs.type}`).val(currentRoutine.calibrationSettings.dataCollectTimeMs / 1000);
    $(`#waitSecondsAfterUnplug-${rs.type}`).val(currentRoutine.calibrationSettings.waitMsAfterUnplug / 1000);
    $(`#dataAcquisitionRate-${rs.type}`).val(currentRoutine.calibrationSettings.dataCollectRateHz);
    $(`#calStartMode-${rs.type}`).val("pluggedIn");
    $(`#startPluggedIn-${rs.type}`).show();
    $(`#startUnplugged-${rs.type}`).hide();

    $(`#waitingForUnplug-${rs.type}`).show();
    $(`#waitingForData-${rs.type}`).hide();
    $(`#startCalibration-${rs.type}`).prop("disabled", false);
    $(`#calibCountdown-${rs.type}`).hide();

    await new Promise(resolve => setTimeout(resolve, 100)); // wait for device

    await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, currentRoutine.calibrationSettings);

    // check for disconnection at regular intervals
    const checkIntervalMs = 500;
    if (currentRoutine.checkInterval) { clearInterval(currentRoutine.checkInterval); }
    currentRoutine.checkInterval = setInterval(async () => {
        if (!controlCenterState.port || !controlCenterState.port.readable) {
            $(`#waitingForUnplug-${rs.type}`).hide();
            $(`#waitingForData-${rs.type}`).show();
            startAwaitingData();
            clearInterval(currentRoutine.checkInterval);
            currentRoutine.checkInterval = null;
        }
    }, checkIntervalMs);

    // create plotly live data plot
    const liveDataLayout = { margin: { t: 0, b: 0, l: 0, r: 0 }, scene: { aspectmode: 'cube' } };
    Plotly.newPlot(`liveDataPlot-${rs.type}`, [{ x: [], y: [], z: [], mode: 'markers', type: 'scatter3d', marker: { size: 2, color: 'blue' } }], liveDataLayout);

    // rotate the plot over time for better viewing (store interval on routine to avoid duplicates)
    if (!currentRoutine._rotateInterval) {
        let angle = 0;
        currentRoutine._rotateInterval = setInterval(() => {
            angle += 0.01;
            const camera = { eye: { x: 1.5 * Math.cos(angle), y: 1.5 * Math.sin(angle), z: 1.5 } };
            Plotly.relayout(`liveDataPlot-${rs.type}`, { 'scene.camera': camera });
        }, 50);
    }

    // bind inputs for this routine
    $(`#totalTimeSeconds-${rs.type}`).off('change').on('change', (e) => {
        const totalTimeSeconds = parseInt(e.target.value);
        currentRoutine.calibrationSettings.dataCollectTimeMs = totalTimeSeconds * 1000;
        sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, currentRoutine.calibrationSettings);
    });

    $(`#waitSecondsAfterUnplug-${rs.type}`).off('change').on('change', (e) => {
        const waitSecondsAfterUnplug = parseInt(e.target.value);
        currentRoutine.calibrationSettings.waitMsAfterUnplug = waitSecondsAfterUnplug * 1000;
        sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, currentRoutine.calibrationSettings);
    });

    $(`#dataAcquisitionRate-${rs.type}`).off('change').on('change', (e) => {
        const dataAcquisitionRate = parseInt(e.target.value);
        currentRoutine.calibrationSettings.dataCollectRateHz = dataAcquisitionRate;
        sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, currentRoutine.calibrationSettings);
    });

    $(`#calStartMode-${rs.type}`).off('change').on('change', (e) => {
        const mode = e.target.value;
        if (mode == "pluggedIn") {
            $(`#startPluggedIn-${rs.type}`).show();
            $(`#startUnplugged-${rs.type}`).hide();
            currentRoutine.calibrationSettings.startSignal = CALIBRATION_START_SIGNAL.NOW;
        } else {
            $(`#startPluggedIn-${rs.type}`).hide();
            $(`#startUnplugged-${rs.type}`).show();
            currentRoutine.calibrationSettings.startSignal = CALIBRATION_START_SIGNAL.ON_UNPLUG;
        }
        sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, currentRoutine.calibrationSettings);
    });

    $(`#startCalibration-${rs.type}`).off('click').on('click', async () => {
        await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.START});
        $(`#startCalibration-${rs.type}`).prop("disabled", true);
        $(`#calibCountdown-${rs.type}`).show();

        // Start countdown timer
        let timeLeftMs = currentRoutine.calibrationSettings.dataCollectTimeMs;
        $(`#countdownValue-${rs.type}`).text((timeLeftMs / 1000).toString());

        if (currentRoutine.countdownTimer) { clearInterval(currentRoutine.countdownTimer); }
        currentRoutine.countdownTimer = setInterval(() => {
            timeLeftMs -= 100;
            $(`#countdownValue-${rs.type}`).text(Math.max(0, (timeLeftMs / 1000)).toString());
            if (timeLeftMs <= 0) {
                clearInterval(currentRoutine.countdownTimer);
                $(`#calibCountdown-${rs.type}`).hide();
                currentRoutine.countdownTimer = null;
            }
        }, 100);
        startAwaitingData();
    });
}

// ------------------------------------------- Awaiting data (general)
async function startAwaitingData() {
    const rs = currentRoutine.rs;
    let msg;
    do {
        msg = await recieveWait({isExpectedMessage: (msg) => msg.id == MESSAGE_IDS.CALIBRATION_DATA });
        console.log("Calibration data message received:", msg);
        currentRoutine.calibrationData = currentRoutine.calibrationData.concat(msg.vectors);

        // Update live data plot if in plugged in mode
        if (currentRoutine.calibrationSettings.startSignal == CALIBRATION_START_SIGNAL.NOW) {
            const xData = currentRoutine.calibrationData.map(v => v[0]);
            const yData = currentRoutine.calibrationData.map(v => v[1]);
            const zData = currentRoutine.calibrationData.map(v => v[2]);
            Plotly.update(`liveDataPlot-${rs.type}`, { x: [xData], y: [yData], z: [zData] });
        }
    } while (!msg.isComplete);

    // Move to Step 3 tab
    initializeStep3();
}

// ------------------------------------------- Page 3 (general)
function initializeStep3() {
    const rs = currentRoutine.rs;
    const tabs = currentRoutine.tabs;
    tabs[0].hide();
    tabs[1].hide();
    tabs[2].show();
    tabs[3].hide();

    if (currentRoutine.checkInterval != null) {
        clearInterval(currentRoutine.checkInterval);
        currentRoutine.checkInterval = null;
    }

    updateCollectedDataPlot();

    // bind page 3 buttons for this routine
    $(`#collectMoreCalBtn-${rs.type}`).off('click').on('click', async () => {
        await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.GO_AGAIN});
        await initializeStep2();
    });

    $(`#approveCalBtn-${rs.type}`).off('click').on('click', async () => {
        await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.DONE});
        initializeStep4();
    });

    $(`#rejectCalBtn-${rs.type}`).off('click').on('click', async () => {
        await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.DONE});
        // go back to step 1 (reset)
        currentRoutine.modalInstance.hide();
        startCalibration(rs.type);
    });

    $(`#removeOutliersBtn-${rs.type}`).off('click').on('click', () => {
        const data = currentRoutine.calibrationData;
        if (!data.length) return;
        const meanPoint = data.reduce((acc, val) => [acc[0] + val[0], acc[1] + val[1], acc[2] + val[2]], [0,0,0]).map(v => v / data.length);
        const distances = data.map(v => Math.sqrt((v[0]-meanPoint[0])**2 + (v[1]-meanPoint[1])**2 + (v[2]-meanPoint[2])**2));
        const meanDistance = distances.reduce((a,b)=>a+b,0)/distances.length;
        const stdDevDistance = Math.sqrt(distances.map(d => (d-meanDistance)**2).reduce((a,b)=>a+b,0)/distances.length);
        const threshold = 2 * stdDevDistance;
        currentRoutine.calibrationData = data.filter((v,i) => Math.abs(distances[i] - meanDistance) <= threshold);
        updateCollectedDataPlot();
    });
}

function updateCollectedDataPlot() {
    const rs = currentRoutine.rs;
    const data = currentRoutine.calibrationData;
    const xData = data.map(v => v[0]);
    const yData = data.map(v => v[1]);
    const zData = data.map(v => v[2]);
    const layout = { margin:{t:0,b:0,l:0,r:0}, scene:{aspectmode:'cube'} };
    Plotly.newPlot(`collectedDataPlot-${rs.type}`, [{ x:xData, y:yData, z:zData, mode:'markers', type:'scatter3d', marker:{size:2,color:'blue'} }], layout);
}

// ------------------------------------------- Page 4 (general)
function initializeStep4() {
    const rs = currentRoutine.rs;
    const tabs = currentRoutine.tabs;
    tabs[0].hide();
    tabs[1].hide();
    tabs[2].hide();
    tabs[3].show();

    // initial plot of raw data
    const data = currentRoutine.calibrationData;
    const xData = data.map(v => v[0]);
    const yData = data.map(v => v[1]);
    const zData = data.map(v => v[2]);
    const resultsLayout = { margin:{t:0,b:0,l:0,r:0}, scene:{aspectmode:'cube', xaxis:{min:-1.2,max:1.2}, yaxis:{min:-1.2,max:1.2}, zaxis:{min:-1.2,max:1.2}} };
    Plotly.newPlot(`resultsPlot-${rs.type}`, [{ x:xData, y:yData, z:zData, mode:'markers', type:'scatter3d', marker:{size:2,color:'blue'} }], resultsLayout);

    // bind back button
    $(`#backToStep3Btn-${rs.type}`).off('click').on('click', () => {
        tabs[2].show();
        tabs[3].hide();
        initializeStep3();
    });

    // bind compute
    $(`#computeCalBtn-${rs.type}`).off('click').on('click', () => {
        const calibType = $(`#calTypeSelect-${rs.type}`).val();
        
        if (rs.type == CALIBRATION_TYPES.GYROSCOPE) {
            // gyro only bias
            const bias = [
                currentRoutine.calibrationData.reduce((acc, val) => acc + val[0], 0) / currentRoutine.calibrationData.length,
                currentRoutine.calibrationData.reduce((acc, val) => acc + val[1], 0) / currentRoutine.calibrationData.length,
                currentRoutine.calibrationData.reduce((acc, val) => acc + val[2], 0) / currentRoutine.calibrationData.length
            ];
            const scale = [1,1,1];
            updateCalResults(bias, scale);
        } else {
            let bias = [0,0,0], scale = [1,1,1];
            if (calibType == "ellipseFit") {
                const result = computeEllipseFitCalibration(currentRoutine.calibrationData);
                bias = result.bias;
                scale = result.scale;
            } else {
                const result = computeMinMaxCalibration(currentRoutine.calibrationData);
                bias = result.bias;
                scale = result.scale;
            }
            updateCalResults(bias, scale);
        }
    });

    // bind accept/cancel
    $(`#acceptFullCalBtn-${rs.type}`).off('click').on('click', () => {
        // write values to global inputs (assumes ids mag/acc/gyro bias/scale exist)
        for (let i = 0; i < 3; i++) {
            $(`#${rs.rangeInputSettings.finalBiasIdPrefix}${i}`)[0]?.setVal?.(currentRoutine.calibrationData.bias?.[i] ?? 0);
            $(`#${rs.rangeInputSettings.finalBiasIdPrefix}${i}`)[0]?.input.trigger('change');

            if (rs.includeScale) {
                $(`#${rs.rangeInputSettings.finalScaleIdPrefix}${i}`)[0]?.setVal?.(currentRoutine.calibrationData.scale?.[i] ?? 1);
                $(`#${rs.rangeInputSettings.finalScaleIdPrefix}${i}`)[0]?.input.trigger('change');
            }
        }

        currentRoutine.modalInstance.hide();
        currentRoutine = null;
    });

    $(`#cancelFullCalBtn-${rs.type}`).off('click').on('click', () => {
        currentRoutine.modalInstance.hide();
        currentRoutine = null;
    });
}

function updateCalResults(bias, scale) {
    const rs = currentRoutine.rs;
    // update range-inputs
    $(`#bias-0-calib-${rs.type}`)[0].setVal(bias[0]);
    $(`#bias-1-calib-${rs.type}`)[0].setVal(bias[1]);
    $(`#bias-2-calib-${rs.type}`)[0].setVal(bias[2]);
    if (rs.includeScale) {
        $(`#scale-0-calib-${rs.type}`)[0].setVal(scale[0]);
        $(`#scale-1-calib-${rs.type}`)[0].setVal(scale[1]);
        $(`#scale-2-calib-${rs.type}`)[0].setVal(scale[2]);
    }

    currentRoutine.calibrationData.bias = bias;
    currentRoutine.calibrationData.scale = scale;

    // Update the 3D plot with calibrated data
    const calibratedData = currentRoutine.calibrationData.map(v => [
        (v[0] - bias[0]) / scale[0],
        (v[1] - bias[1]) / scale[1],
        (v[2] - bias[2]) / scale[2]
    ]);
    const xData = calibratedData.map(v => v[0]);
    const yData = calibratedData.map(v => v[1]);
    const zData = calibratedData.map(v => v[2]);
    const resultsLayout = { margin:{t:0,b:0,l:0,r:0}, scene:{aspectmode:'cube', xaxis:{min:-1.2,max:1.2}, yaxis:{min:-1.2,max:1.2}, zaxis:{min:-1.2,max:1.2}} };
    Plotly.newPlot(`resultsPlot-${rs.type}`, [{ x:xData, y:yData, z:zData, mode:'markers', type:'scatter3d', marker:{size:2,color:'green'} }], resultsLayout);
}

// ---------------------------------------- Utility functions for calibration computations
/// fit an elipse using least squares based on http://www.juddzone.com/ALGORITHMS/least_squares_3D_ellipsoid.html
function computeEllipseFitCalibration(data) {
    // using math.js for matrix operations
    let A = math.matrix(data.map(v => [
        v[0] * v[0], 
        v[1] * v[1], 
        v[2] * v[2],
        v[0] * v[1],
        v[0] * v[2],
        v[1] * v[2],
        v[0], 
        v[1], 
        v[2]
    ]));

    let b = math.matrix(data.map(v => [1]));

    let At = math.transpose(A);
    let AtA = math.multiply(At, A);
    let Atb = math.multiply(At, b);
    
    let coeffs = math.lusolve(AtA, Atb);
    coeffs = coeffs.valueOf().map(v => v[0]); // flatten
    coeffs.push(-1); // add the constant term

    let params = polyToParams3D(coeffs);

    return { bias: params.center, scale: params.axes };
}

function polyToParams3D(vec) {
    // convert the polynomial form of the 3D-ellipsoid to parameters
    // center, axes, and transformation matrix
    // vec is the vector whose elements are the polynomial
    // coefficients A..J
    // returns (center, axes, rotation matrix)

    //Algebraic form: X.T * Amat * X --> polynomial form

    let Amat = math.matrix([
        [ vec[0],     vec[3]/2.0, vec[4]/2.0, vec[6]/2.0 ],
        [ vec[3]/2.0, vec[1],     vec[5]/2.0, vec[7]/2.0 ],
        [ vec[4]/2.0, vec[5]/2.0, vec[2],     vec[8]/2.0 ],
        [ vec[6]/2.0, vec[  7]/2.0, vec[8]/2.0, vec[9]     ]
    ]);

    //See B.Bartoni, Preprint SMU-HEP-10-14 Multi-dimensional Ellipsoidal Fitting
    // equation 20 for the following method for finding the center
    let A3 = math.subset(Amat, math.index([0,1,2], [0,1,2]));
    let A3inv = math.inv(A3);
    let ofs = vec.slice(6,9).map(v => v / 2.0);
    let center = math.multiply(-1, math.multiply(A3inv, math.matrix(ofs)));

    // Center the ellipsoid at the origin
    let Tofs = math.identity(4);
    Tofs.subset(math.index(3, [0,1,2]), center);
    let R = math.multiply(Tofs, math.multiply(Amat, math.transpose(Tofs)));

    let R3 = math.subset(R, math.index([0,1,2], [0,1,2]));
    let R3test = math.divide(R3, R3.subset(math.index(0,0)));
    
    let s1 = -R.subset(math.index(3, 3));
    let R3S = math.divide(R3, s1);
    let eig = math.eigs(R3S.valueOf());
    let el = eig.values;
    let ec = math.matrix(eig.vectors);

    let recip = el.map(v => 1.0 / Math.abs(v));
    let axes = recip.map(v => Math.sqrt(v));

    let inve = math.transpose(math.matrix(ec)); //inverse is actually the transpose here
    
    return { center: center.valueOf(), axes: axes, rotationMatrix: inve.valueOf() };
}

function computeMinMaxCalibration(data) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    data.forEach(v => {
        for (let i = 0; i < 3; i++) {
            if (v[i] < min[i]) min[i] = v[i];
            if (v[i] > max[i]) max[i] = v[i];
        }
    });

    const bias = [
        (max[0] + min[0]) / 2,
        (max[1] + min[1]) / 2,
        (max[2] + min[2]) / 2
    ];

    const scale = [
        (max[0] - min[0]) / 2,
        (max[1] - min[1]) / 2,
        (max[2] - min[2]) / 2
    ];

    return { bias, scale };
}