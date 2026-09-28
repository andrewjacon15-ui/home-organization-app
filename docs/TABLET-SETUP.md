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
2. Go to **System â†’ Developer options** and turn on **USB debugging**.

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
- switches off `com.skylight` and `skylight.watchdog` (the watchdog relaunches
  Skylight whenever it's closed). The Skylight keyboard stays, because it's
  the tablet's default on-screen keyboard.
- opens the app in Fully at `?kiosk=1`

## 4. Fully settings (on the tablet)

Swipe in from the left edge of the screen, then tap **Settings**. These are all
free (not PLUS) settings:

| Where | Setting | Value |
| --- | --- | --- |
| Web Content Settings | Start URL | `https://home-organization-app-dkcbl.web.app/?kiosk=1` |
| Advanced Web Settings | Fake User Agent String | **Chrome 85 on Android** |
| Device Management | Keep Screen On | on |
| Device Management | Launch on Boot | on |
| Toolbars and Appearance | Fullscreen mode | on (optional) |

The user agent matters: with Fully's default one, Google refuses to sign in
from an embedded browser ("disallowed_useragent").

Tip: search is faster than scrolling. **Search in Settings** at the top, type a
word, press Enter.

## 5. Sign in and check

1. Tap **Sign in with Google** and sign in. On the tablet it goes to Google's
   full sign-in page and comes back, instead of using a popup (Fully blocks
   popups unless you buy PLUS). `?kiosk=1` is what tells the app to do this;
   see `src/kiosk.ts`.
2. Restart the tablet (hold power â†’ Restart). It should come back up in Fully,
   still signed in.

Connecting Google Calendar uses a popup, so do that from a phone or computer,
not the tablet.

## Undo

- Bring Skylight back: run `tablet\setup-tablet.cmd -Restore`
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
| Google says the browser isn't secure | Try another **Fake User Agent String** option (e.g. Chrome 85 on Windows). |
| Tablet boots to a blank screen or Skylight | Check **Launch on Boot** is on, then re-run the script (it re-applies the boot permissions). |

Credit: the settings trick and the `--no-incremental` finding come from
[Biblejustin/skylight-family-hub](https://github.com/Biblejustin/skylight-family-hub/blob/main/docs/DEVICE-SETUP.md)
and [dinewby88/SkylightMaxCalendarADB](https://github.com/dinewby88/SkylightMaxCalendarADB).
