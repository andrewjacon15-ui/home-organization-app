# Wall tablet setup (Skylight Calendar 15", model 150-CAL)

This turns a Skylight Calendar into a full-screen display for this app. No
rooting, wiping, or firmware flashing is needed: we turn on USB debugging,
install [Fully Kiosk Browser](https://www.fully-kiosk.com/) (free version), and
switch off the Skylight app. Everything here can be undone.

Tested on the 150-CAL (Rockchip RK3562, Android 13, reports itself as
`rk3562_15_inch`). Other Skylight models may differ. The settings trick in
step 1 depends on the firmware, so a future Skylight update could block it.

## What you need

- A Windows PC. The script downloads Android platform-tools (`adb`) and Fully
  for you if they aren't already there.
- A USB **data** cable for the tablet (charge-only cables won't work).
- Only if step 1's touch trick fails: a USB keyboard and a USB OTG adapter
  that fits the tablet's port.

## 1. Get into Android Settings

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

## 2. Turn on USB debugging

1. In Settings, open **About tablet** and tap **Build number** 7 times.
   (Can't find it? Use the search box in Settings and type "build number".)
2. Go to **System → Developer options** and turn on **USB debugging**.

## 3. Run the setup script

1. Connect the tablet to the PC with the USB cable.
2. Double-click [`tablet/setup-tablet.cmd`](../tablet/setup-tablet.cmd).
3. When the tablet asks **Allow USB debugging?**, tick **Always allow from
   this computer** and tap **Allow**.

The script:

- installs Fully Kiosk Browser (with `--no-incremental`, since incremental
  installs crash this firmware)
- sets the time zone (defaults to `America/New_York`; pass
  `-TimeZone America/Chicago` etc. to change it)
- keeps the screen on while plugged in
- lets Fully draw over other apps and exempts it from battery saving, which
  Android 10+ requires before an app can open itself at boot
- turns off Android's screensaver, locks the screen to landscape, removes the
  lock screen, and silences touch sounds and vibration
- switches off `com.skylight` and `skylight.watchdog`, which also stops all
  Skylight updates (see [Updates](#updates)). The Skylight keyboard stays,
  because it's the tablet's default on-screen keyboard.
- copies [`tablet/fully-auto-settings.json`](../tablet/fully-auto-settings.json)
  to the tablet and restarts Fully, which applies it (see below)

Re-running the script is safe. It's also how you apply changes to any of the
settings above.

## 4. Fully settings

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

## 5. Sign in and check

1. Tap **Sign in with Google** and sign in. On the tablet it goes to Google's
   full sign-in page and comes back, instead of using a popup (Fully blocks
   popups unless you buy PLUS). `?kiosk=1` is what tells the app to do this;
   see `src/kiosk.ts`.
2. Restart the tablet (hold power → Restart). It should come back up in Fully,
   still signed in.

Connecting Google Calendar uses a popup, so do that from a phone or computer,
not the tablet.

## Updates

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

The web app updates itself. Deploys reach the tablet on the next reload, which
happens at least every 30 minutes when idle.

## Undo

- Bring Skylight back: run `tablet\setup-tablet.cmd -Restore`. This turns the
  Skylight apps back on (lifting the install and background blocks, so Skylight
  can update again), turns auto-rotate back on, and removes the Fully
  settings file.
- Remove Fully too: `adb uninstall de.ozerov.fully`
- Full factory reset: hold the power button for 10 seconds. This erases
  everything and puts the Skylight software back as it came.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "System UI keeps stopping" never appears | Make sure the power menu is showing first, then keep swiping with two fingers. If it still doesn't appear, use the keyboard method. |
| Script stuck on "Waiting for the tablet" | Try another cable (it must carry data) or USB port, and check the tablet for an **Allow** prompt. |
| Tapping Build number does nothing | This firmware may block developer mode. We haven't hit this yet on the 150-CAL. |
| "Popups and new tabs disabled" when signing in | Fully isn't at `?kiosk=1`. Check the Start URL, then use **Goto Start URL** in Fully's side menu. |
| Google says the browser isn't secure | Pick another **Fake User Agent String** in Fully (Advanced Web Settings), export, and copy the new `userAgent` into `tablet/fully-auto-settings.json`. |
| Tablet boots to a blank screen or Skylight | Re-run the script. It re-applies Launch on Boot and the boot permissions. |
| Pressing Home shows a blank screen | Android won't let `adb` make Fully the home app, so Home goes to an empty fallback screen. Restart the tablet, or open Fully with `adb shell am start -n de.ozerov.fully/.MainActivity`. |
| Fully shows "Permissions required: Manage Device Storage" at boot | Re-run the script. It grants storage access and saves it with `appops write-settings`, so it isn't lost on a restart. |
| A Fully setting keeps reverting | It's in `tablet/fully-auto-settings.json`, which is re-applied every time Fully starts. Change it there and re-run the script. |

Credit: the settings trick and the `--no-incremental` finding come from
[Biblejustin/skylight-family-hub](https://github.com/Biblejustin/skylight-family-hub/blob/main/docs/DEVICE-SETUP.md)
and [dinewby88/SkylightMaxCalendarADB](https://github.com/dinewby88/SkylightMaxCalendarADB).
