const log = $("#log");
const MAX_LOG_ENTRIES = 500;
let logIndex = 0;

const ORIGIN = {
    CONTROLLER: "Controller",
    DEVICE: "Device",
}

// Appends a message to the log display ensuring max entries is not exceeded.  If 
// the log is scrolled to the bottom, it will remain at the bottom after appending.
// If two adjacent log messages are identical, instead of appending a new message,
// it will increment a multiplier on the previous message.
function appendLog(message, origin = ORIGIN.CONTROLLER) {
    // check if log is scrolled to bottom
    const bottomDelta = 5;
    const isAtBottom = log.parent()[0].scrollHeight - log.parent()[0].scrollTop <= log.parent()[0].clientHeight + bottomDelta;

    let prevEntry = log.children().last();
    if (prevEntry.length > 0) {
        let prevMsg = prevEntry.find(".log-msg").text();
        if (prevMsg === message) {
            let multiplierSpan = prevEntry.find(".log-multiplier");
            let currentMultiplier = parseInt(multiplierSpan.text().replace(/[\(\) x]/g, ""));
            if (isNaN(currentMultiplier)) currentMultiplier = 1;
            multiplierSpan.text(`(x${currentMultiplier + 1})`);
            return;
        }
    }

    // pad index to right with spaces
    const paddedIndex = logIndex.toString().padStart(4, '\u00A0');
    logIndex += 1;

    log.append($(`<span>
        <span style="color: ${origin === ORIGIN.CONTROLLER ? "#7cb7c1" : "#cd7777"}">[${paddedIndex}]:</span>
        <span class="log-msg">${message}</span>
        <span class="log-multiplier" style="color: gray"></span>
    </span>`));

    // Remove old log entries if exceeding max
    while (log.children().length > MAX_LOG_ENTRIES) {
        log.children().first().remove();
    }

    // Scroll to bottom if was at bottom before
    if (isAtBottom)
        log.parent()[0].scrollTop = log.parent()[0].scrollHeight;
}