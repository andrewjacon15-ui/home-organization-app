# Turns a Skylight Calendar 15" (model 150-CAL) into a wall display for this app.
# Run after USB debugging is on (see docs/TABLET-SETUP.md). -Restore puts Skylight back.
param(
    [string]$Url = 'https://home-organization-app-dkcbl.web.app/?kiosk=1',
    [string]$TimeZone = 'America/New_York',
    [switch]$Restore
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Pinned so every tablet gets a version known to work; bump after testing a newer one.
$fullyApkUrl = 'https://www.fully-kiosk.com/files/2026/09/Fully-Kiosk-Browser-v1.61.3.apk'
$fully = 'de.ozerov.fully'
# The Skylight app, plus a watchdog that relaunches it whenever it's closed.
$skylightPackages = 'skylight.watchdog', 'com.skylight'

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

$toolsDir = Join-Path $env:USERPROFILE 'platform-tools'
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
    $adb = Join-Path $toolsDir 'adb.exe'
    if (-not (Test-Path $adb)) {
        Step "Downloading Android platform-tools to $toolsDir"
        $zip = Join-Path $env:TEMP 'platform-tools.zip'
        Invoke-WebRequest 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip
        Expand-Archive $zip -DestinationPath $env:USERPROFILE -Force
        Remove-Item $zip
    }
}

Step 'Waiting for the tablet (tap Allow on the tablet if a USB debugging prompt appears)'
& $adb start-server | Out-Null
while ($true) {
    $lines = & $adb devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }
    if ($lines -match "`tdevice$") { break }
    if ($lines -match 'unauthorized') { Write-Host 'Tap Allow on the tablet (tick "Always allow from this computer").' -ForegroundColor Yellow }
    Start-Sleep -Seconds 2
}
$model = (& $adb shell getprop ro.product.model).Trim()
if ($model -ne 'rk3562_15_inch') { Write-Host "Warning: expected a 150-CAL (rk3562_15_inch) but found '$model'. Continuing." -ForegroundColor Yellow }

if ($Restore) {
    Step 'Turning the Skylight app back on'
    foreach ($p in $skylightPackages) {
        & $adb shell appops reset $p
        & $adb shell pm enable $p
    }
    & $adb shell appops write-settings | Out-Null
    & $adb shell rm -f /sdcard/fully-auto-settings.json
    & $adb shell settings put system accelerometer_rotation 1
    & $adb shell am start -n com.skylight/odesk.johnlife.skylight.activity.MainActivity | Out-Null
    Write-Host "`nSkylight is back. To remove Fully too: adb uninstall $fully" -ForegroundColor Green
    return
}

Step 'Installing Fully Kiosk Browser'
$apk = Join-Path $env:TEMP 'Fully-Kiosk-Browser.apk'
Invoke-WebRequest $fullyApkUrl -OutFile $apk
# --no-incremental: incremental installs kernel-panic this firmware.
& $adb install -r --no-incremental $apk

Step "Setting the time zone to $TimeZone"
& $adb shell settings put global auto_time_zone 0
& $adb shell cmd alarm set-timezone $TimeZone

Step 'Keeping the screen on and letting Fully start itself at boot'
& $adb shell settings put global stay_on_while_plugged_in 7
& $adb shell settings put system screen_off_timeout 2147483647
# Android 10+ only lets an app open itself at boot if it may draw over other apps.
& $adb shell appops set $fully SYSTEM_ALERT_WINDOW allow
& $adb shell dumpsys deviceidle whitelist +$fully | Out-Null

Step 'Wall display settings: no screensaver, landscape only, no lock screen, silent taps'
# Android's own screensaver would cover the app; the app has its own.
& $adb shell settings put secure screensaver_enabled 0
& $adb shell settings put secure screensaver_activate_on_sleep 0
& $adb shell settings put secure screensaver_activate_on_dock 0
# Wall-mounted, so don't let a bump rotate it. Rotation 0 is landscape on this panel.
& $adb shell settings put system accelerometer_rotation 0
& $adb shell settings put system user_rotation 0
& $adb shell settings put system sound_effects_enabled 0
& $adb shell settings put system lockscreen_sounds_enabled 0
& $adb shell settings put system haptic_feedback_enabled 0
& $adb shell locksettings set-disabled true | Out-Null

Step 'Turning off the Skylight app and its updater'
# skylight.watchdog is Skylight's updater: it installed the current com.skylight,
# skylight.keyboard and itself, and these two are the only non-AOSP apps allowed to
# install packages. There's no Play Store, so disabling them stops all updates,
# including firmware. disable-user survives reboots and is reversible (-Restore).
# The Skylight keyboard stays; it's the tablet's keyboard and can't install anything.
foreach ($p in $skylightPackages) {
    & $adb shell pm disable-user --user 0 $p
    # Second layer in case they're ever re-enabled: no installing, no background work.
    & $adb shell appops set $p REQUEST_INSTALL_PACKAGES deny
    & $adb shell appops set $p RUN_ANY_IN_BACKGROUND ignore
    & $adb shell appops set $p RUN_IN_BACKGROUND ignore
}

Step 'Applying Fully settings from tablet/fully-auto-settings.json'
# Fully reads /sdcard/fully-auto-settings.json each time it starts ("Enable Settings
# Auto-Import" is on by default); it needs storage access to see the file.
# Without it Fully stops at a "Permissions required" dialog on every boot.
& $adb shell appops set $fully MANAGE_EXTERNAL_STORAGE allow
& $adb shell appops set --uid $fully MANAGE_EXTERNAL_STORAGE allow
# Android saves app-op changes lazily; a reboot before that loses them.
& $adb shell appops write-settings | Out-Null
$settings = Get-Content (Join-Path $PSScriptRoot 'fully-auto-settings.json') -Raw | ConvertFrom-Json
$settings.startURL = $Url
$settingsFile = Join-Path $env:TEMP 'fully-auto-settings.json'
[IO.File]::WriteAllText($settingsFile, ($settings | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
& $adb push -q $settingsFile /sdcard/fully-auto-settings.json | Out-Null

Step 'Restarting Fully'
& $adb shell am force-stop $fully
& $adb shell am start -W -n "$fully/.MainActivity" | Out-Null

Write-Host "`nDone. Sign in on the tablet, then restart it to check it comes back up in Fully." -ForegroundColor Green
