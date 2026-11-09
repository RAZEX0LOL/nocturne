$ErrorActionPreference = 'Stop'

function Install-Quietly([string]$Path) {
    $process = Start-Process -FilePath $Path -ArgumentList '/S' -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
}

# Фиксированный официальный установщик: проверяем переход с реально выпущенной версии.
$legacyInstaller = Join-Path $env:RUNNER_TEMP 'nocturne-legacy.exe'
Invoke-WebRequest 'https://github.com/RAZEX0LOL/nocturne-releases/releases/download/updates/Nocturne_1.1.83_x64-setup.exe' -OutFile $legacyInstaller
if ((Get-FileHash $legacyInstaller -Algorithm SHA256).Hash -ne '06FAEA77AA9113AA7BF13A1768504B1E71378BE5C8B1D9D26BC5B62FF38AB63B') {
    throw 'Legacy installer checksum mismatch'
}
Install-Quietly $legacyInstaller
$legacyKey = 'HKCU:\Software\Nocturne\Nocturne'
$oldUninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nocturne'
$newKey = 'HKCU:\Software\Nocturne\Nocturne Player'
$newUninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nocturne Player'
$installedAt = (Get-Item $legacyKey).GetValue('')
if (-not $installedAt -or -not (Test-Path "$installedAt\nocturne.exe")) { throw 'Legacy install not found' }
$marker = Join-Path $installedAt 'rename-preservation.txt'
Set-Content $marker 'keep-existing-files'
$dataDirectory = Join-Path $env:LOCALAPPDATA 'app.nocturne.music'
New-Item $dataDirectory -ItemType Directory -Force | Out-Null
$dataMarker = Join-Path $dataDirectory 'rename-preservation.txt'
Set-Content $dataMarker 'keep-user-data'

$installer = (Get-ChildItem 'desktop/src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1).FullName
if (-not $installer) { throw 'New installer not found' }
Install-Quietly $installer
if ((Get-Item $newKey).GetValue('') -ne $installedAt) { throw 'Rename created a second installation' }
if ((Get-ItemProperty $newUninstall).DisplayName -ne 'Nocturne Player') { throw 'Incorrect display name' }
if (Test-Path $oldUninstall) { throw 'Legacy uninstall registration remains' }
if (Test-Path $legacyKey) { throw 'Legacy product registration remains' }
if ((Get-Content $marker) -ne 'keep-existing-files') { throw 'Existing files changed' }
if ((Get-Content $dataMarker) -ne 'keep-user-data') { throw 'User data changed' }
if ((Get-FileHash "$installedAt\nocturne.exe").Hash -ne (Get-FileHash 'desktop/src-tauri/target/release/nocturne.exe').Hash) { throw 'Installed executable was not updated' }
# Повторное обновление уже переименованного приложения тоже остаётся на том же месте.
Install-Quietly $installer
if ((Get-Item $newKey).GetValue('') -ne $installedAt) { throw 'Reinstall changed location' }
Write-Output 'PASS: Nocturne 1.1.83 -> Nocturne Player, same installation, files and user data preserved; reinstall passed'
