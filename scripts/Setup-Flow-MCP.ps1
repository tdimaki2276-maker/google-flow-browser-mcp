param(
  [string]$ExpectedAccount = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProgramFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")

function Find-NodeExe {
  $candidateList = New-Object System.Collections.Generic.List[string]

  if ($env:ProgramFiles) { $candidateList.Add((Join-Path $env:ProgramFiles "nodejs\node.exe")) }
  if ($ProgramFilesX86) { $candidateList.Add((Join-Path $ProgramFilesX86 "nodejs\node.exe")) }
  if ($env:LOCALAPPDATA) {
    $candidateList.Add((Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"))
    $candidateList.Add((Join-Path $env:LOCALAPPDATA "nodejs\node.exe"))
  }

  if ($env:USERPROFILE) {
    $candidateList.Add((Join-Path $env:USERPROFILE "Documents\Video Editor\remotion-editor\.tools\node\node.exe"))
    $candidateList.Add((Join-Path $env:USERPROFILE "Desktop\remotion-editor\.tools\node\node.exe"))

    Get-ChildItem -Path $env:USERPROFILE -Directory -Filter "OneDrive*" -ErrorAction SilentlyContinue | ForEach-Object {
      $candidateList.Add((Join-Path $_.FullName "Documents\Video Editor\remotion-editor\.tools\node\node.exe"))
    }
  }

  foreach ($candidate in $candidateList) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }

  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  return $null
}

function Find-ChromeExe {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 "Google\Chrome\Application\chrome.exe" }),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) { return $candidates[0] }
  return $null
}

Write-Host ""
Write-Host "Google Flow Browser MCP - Windows setup"
Write-Host "No system PATH changes will be made."
Write-Host ""

$nodeExe = Find-NodeExe
if (-not $nodeExe) {
  Write-Host "Node.js was not found in the common locations." -ForegroundColor Yellow
  Write-Host "Nothing was installed and no system settings were changed."
  Write-Host "Install/use an existing Node.js 18+ executable, then run this script again."
  exit 2
}

$nodeVersion = & $nodeExe --version
Write-Host "Node found: $nodeExe ($nodeVersion)"

$nodeDir = Split-Path -Parent $nodeExe
$npmCmd = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) { $npmCmd = $npm.Source }
}
if (-not (Test-Path $npmCmd)) {
  Write-Host "npm.cmd was not found next to Node.js." -ForegroundColor Yellow
  exit 3
}

$chromeExe = Find-ChromeExe
if (-not $chromeExe) {
  Write-Host "Google Chrome was not found in the common locations." -ForegroundColor Yellow
  Write-Host "Set chromePath manually in config\flow.config.json after setup."
}

if ([string]::IsNullOrWhiteSpace($ExpectedAccount)) {
  $ExpectedAccount = Read-Host "Google account email to verify in Flow"
}

$configDir = Join-Path $ProjectDir "config"
$configPath = Join-Path $configDir "flow.config.json"
$examplePath = Join-Path $configDir "flow.config.example.json"

if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir | Out-Null
}

if (Test-Path $examplePath) {
  $config = Get-Content $examplePath -Raw | ConvertFrom-Json
} else {
  $config = [PSCustomObject]@{
    flowUrl = "https://labs.google/fx/tools/flow"
    expectedAccount = ""
    chromePath = ""
    chromeProfile = "Default"
    chromeUserDataDir = ""
    cdpPort = 9222
    browserMode = "direct-cdp"
    headless = $false
  }
}

$config.expectedAccount = $ExpectedAccount
$config.chromeProfile = "Default"
$config.headless = $false
if ($chromeExe) { $config.chromePath = $chromeExe }

$config | ConvertTo-Json -Depth 8 | Set-Content -Path $configPath -Encoding UTF8
Write-Host "Created local config: $configPath"
Write-Host "This file is ignored by Git and should stay local."

Write-Host ""
Write-Host "Installing project dependencies locally..."
Push-Location $ProjectDir
try {
  & $npmCmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

  Write-Host "Checking JavaScript syntax..."
  & $nodeExe --check "src\browser\launch-profile.js"
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: launch-profile.js" }
  & $nodeExe --check "src\browser\connect.js"
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: connect.js" }
  & $nodeExe --check "src\browser\account-check.js"
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: account-check.js" }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Setup completed." -ForegroundColor Green
Write-Host "Next: run scripts\Start-Flow-MCP.ps1 using PowerShell."
Write-Host "The first flow_connect call will open the dedicated Chrome profile."
Write-Host "Sign in to Google once there; future runs reuse that login unless Google expires it."