# Wall tablet setup

This turns an Android tablet into a full-screen, always-on display for this
app. No rooting, wiping, or firmware flashing is needed: we turn on USB
debugging, then a script installs [Fully Kiosk Browser](https://www.fully-kiosk.com/)
(free version) and sets the tablet up as a wall display. Everything here can be
undone.

| Tablet | Status |
| --- | --- |
| **Skylight Calendar 15"** (model 150-CAL; Rockchip RK3562, Android 13) | Tested. Needs a trick to reach Android Settings, and the script also switches off the Skylight software. |
| **Ordinary Android tablets** (Android 10 or newer), e.g. Samsung Galaxy Tab A9+ | Supported by the same script, which detects the kind of tablet. Not yet tested on real hardware, so check each step's result. |

Amazon Fire tablets probably work too, but they need extra steps (their own
launcher and lock-screen ads) that the script doesn't handle yet.

## What you need

- A Windows PC. The script downloads Android platform-tools (`adb`) and Fully
  for you if they aren't already there.
- A USB **data** cable for the tablet (charge-only cables won't work).
- Skylight only, if the touch trick in step 1 fails: a USB keyboard and a USB
  OTG adapter that fits the tablet's port.

## 1. Turn on USB debugging

### Ordinary Android tablet

1. Finish the tablet's first-time setup and connect it to Wi-Fi. Signing in to
   a Google account is worth it: the Play Store then keeps Android System
   WebView up to date, which is the browser engine Fully uses.
2. Set **Settings → Lock screen → Screen lock type** to **None** (or **Swipe**).
3. Open **Settings → About tablet** and tap **Build number** 7 times. On a
   Samsung it's under **About tablet → Software information**. (Can't find it?
   Search Settings for "build number".)
4. Go to **Settings → Developer options** (on some tablets, **System →
   Developer options**) and turn on **USB debugging**.

### Skylight Calendar

The Skylight app hides Android's Settings. Two ways in:

**Touch trick**

1. Hold the power button on the back for about 2 seconds, until the
   **Power off / Restart** menu appears. Don't tap either option.
2. With that menu showing, swipe down from the top edge with **two fingers**,
   over and over, until a **"System UI keeps stopping"** error appears.
3. Tap **App info**. That opens Settings.

**Keyboard**

1. Plug a USB keyboard into the tablet through the OTG adapter.
2. Press **Win+N** to open the notification shade, then tap the gear icon.
   If nothing happens, try **Win+I**.

Then open **About tablet**, tap **Build number** 7 times, and turn on
**System → Developer options → USB debugging**.

## 2. Run the setup script

1. Connect the tablet to the PC with the USB cable.
2. Double-click [`tablet/setup-tablet.cmd`](../tablet/setup-tablet.cmd).
3. When the tablet asks **Allow USB debugging?**, tick **Always allow from
   this computer** and tap **Allow**.
4. If Google Play Protect asks about installing Fully, allow it. Fully comes
   from its developer's site, not the Play Store.

The script works out which kind of tablet it's talking to and prints it
(`Tablet: samsung SM-X210 (Generic)`, for example). Then it:

- installs Fully Kiosk Browser (with `--no-incremental`, since incremental
  installs crash the Skylight's firmware)
- sets the time zone only if you ask it to (see options below). Skylights
  default to `America/New_York`, because their automatic time zone is off out
  of the box.
- keeps the screen on while plugged in
- lets Fully draw over other apps and exempts it from battery saving, which
  Android 10+ requires before an app can open itself at boot
- turns off Android's screensaver, locks the screen to landscape, removes the
  lock screen, and silences touch sounds and vibration
- **Skylight only:** switches off `com.skylight` and `skylight.watchdog`, which
  also stops all Skylight updates (see [Skylight updates](#skylight-updates)).
  The Skylight keyboard stays, because it's the tablet's default on-screen
  keyboard.
- copies [`tablet/fully-auto-settings.json`](../tablet/fully-auto-settings.json)
  to the tablet and restarts Fully, which applies it (see below)
- lists anything left to do by hand

Re-running the script is safe. It's also how you apply changes to any of the
settings above.

**Options.** Add them after the script name, e.g.
`tablet\setup-tablet.cmd -Orientation Portrait -TimeZone America/Chicago`:

| Option | Default | What it does |
| --- | --- | --- |
| `-Orientation` | `Landscape` | `Landscape`, `Portrait`, or `Auto` (follows how the tablet is held). The script works out the right rotation from the screen's dimensions, since some tablets are portrait in their natural position and some are landscape. |
| `-TimeZone` | the tablet's automatic time zone (`America/New_York` on a Skylight) | Sets a fixed time zone, e.g. `America/Los_Angeles`. |
| `-Device` | `Auto` | Forces `Skylight` or `Generic` if detection gets it wrong. |
| `-Url` | the live app at `?kiosk=1` | Points the tablet somewhere else, such as a test deploy. Keep `?kiosk=1`. |
| `-Restore` | | Undoes the setup (see [Undo](#undo)). |

## 3. Fully settings

You don't need to tap through Fully's settings. Fully reads
`/sdcard/fully-auto-settings.json` every time it starts ("Enable Settings
Auto-Import" is on by default), and the script puts the repo's copy there. The
file only lists the settings we change; everything else stays at Fully's
defaults. All of these are free (not PLUS):

| Key | Value | Why |
| --- | --- | --- |
| `startURL` | `https://home-organization-app-dkcbl.web.app/?kiosk=1` | The app. The script fills this in from `-Url`. |
| `userAgent` | Chrome 85 on Android | With Fully's default, Google refuses to sign in from an embedded browser ("disallowed_useragent"). |
| `launchOnBoot`, `keepScreenOn` | on | Opens by itself after a restart, and never sleeps. |
| `showStatusBar`, `showNavigationBar`, `showActionBar` | off | Full screen. |
| `showMenuHint` | off | No "swipe from the left" hint at startup. |
| `enablePullToRefresh`, `enableTapSound` | off | No accidental reloads, no clicks. |
| `setWifiWakelock` | on | Keeps Wi-Fi awake so the display stays live. |
| `reloadOnWifiOn`, `reloadOnInternet`, `waitInternetOnReload` | on | Recovers by itself after a Wi-Fi or internet outage. |
| `reloadPageFailure` | 30 | Retries 30 seconds after the page fails to load. |
| `reloadEachSeconds` | 1800 | "Auto Reload on Idle": after 30 minutes with nobody touching it, goes back to the home view and picks up any new version of the app. |

To change a Fully setting for good: change it on the tablet, use
**Other Settings → Export Settings** to write `/sdcard/fully-settings.json`,
`adb pull` it, copy the key you changed into `tablet/fully-auto-settings.json`,
and re-run the script. Fully's side menu (swipe in from the left edge →
**Settings**) still works for a quick one-off change, but the file wins the
next time Fully starts.

## 4. Sign in and check

1. Tap **Sign in with Google** and sign in. On the tablet it goes to Google's
   full sign-in page and comes back, instead of using a popup (Fully blocks
   popups unless you buy PLUS). `?kiosk=1` is what tells the app to do this;
   see `src/kiosk.ts`.
2. Restart the tablet (hold power → Restart). It should come back up in Fully,
   still signed in.

Connecting Google Calendar uses a popup, so do that from a phone or computer,
not the tablet.

## Ordinary Android tablets: by hand

The script prints these at the end, because they can't be set over USB
reliably:

- **Battery charge limit.** The tablet is plugged in all day, and a battery
  held at 100% for years can swell. On a Samsung: **Settings → Battery →
  Battery protection → Maximum** (stops at 80%). On older One UI versions it's
  **More battery settings → Protect battery** (85%). Other brands call it
  something like "charging limit" or "battery protection", if they have it.
- **Samsung: keep Fully awake.** **Settings → Battery → Background usage
  limits → Never sleeping apps → add Fully Kiosk Browser**. Samsung has its own
  app-sleeping rules on top of Android's battery exemption (which the script
  sets), so add Fully there too.
- **The Home button.** On an ordinary tablet, swiping up or pressing Home leaves
  Fully and shows the tablet's normal home screen. Fully reopens on the next
  restart. To block this, buy a [Fully PLUS](https://www.fully-kiosk.com/)
  license (€8.90 one-time per tablet) and turn on **Kiosk Mode**, which also
  makes Fully the home app. On a Skylight this doesn't come up, since its only
  other home screen is blank.
- **System updates.** Leave them on. An ordinary tablet's updates don't undo
  this setup; if one restarts the tablet, Fully opens again by itself.

## Skylight updates

A Skylight update must not undo this setup, so Skylight can't update anything.
The Skylight apps stay installed, so you can always go back.

- **Who can update what:** `skylight.watchdog` is Skylight's updater. It
  installed the current Skylight app, keyboard and itself. Apart from Android's
  own system components, it and `com.skylight` are the only apps allowed to
  install packages. The tablet has no Play Store or Google services, and no
  other firmware update client. (Tested firmware: `skylightOS` build from
  2024-11-23, Android 13.)
- **What the script does:** it disables both apps (`pm disable-user`), which
  survives restarts. An app can't turn itself back on, and with the updater off,
  nothing downloads Skylight app or firmware updates. In case either is ever
  re-enabled, the script also denies them permission to install apps and to run
  in the background.
- **What can still undo it:** only a factory reset (holding power for 10
  seconds) or someone deliberately running `-Restore` or re-enabling the apps in
  Android Settings. After a factory reset, run this guide again.
- **Check it:** `adb shell pm list packages -d` should list `com.skylight` and
  `skylight.watchdog`.

The web app updates itself on every tablet. Deploys reach the tablet on the next
reload, which happens at least every 30 minutes when idle.

## Voice input

The app's voice features use the browser's speech recognition, which Android's
in-app browser engine (WebView, which Fully is built on) doesn't support
([Chromium issue](https://issues.chromium.org/issues/40417848)). So voice input
doesn't work inside Fully on any tablet yet, whether or not it has a microphone.

Fully PLUS with **Enable Microphone Access** on (Web Content Settings) lets the
page *hear* the microphone, but it doesn't add speech-to-text: Fully's own
JavaScript interface has no speech recognition either. Making voice work in
Fully needs one more piece in the app: a free, on-device speech recognizer
(for example Vosk, which runs in the page with a ~40 MB English model) or a paid
transcription service on the server. Until then the mic button explains that
voice isn't available on this screen, and typing works as usual.

## Undo

- Run `tablet\setup-tablet.cmd -Restore`. On every tablet this removes the
  Fully settings file and turns auto-rotate and the lock screen back on. On an
  ordinary tablet it also brings back a 2-minute screen timeout. On a Skylight
  it turns the Skylight apps back on (lifting the install and background
  blocks, so Skylight can update again) and opens Skylight.
- Remove Fully too: `adb uninstall de.ozerov.fully`
- Full factory reset: on a Skylight, hold the power button for 10 seconds. This
  erases everything and puts the Skylight software back as it came. On an
  ordinary tablet, use **Settings → General management → Reset** (Samsung) or
  **System → Reset options**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "System UI keeps stopping" never appears (Skylight) | Make sure the power menu is showing first, then keep swiping with two fingers. If it still doesn't appear, use the keyboard method. |
| Script stuck on "Waiting for the tablet" | Try another cable (it must carry data) or USB port, and check the tablet for an **Allow** prompt. |
| Tapping Build number does nothing | The firmware may block developer mode. We haven't hit this on the 150-CAL. |
| Script says the lock screen is still on | A PIN, pattern or password is set. Set **Screen lock type** to **None**, then re-run the script. |
| Screen is upside down or the wrong way round | Re-run with `-Orientation Portrait` or `-Orientation Auto`, or turn the tablet round in its mount. |
| "Popups and new tabs disabled" when signing in | Fully isn't at `?kiosk=1`. Check the Start URL, then use **Goto Start URL** in Fully's side menu. |
| Google says the browser isn't secure | Pick another **Fake User Agent String** in Fully (Advanced Web Settings), export, and copy the new `userAgent` into `tablet/fully-auto-settings.json`. |
| Tablet boots to a blank screen, Skylight, or the normal home screen | Re-run the script. It re-applies Launch on Boot and the boot permissions. On a Samsung, also check Fully is in **Never sleeping apps**. |
| Pressing Home shows a blank screen (Skylight) | Android won't let `adb` make Fully the home app, so Home goes to an empty fallback screen. Restart the tablet, or open Fully with `adb shell am start -n de.ozerov.fully/.MainActivity`. |
| Fully shows "Permissions required: Manage Device Storage" at boot | Re-run the script. It grants storage access and saves it with `appops write-settings`, so it isn't lost on a restart. |
| A Fully setting keeps reverting | It's in `tablet/fully-auto-settings.json`, which is re-applied every time Fully starts. Change it there and re-run the script. |

Credit: the Skylight settings trick and the `--no-incremental` finding come from
[Biblejustin/skylight-family-hub](https://github.com/Biblejustin/skylight-family-hub/blob/main/docs/DEVICE-SETUP.md)
and [dinewby88/SkylightMaxCalendarADB](https://github.com/dinewby88/SkylightMaxCalendarADB).
