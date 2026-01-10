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
                            This is the calibration routine for the magnetometer. 
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
                                <button type="button" class="btn btn-primary" id="startMagCalibration">Start Calibration</button>
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
                                <div class="d-flex align-items-center" id="waitingForUnplug">
                                    <span>Waiting for unplug</span>   
                                    <div class="spinner-border" role="status" style="width: 1.5rem; height: 1.5rem; margin-left: 10px;">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex align-items-center" id="waitingForData">
                                <span>Waiting for data</span>   
                                <div class="spinner-border" role="status" style="width: 1.5rem; height: 1.5rem; margin-left: 10px;">
                                    <span class="visually-hidden">Loading...</span>
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
    initializeStep2();
});

// ------------------------------------------- Page 2
calibrationSettings = {
    type: CALIBRATION_TYPES.MAGNETOMETER, // MAG
    startSignal: CALIBRATION_START_SIGNAL.NOW, // PLUGGED_IN
    dataCollectTimeMs: 30000,
    waitMsAfterUnplug: 5000,
    dataCollectRateHz: 5
}

let checkInterval = null;

async function initializeStep2() {
    magCalTabs[0].hide();
    magCalTabs[1].show();

    await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.START});

    // Reset Step 2 inputs
    $("#totalTimeSeconds").val(calibrationSettings.dataCollectTimeMs / 1000);
    $("#waitSecondsAfterUnplug").val(calibrationSettings.waitMsAfterUnplug / 1000);
    $("#dataAcquisitionRate").val(calibrationSettings.dataCollectRateHz);
    $("#magCalStartMode").val("pluggedIn");
    $("#magCalStartPluggedIn").show();
    $("#magCalStartUnplugged").hide();

    $("#waitForUnplug").show();
    $("#waitingForData").hide();

    await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, calibrationSettings);

    // check for disconnection at regular intervals
    const checkIntervalMs = 500;
    checkInterval = setInterval(async () => {
        if (!controlCenterState.port || !controlCenterState.port.readable) {
            $("#waitingForUnplug").hide();
            $("#waitingForData").show();
            startAwaitingData();
            clearInterval(checkInterval);
            checkInterval = null;
        }
    }, checkIntervalMs);
}

$("#totalTimeSeconds").on("change", (e) => {
    const totalTimeSeconds = parseInt(e.target.value);
    calibrationSettings.dataCollectTimeMs = totalTimeSeconds * 1000;
    sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, calibrationSettings);
});

$("#waitSecondsAfterUnplug").on("change", (e) => {
    const waitSecondsAfterUnplug = parseInt(e.target.value);
    calibrationSettings.waitMsAfterUnplug = waitSecondsAfterUnplug * 1000;
    sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, calibrationSettings);
});

$("#dataAcquisitionRate").on("change", (e) => {
    const dataAcquisitionRate = parseInt(e.target.value);
    calibrationSettings.dataCollectRateHz = dataAcquisitionRate;
    sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, calibrationSettings);
});

$("#magCalStartMode").on("change", (e) => {
    const mode = e.target.value;

    if (mode == "pluggedIn") {
        $("#magCalStartPluggedIn").show();
        $("#magCalStartUnplugged").hide();
        calibrationSettings.startSignal = CALIBRATION_START_SIGNAL.NOW;
    } else if (mode == "unplugToCalibrate") {
        $("#magCalStartPluggedIn").hide();
        $("#magCalStartUnplugged").show();
        calibrationSettings.startSignal = CALIBRATION_START_SIGNAL.ON_UNPLUG;
    }

    sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_SETTINGS, calibrationSettings);
});

$("#startMagCalibration").on("click", async () => {
    await sendAction(controlCenterState.port, ACTION_IDS.CALIBRATION_MSG, {calibrationMessageType: CALIBRATION_MSG_TYPE.START});
    $("#startMagCalibration").prop("disabled", true);

    startAwaitingData();
});

let calibrationData = [];

async function startAwaitingData() {
    let msg;

    do {
        msg = await recieveWait({isExpectedMessage: (msg) => {
            msg.type == MESSAGE_IDS.CALIBRATION_DATA
        }});

        calibrationData = calibrationData.concat(msg.vectors);
    } while (msg.isComplete);

    // Move to Step 3 tab
    initializeStep3();
}

// ------------------------------------------- Page 3
function initializeStep3() {
    magCalTabs[1].hide();
    magCalTabs[2].show();
    if (checkInterval != null) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}