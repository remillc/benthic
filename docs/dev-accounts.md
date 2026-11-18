# Trying the OpenDives+ flow with a simulated Google account

Development only. Real Google Sign-In and real store billing are not wired yet; this simulation lets a developer go through the whole OpenDives+ flow (sign-in, offer, purchase, health data, import of a Subsurface file) against the local development server, with a temporary account.

Nothing of it exists in a release: the switch below is read at build time, and a build without it contains none of the code (`tests/app/dev-accounts.test.mjs` builds both ways and searches the bundle).

## What it adds

- **The switch:** `VITE_DEV_ACCOUNTS=1` in `app/.env.local` (git-ignored; never set it in a release build).
- **« Continuer avec Google »** opens a small sheet marked « Simulation (développement) » with an e-mail (prefilled with `essai-xxxx@opendives.test`) and a name. It calls the development server's simulated sign-in and continues the real flow: a subscribed account goes to its logbook (download, or the choices that create one); any other account goes to the offer.
- **« S'abonner »** (offer) calls the simulated purchase, then « Bienvenue dans OpenDives+ », « Vos données de santé » and the download (or the choices that create a logbook: import a Subsurface file, send the logbook of this device, start blank).
- **« Supprimer ce compte d'essai »** on the account page (temporary accounts only) deletes the account and its repository on the development server, then signs out of the device.
- The app refuses these calls at run time when the server address is not this machine's (`127.0.0.1`, `10.0.2.2`, `localhost`, `[::1]`).
- Without the switch nothing changes: the Google button answers that the sign-in is not available yet.

The matching routes (`/v1/auth/dev-google`, `/v1/account/dev-subscribe`, `/v1/account/dev-reset`) are in the development server; they answer 404 unless it runs in development mode.

## From a phone over USB

The stack listens on `127.0.0.1` only: the API on 8080 and the git front (https, with a local certificate authority) on 3443.

```sh
tools/dev-phone.sh <adb-serial>      # starts the stack, runs adb reverse for 8080 and 3443, copies the authority, prints the env lines
```

The script takes the stack from `OPENDIVES_SERVER_DIR` (default: the `opendives-server` folder next to this repository). Then:

1. Put in `app/.env.local`: `VITE_SERVER_URL=http://127.0.0.1:8080` and `VITE_DEV_ACCOUNTS=1`.
2. Build and install a **debug** build (`cd app && npm run android:sync`, then `gradlew assembleDebug` and `adb install -r`, see AGENTS.md). The certificate authority is `app/android/app/src/debug/assets/dev-ca.pem` (git-ignored); only debug builds read it, and the debug build allows clear text to the loopback only.
3. In the app: « Se connecter » → « Continuer avec Google » → the simulated sheet.

The reverse ports last until the phone is unplugged or adb restarts. The emulator works the same way (`adb -s emulator-5554 reverse ...`).
