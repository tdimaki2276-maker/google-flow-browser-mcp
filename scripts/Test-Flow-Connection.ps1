param()

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProgramFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")

function Find-NodeExe {
  $candidates = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 "nodejs\node.exe" }),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "nodejs\node.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) { return $candidates[0] }

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
  Write-Host "Local Flow config not found. Run scripts\Setup-Flow-MCP.ps1 first." -ForegroundColor Yellow
  exit 3
}

Push-Location $ProjectDir
try {
  & $nodeExe "scripts\Test-Flow-Connection.mjs"
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
