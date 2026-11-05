$ErrorActionPreference='Stop'
$workspaceRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$probe=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$installation=& $probe -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$installation){throw 'The Windows Actions runner must provide the Visual C++ build tools'}
& (Join-Path $installation 'Common7\Tools\Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation | Out-Null
$output=Join-Path $workspaceRoot 'release\app\dist\native\windows'
New-Item -ItemType Directory -Path $output -Force | Out-Null
& cl.exe /nologo /std:c++17 /EHsc /MT /W4 /DWIN32_LEAN_AND_MEAN "/Fo$(Join-Path $output 'vault-consent.obj')" "/Fe$(Join-Path $output 'vault-consent.exe')" (Join-Path $workspaceRoot 'native\windows\VaultConsent.cpp') runtimeobject.lib user32.lib
if($LASTEXITCODE -ne 0){throw 'Could not compile the Windows Hello desktop helper'}
Remove-Item -LiteralPath (Join-Path $output 'vault-consent.obj') -Force
