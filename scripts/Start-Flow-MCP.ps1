param()

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

$nodeExe = Find-NodeExe
if (-not $nodeExe) {
  Write-Host "Node.js was not found. Run scripts\Setup-Flow-MCP.ps1 first." -ForegroundColor Yellow
  exit 2
}

$configPath = Join-Path $ProjectDir "config\flow.config.json"
if (-not (Test-Path $configPath)) {
  Write-Host "Local Flow config not found: $configPath" -ForegroundColor Yellow
  Write-Host "Run scripts\Setup-Flow-MCP.ps1 first."
  exit 3
}

Push-Location $ProjectDir
try {
  Write-Host "Starting Google Flow Browser MCP..."
  Write-Host "Node: $nodeExe"
  & $nodeExe "src\index.js"
  exit $LASTEXITCODE
} finally {
  Pop-Location
}