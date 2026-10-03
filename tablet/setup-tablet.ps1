# Turns an Android tablet into a wall display for this app: a Skylight Calendar 15"
# (150-CAL) or an ordinary Android tablet such as a Samsung Galaxy Tab A9+.
# Run after USB debugging is on (see docs/TABLET-SETUP.md). -Restore undoes it.
param(
    [string]$Url = 'https://home-organization-app-dkcbl.web.app/?kiosk=1',
    # Empty keeps the tablet's automatic time zone. Skylights default to New York,
    # because their automatic time zone is off and wrong out of the box.
    [string]$TimeZone = '',
    [ValidateSet('Auto', 'Skylight', 'Generic')]
    [string]$Device = 'Auto',
    [ValidateSet('Landscape', 'Portrait', 'Auto')]
    [string]$Orientation = 'Landscape',
    [switch]$Restore
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Pinned so every tablet gets a version known to work; bump after testing a newer one.
$fullyApkUrl = 'https://www.fully-kiosk.com/files/2026/09/Fully-Kiosk-Browser-v1.61.3.apk'
$fully = 'de.ozerov.fully'
# The Skylight app, plus Skylight's updater, which also relaunches it whenever it's closed.
$skylightPackages = 'skylight.watchdog', 'com.skylight'

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Note($msg) { Write-Host $msg -ForegroundColor Yellow }

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
    if ($lines -match 'unauthorized') { Note 'Tap Allow on the tablet (tick "Always allow from this computer").' }
    Start-Sleep -Seconds 2
}

$maker = (& $adb shell getprop ro.product.manufacturer).Trim()
$model = (& $adb shell getprop ro.product.model).Trim()
if ($Device -eq 'Auto') {
    # pm list packages includes disabled apps, so this still works on a re-run.
    $Device = if (& $adb shell pm list packages com.skylight) { 'Skylight' } else { 'Generic' }
}
$isSamsung = $maker -ieq 'samsung'
Write-Host "Tablet: $maker $model ($Device)"
if ($Device -eq 'Skylight' -and -not $TimeZone) { $TimeZone = 'America/New_York' }

if ($Restore) {
    if ($Device -eq 'Skylight') {
        Step 'Turning the Skylight app back on'
        foreach ($p in $skylightPackages) {
            & $adb shell appops reset $p
            & $adb shell pm enable $p
        }
        & $adb shell appops write-settings | Out-Null
    }
    Step 'Removing the wall display settings'
    & $adb shell rm -f /sdcard/fully-auto-settings.json
    & $adb shell settings put system accelerometer_rotation 1
    & $adb shell locksettings set-disabled false | Out-Null
    if ($Device -eq 'Generic') {
        & $adb shell settings put global stay_on_while_plugged_in 0
        & $adb shell settings put system screen_off_timeout 120000
    } else {
        & $adb shell am start -n com.skylight/odesk.johnlife.skylight.activity.MainActivity | Out-Null
    }
    Write-Host "`nUndone. To remove Fully too: adb uninstall $fully" -ForegroundColor Green
    return
}

Step 'Installing Fully Kiosk Browser'
$apk = Join-Path $env:TEMP 'Fully-Kiosk-Browser.apk'
Invoke-WebRequest $fullyApkUrl -OutFile $apk
# --no-incremental: incremental installs kernel-panic the Skylight firmware; harmless elsewhere.
& $adb install -r --no-incremental $apk

if ($TimeZone) {
    Step "Setting the time zone to $TimeZone"
    & $adb shell settings put global auto_time_zone 0
    & $adb shell cmd alarm set-timezone $TimeZone
}

Step 'Keeping the screen on and letting Fully start itself at boot'
& $adb shell settings put global stay_on_while_plugged_in 7
& $adb shell settings put system screen_off_timeout 2147483647
# Android 10+ only lets an app open itself at boot if it may draw over other apps.
& $adb shell appops set $fully SYSTEM_ALERT_WINDOW allow
& $adb shell dumpsys deviceidle whitelist +$fully | Out-Null

Step "Wall display settings: no screensaver, $($Orientation.ToLower()) orientation, no lock screen, silent taps"
# Android's own screensaver would cover the app; the app has its own.
& $adb shell settings put secure screensaver_enabled 0
& $adb shell settings put secure screensaver_activate_on_sleep 0
& $adb shell settings put secure screensaver_activate_on_dock 0
if ($Orientation -eq 'Auto') {
    & $adb shell settings put system accelerometer_rotation 1
} else {
    # Rotation 0 is the panel's natural orientation, which is portrait on some
    # tablets and landscape on others; `wm size` reports the natural size.
    $size = [regex]::Match((& $adb shell wm size) -join ' ', '(\d+)x(\d+)')
    $naturalLandscape = [int]$size.Groups[1].Value -gt [int]$size.Groups[2].Value
    $rotation = if (($Orientation -eq 'Landscape') -eq $naturalLandscape) { 0 } else { 1 }
    & $adb shell settings put system accelerometer_rotation 0
    & $adb shell settings put system user_rotation $rotation
}
& $adb shell settings put system sound_effects_enabled 0
& $adb shell settings put system lockscreen_sounds_enabled 0
& $adb shell settings put system haptic_feedback_enabled 0
# Only works when no PIN, pattern or password is set; the script says so below.
$lockOff = (& $adb shell locksettings set-disabled true) -join ' '

if ($Device -eq 'Skylight') {
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
if ($lockOff -notmatch 'set to true') {
    Note 'The lock screen is still on, probably because a PIN, pattern or password is set. Set Screen lock to None on the tablet.'
}
if ($Device -eq 'Generic') {
    Note 'Still to do on the tablet (docs/TABLET-SETUP.md, "Ordinary Android tablets"):'
    if ($isSamsung) {
        Note ' - Settings > Battery > Battery protection: Maximum, so it stops charging at 80% (older One UI:'
        Note '   More battery settings > Protect battery). It is plugged in all day.'
        Note ' - Settings > Battery > Background usage limits > Never sleeping apps: add Fully Kiosk Browser.'
    } else {
        Note ' - Turn on the battery charge limit if the tablet has one (it is plugged in all day).'
    }
    Note ' - Pressing Home leaves Fully. Fully PLUS Kiosk Mode blocks that (see the guide).'
}
