# AutonoTorpedo Control Center
## Running locally
You'll need to locally host with https in order to access `USB` and `Serial` web APIs.  Follow the start of https://plainenglish.io/blog/enable-https-for-localhost-during-local-development-in-node-js in order to setup the config folder.
```
serve --ssl-cert config/create-cert.pem --ssl-key config/create-cert-key.pem  -l 80
```

This will serve the page at `https://localhost:80`