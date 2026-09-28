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
    foreach ($p in $skylightPackages) { & $adb shell pm enable $p }
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

Step 'Turning off the Skylight app so it stops taking over the screen'
# disable-user is reversible (-Restore); the Skylight keyboard stays, it's the tablet's keyboard.
foreach ($p in $skylightPackages) { & $adb shell pm disable-user --user 0 $p }

Step 'Opening the app in Fully'
& $adb shell am start -W -n "$fully/.MainActivity" -a android.intent.action.VIEW -d $Url | Out-Null

Write-Host "`nDone. Finish the Fully settings on the tablet (docs/TABLET-SETUP.md, step 4)." -ForegroundColor Green
