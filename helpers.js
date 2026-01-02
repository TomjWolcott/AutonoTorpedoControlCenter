/**
 * 
 * @param {float} f 
 * @returns {int}
 */
function floatToUint8(f) {
    return Math.floor(Math.max(Math.min(f, 255), 0));
}