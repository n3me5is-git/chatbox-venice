param([Parameter(Mandatory)][string]$Executable,[string]$ExpectedIcon='assets/fork-icon.ico')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskExe=(Resolve-Path -LiteralPath $Executable).Path
$taskIcon=(Resolve-Path -LiteralPath $ExpectedIcon).Path
$taskActual=[Drawing.Icon]::ExtractAssociatedIcon($taskExe)
$taskExpected=[Drawing.Icon]::new($taskIcon,$taskActual.Width,$taskActual.Height)
$taskBitmap=$taskActual.ToBitmap();$taskReference=$taskExpected.ToBitmap()
try {
  $taskMismatch=0
  for($taskY=0;$taskY -lt $taskBitmap.Height;$taskY++) { for($taskX=0;$taskX -lt $taskBitmap.Width;$taskX++) {
    $taskPixel=$taskBitmap.GetPixel($taskX,$taskY);$taskWant=$taskReference.GetPixel($taskX,$taskY)
    if($taskPixel.A -eq 0 -and $taskWant.A -eq 0){continue}
    if([Math]::Abs($taskPixel.A-$taskWant.A)+[Math]::Abs($taskPixel.R-$taskWant.R)+[Math]::Abs($taskPixel.G-$taskWant.G)+[Math]::Abs($taskPixel.B-$taskWant.B) -gt 8){$taskMismatch++}
  } }
  if($taskMismatch -gt $taskBitmap.Width*$taskBitmap.Height*0.02){throw 'The packaged executable does not contain the fork icon'}
  if((Get-Item -LiteralPath $taskExe).VersionInfo.ProductName -ne 'Chatbox Venice'){throw 'The executable still has the upstream product name'}
  Write-Output 'Verified embedded Windows fork icon and product name'
} finally {$taskBitmap.Dispose();$taskReference.Dispose();$taskActual.Dispose();$taskExpected.Dispose()}
