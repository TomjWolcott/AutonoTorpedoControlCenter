document.getElementById("connect-btn").onclick = () => {
    Serial.getPorts().then((arr) => {
        console.log("success", arr);
    }, () => console.log("FAILED") )
}