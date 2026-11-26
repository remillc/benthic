# Keeps the adb port forwards of the Benthic development server on every plugged Android device.
# adb reverse is tied to the USB connection: unplugging the cable drops it, and the app on the phone or tablet then
# cannot reach the local server (API on 8080, git on 3443, photo and video storage on 9000). This loop checks every 5 seconds and puts back what is missing.
# Started at logon by the scheduled task « Benthic adb reverse » (see the end of this file to install it by hand).
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$ports = 8080, 3443, 9000
while ($true) {
    try {
        $devices = & $adb devices 2>$null | Select-String '^\S+\s+device$' | ForEach-Object { ($_ -split '\s+')[0] }
        foreach ($d in $devices) {
            $list = (& $adb -s $d reverse --list 2>$null) -join "`n"
            foreach ($p in $ports) {
                if ($list -notmatch "tcp:$p tcp:$p") { & $adb -s $d reverse "tcp:$p" "tcp:$p" *> $null }
            }
        }
    } catch {
        # adb not running yet, a device going away: try again at the next round.
    }
    Start-Sleep -Seconds 5
}

# Install as a logon task (once, in PowerShell):
#   $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File F:\projets\benthic\tools\dev\adb-reverse-watch.ps1'
#   Register-ScheduledTask -TaskName 'Benthic adb reverse' -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries)
# Remove: Unregister-ScheduledTask -TaskName 'Benthic adb reverse' -Confirm:$false
