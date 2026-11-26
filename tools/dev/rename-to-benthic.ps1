# Renames the local project folders to the Benthic names. Run it ONCE, in a PowerShell window, AFTER closing
# VS Code and the Claude Code session (they keep files open in F:\projets\OpenDives).
#   F:\projets\OpenDives        -> F:\projets\Benthic
#   F:\projets\OpenDives-fix    -> F:\projets\Benthic-fix      (git worktree on main, used to build the APK)
#   F:\projets\opendives-server -> F:\projets\benthic-server   (private repo; the dev stack runs from it)
# The GitHub repositories are already renamed (remillc/benthic, remillc/benthic-server) and the remotes updated.
$ErrorActionPreference = 'Stop'
Set-Location F:\projets

Write-Host '1. Stopping Vite (5180) and the inbox watcher started from the old folder'
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.CommandLine -match 'projets[\\/]OpenDives' -and $_.Name -in @('node.exe', 'cmd.exe', 'electron.exe', 'benthic-host.exe', 'opendives-host.exe')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host '2. Stopping the dev server stack (its data folders are inside the server folder)'
Push-Location F:\projets\opendives-server
bash scripts/stop.sh
Pop-Location

Write-Host '3. Renaming the folders'
Rename-Item F:\projets\OpenDives Benthic
Rename-Item F:\projets\OpenDives-fix Benthic-fix
Rename-Item F:\projets\opendives-server benthic-server

Write-Host '4. Repairing the git worktree links and dropping stale ones'
git -C F:\projets\Benthic worktree repair F:\projets\Benthic-fix
git -C F:\projets\Benthic worktree prune
git -C F:\projets\Benthic worktree list
git -C F:\projets\benthic-server worktree prune

Write-Host "5. Copying Claude Code's project memory to the new path"
$old = "$env:USERPROFILE\.claude\projects\f--projets-OpenDives"
$new = "$env:USERPROFILE\.claude\projects\f--projets-Benthic"
if (Test-Path $old) { New-Item -ItemType Directory -Force $new | Out-Null; Copy-Item "$old\memory" $new -Recurse -Force }

Write-Host '6. Starting the dev server stack again'
Push-Location F:\projets\benthic-server
bash scripts/start.sh
Pop-Location

Write-Host '7. Starting Vite on 5180 again'
Start-Process cmd.exe -ArgumentList '/c', 'npx vite --host --port 5180 --strictPort --force > "%TEMP%\od-vite-5180.log" 2>&1' -WorkingDirectory F:\projets\Benthic\app -WindowStyle Hidden

Write-Host ''
Write-Host 'Done. Open VS Code on F:\projets\Benthic and start Claude Code there.'
Write-Host 'Phone install from now on: powershell -File F:\projets\install-phone.ps1'
Write-Host 'If the phone talks to the dev server over USB, run again: bash tools/dev-phone.sh 59021FDCQ00589 --no-start (in F:\projets\Benthic)'
