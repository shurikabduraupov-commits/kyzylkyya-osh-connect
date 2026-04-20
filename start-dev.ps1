$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $projectRoot "artifacts\kyzylkiya-osh-rides"

if (-not (Test-Path $appDir)) {
  Write-Error "App directory not found: $appDir"
  exit 1
}

$frontendCommand = @"
Set-Location '$appDir'
`$env:PORT='5173'
`$env:BASE_PATH='/'
pnpm run dev
"@

$backendCommand = @"
Set-Location '$appDir'
`$env:PORT='24615'
if (Get-Command python -ErrorAction SilentlyContinue) {
  python server.py
} else {
  py server.py
}
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand

Write-Host "Started frontend and backend in separate windows."
