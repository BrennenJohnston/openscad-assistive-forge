<#
.SYNOPSIS
  Desktop-side parity render — thin wrapper over run-parity.mjs --desktop.

.DESCRIPTION
  Renders every fixture in scripts/parity/fixtures.json with the desktop
  OpenSCAD CLI into artifacts/parity/desktop/. Parameter -D arguments are
  computed in Node by the same scad-param-formatter.js the app uses and
  passed to the binary via execFile (no shell), which avoids the
  PowerShell 5.1 quote-mangling that broke earlier harnesses.

.PARAMETER OpenSCADPath
  Path to the desktop openscad.com console binary.
  Default: OpenSCAD Nightly. For version-matched parity runs, point this
  at the snapshot matching the WASM engine, e.g.
  C:\Tools\OpenSCAD-2026.04.03\openscad.com

.PARAMETER CiOnly
  Only render fixtures marked ci:true in fixtures.json.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\parity\render-desktop.ps1
  powershell -ExecutionPolicy Bypass -File scripts\parity\render-desktop.ps1 -OpenSCADPath "C:\Tools\OpenSCAD-2026.04.03\openscad.com"
#>

[CmdletBinding()]
param(
    [string]$OpenSCADPath = "C:\Program Files\OpenSCAD (Nightly)\openscad.com",
    [switch]$CiOnly
)

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptRoot)

$nodeArgs = @((Join-Path $ScriptRoot 'run-parity.mjs'), '--desktop', '--openscad', $OpenSCADPath)
if ($CiOnly) { $nodeArgs += '--ci-only' }

Push-Location $RepoRoot
try {
    & node @nodeArgs
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
