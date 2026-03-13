<#
.SYNOPSIS
  Desktop Parity Audit Harness — runs OpenSCAD CLI against keyguard v75
  test fixture and captures structured reference data.

.DESCRIPTION
  Executes both OpenSCAD 2021.01 (CGAL) and Nightly 2026.01.03 (Manifold)
  against 3 test scenarios, capturing console output, geometry stats,
  face colors (Nightly COFF), and screenshots.

.PARAMETER DryRun
  Print commands without executing OpenSCAD.

.PARAMETER OutputDir
  Override default output directory.
#>

[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'

# ── Configuration ────────────────────────────────────────────────────────

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot

$OpenSCAD2021 = "C:\Program Files\OpenSCAD\openscad.com"
$OpenSCADNightly = "C:\Program Files\OpenSCAD (Nightly)\openscad.com"

$FixtureDir = Join-Path $RepoRoot "tests\fixtures\keyguard-v75"
$ParseOffColors = Join-Path $ScriptRoot "parse-off-colors.js"

if (-not $OutputDir) {
    $OutputDir = Join-Path $RepoRoot "docs\audit\testing-round-7\reference-data\cli-extracts"
}

$Scenarios = @(
    @{
        id         = "3d-printed-keyguard"
        params     = @{ type_of_keyguard = "3D-Printed"; generate = "keyguard" }
        geom_type  = "3D"
        svg_export = $false
    },
    @{
        id         = "laser-cut-keyguard"
        params     = @{ type_of_keyguard = "Laser-Cut"; generate = "keyguard" }
        geom_type  = "3D"
        svg_export = $false
    },
    @{
        id         = "laser-cut-first-layer"
        params     = @{ type_of_keyguard = "Laser-Cut"; generate = "first layer for SVG/DXF file" }
        geom_type  = "2D"
        svg_export = $true
    }
)

$Versions = @(
    @{
        id       = "2021.01"
        exe      = $OpenSCAD2021
        backend  = "CGAL"
        has_coff = $false
    },
    @{
        id       = "nightly"
        exe      = $OpenSCADNightly
        backend  = "Manifold"
        has_coff = $true
    }
)

# ── Helper Functions ─────────────────────────────────────────────────────

function Write-Status {
    param([string]$Message, [string]$Level = "INFO")
    $color = switch ($Level) {
        "INFO"  { "Cyan" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "OK"    { "Green" }
        default { "White" }
    }
    Write-Host "[$Level] $Message" -ForegroundColor $color
}

function Build-DArgs {
    param([hashtable]$Params)
    $dargs = @()
    foreach ($kv in $Params.GetEnumerator()) {
        $dargs += "-D"
        $dargs += "$($kv.Key)=""$($kv.Value)"""
    }
    return $dargs
}

function Parse-ConsoleOutput {
    param([string]$RawOutput)

    $lines = $RawOutput -split "`r?`n"
    $echoLines = @()
    $warnings = @()
    $errors = @()
    $vertices = $null
    $facets = $null
    $renderTime = $null

    foreach ($line in $lines) {
        if ($line -match '^\s*ECHO:') {
            $echoLines += $line.Trim()
        }
        elseif ($line -match 'WARNING:') {
            $warnings += $line.Trim()
        }
        elseif ($line -match 'ERROR:') {
            $errors += $line.Trim()
        }

        if ($line -match 'Number of vertices.*?:\s*(\d+)') {
            $vertices = [int]$Matches[1]
        }
        if ($line -match 'Number of.*?facets.*?:\s*(\d+)') {
            $facets = [int]$Matches[1]
        }
        # OpenSCAD outputs render time in multiple formats
        if ($line -match 'Total rendering time:\s*([\d.]+)\s*seconds') {
            $renderTime = [double]$Matches[1]
        }
        elseif ($line -match 'Total rendering time:\s*(\d+):(\d+):([\d.]+)') {
            $h = [int]$Matches[1]; $m = [int]$Matches[2]; $s = [double]$Matches[3]
            $renderTime = $h * 3600 + $m * 60 + $s
        }
        if ($line -match 'Top level object is a 3D object') {
            # 3D geometry confirmed
        }
        if ($line -match '^\s+Vertices:\s+(\d+)') {
            $vertices = [int]$Matches[1]
        }
        if ($line -match '^\s+Facets:\s+(\d+)') {
            $facets = [int]$Matches[1]
        }
    }

    return @{
        echo_lines  = $echoLines
        warnings    = $warnings
        errors      = $errors
        vertices    = $vertices
        facets      = $facets
        render_time = $renderTime
        raw         = $RawOutput
    }
}

function Run-OpenSCADExport {
    param(
        [string]$Exe,
        [string]$ScadFile,
        [string]$OutputFile,
        [hashtable]$Params,
        [string[]]$ExtraArgs = @()
    )

    $dArgs = Build-DArgs -Params $Params
    $allArgs = @("-o", $OutputFile) + $dArgs + $ExtraArgs + @($ScadFile)

    if ($DryRun) {
        $displayArgs = @()
        for ($i = 0; $i -lt $allArgs.Count; $i++) {
            $a = $allArgs[$i]
            if ($a -eq "-D" -and ($i + 1) -lt $allArgs.Count) {
                $dv = $allArgs[$i + 1]
                $displayArgs += "-D `"$($dv -replace '"', '\"')`""
                $i++
            } else { $displayArgs += $a }
        }
        Write-Status "[DRY-RUN] & `"$Exe`" $($displayArgs -join ' ')"
        return ""
    }

    Write-Status "Running: $([System.IO.Path]::GetFileName($Exe)) -> $([System.IO.Path]::GetFileName($OutputFile))"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe

    # Build command-line string with proper quoting for -D parameters.
    # OpenSCAD needs: -D "var=\"string value\""
    $argParts = @()
    for ($i = 0; $i -lt $allArgs.Count; $i++) {
        $arg = $allArgs[$i]
        if ($arg -eq "-D" -and ($i + 1) -lt $allArgs.Count) {
            $dval = $allArgs[$i + 1]
            # Escape inner quotes and wrap in outer quotes
            $escaped = $dval -replace '"', '\"'
            $argParts += "-D"
            $argParts += "`"$escaped`""
            $i++
        } elseif ($arg -match '\s') {
            $argParts += "`"$arg`""
        } else {
            $argParts += $arg
        }
    }
    $psi.Arguments = $argParts -join ' '
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    $stdoutBuilder = New-Object System.Text.StringBuilder
    $stderrBuilder = New-Object System.Text.StringBuilder

    $stdoutEvent = Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action {
        if ($null -ne $EventArgs.Data) { $Event.MessageData.AppendLine($EventArgs.Data) | Out-Null }
    } -MessageData $stdoutBuilder

    $stderrEvent = Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action {
        if ($null -ne $EventArgs.Data) { $Event.MessageData.AppendLine($EventArgs.Data) | Out-Null }
    } -MessageData $stderrBuilder

    $process.Start() | Out-Null
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    $timeout = 600000  # 10 minutes
    $exited = $process.WaitForExit($timeout)

    Unregister-Event -SourceIdentifier $stdoutEvent.Name
    Unregister-Event -SourceIdentifier $stderrEvent.Name

    if (-not $exited) {
        $process.Kill()
        Write-Status "Process timed out after 10 minutes" "ERROR"
        return "TIMEOUT"
    }

    $combined = $stdoutBuilder.ToString() + "`n" + $stderrBuilder.ToString()
    return $combined
}

# ── Validation ───────────────────────────────────────────────────────────

Write-Status "=== Desktop Parity Audit Harness ==="
Write-Status "Repo root: $RepoRoot"
Write-Status "Output dir: $OutputDir"
if ($DryRun) { Write-Status "*** DRY-RUN MODE - no OpenSCAD commands will execute ***" "WARN" }

foreach ($v in $Versions) {
    if (-not (Test-Path $v.exe)) {
        Write-Status "OpenSCAD not found: $($v.exe)" "ERROR"
        exit 1
    }
    Write-Status "Found OpenSCAD $($v.id): $($v.exe)" "OK"
}

if (-not (Test-Path $FixtureDir)) {
    Write-Status "Fixture directory not found: $FixtureDir" "ERROR"
    exit 1
}
Write-Status "Fixture directory: $FixtureDir" "OK"

if (-not (Test-Path $ParseOffColors)) {
    Write-Status "parse-off-colors.js not found: $ParseOffColors" "ERROR"
    exit 1
}

# ── Prepare temp working directory ───────────────────────────────────────

$TempDir = Join-Path $env:TEMP "openscad-audit-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
Write-Status "Temp working directory: $TempDir"

Copy-Item (Join-Path $FixtureDir "*") -Destination $TempDir -Recurse
$ScadFile = Join-Path $TempDir "keyguard_v75.scad"

if (-not (Test-Path $ScadFile)) {
    Write-Status "SCAD file not found in temp dir: $ScadFile" "ERROR"
    exit 1
}

# ── Build info capture ───────────────────────────────────────────────────

$BuildInfos = @{}
foreach ($v in $Versions) {
    if ($DryRun) {
        Write-Status "[DRY-RUN] & `"$($v.exe)`" --info" 
        $BuildInfos[$v.id] = "DRY-RUN"
    } else {
        $info = & $v.exe --info 2>&1 | Out-String
        $BuildInfos[$v.id] = $info.Trim()
        Write-Status "Build info captured for $($v.id)" "OK"
    }
}

# ── Main execution loop ─────────────────────────────────────────────────

$SummaryRows = @()

foreach ($v in $Versions) {
    $versionOutDir = Join-Path $OutputDir $v.id
    New-Item -ItemType Directory -Path $versionOutDir -Force | Out-Null

    if ($v.id -eq "nightly") {
        $screenshotDir = Join-Path $versionOutDir "screenshots"
        New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null
    }

    foreach ($s in $Scenarios) {
        Write-Status ""
        Write-Status "=== $($v.id) / $($s.id) ==="

        $scenarioTempDir = Join-Path $TempDir "$($v.id)-$($s.id)"
        New-Item -ItemType Directory -Path $scenarioTempDir -Force | Out-Null

        # STL export
        $stlFile = Join-Path $scenarioTempDir "output.stl"
        $stlConsole = Run-OpenSCADExport `
            -Exe $v.exe `
            -ScadFile $ScadFile `
            -OutputFile $stlFile `
            -Params $s.params

        $parsed = Parse-ConsoleOutput -RawOutput $stlConsole

        # OFF export (Nightly with COFF, 2021.01 plain)
        $offFile = Join-Path $scenarioTempDir "output.off"
        $offExtraArgs = @()
        if ($v.has_coff) {
            $offExtraArgs = @("--enable=render-colors")
        }
        $offConsole = Run-OpenSCADExport `
            -Exe $v.exe `
            -ScadFile $ScadFile `
            -OutputFile $offFile `
            -Params $s.params `
            -ExtraArgs $offExtraArgs

        # Parse OFF colors
        $faceColors = $null
        if (-not $DryRun -and (Test-Path $offFile)) {
            if ($v.has_coff) {
                try {
                    $colorJson = & node $ParseOffColors $offFile 2>&1 | Out-String
                    $colorData = $colorJson | ConvertFrom-Json
                    if ($colorData.is_coff -and $colorData.unique_colors.Count -gt 0) {
                        $faceColors = $colorData.unique_colors
                    } else {
                        $faceColors = "no_color_data_in_off"
                    }
                } catch {
                    Write-Status "Failed to parse OFF colors: $_" "WARN"
                    $faceColors = "parse_error"
                }
            } else {
                $faceColors = "not_available_cgal_backend"
            }
        } elseif ($DryRun) {
            $faceColors = "dry_run"
        } else {
            $faceColors = "off_export_failed"
        }

        # SVG export (first-layer only)
        $svgInfo = $null
        if ($s.svg_export) {
            $svgFile = Join-Path $scenarioTempDir "output.svg"
            $svgConsole = Run-OpenSCADExport `
                -Exe $v.exe `
                -ScadFile $ScadFile `
                -OutputFile $svgFile `
                -Params $s.params

            if (-not $DryRun -and (Test-Path $svgFile)) {
                $svgBytes = (Get-Item $svgFile).Length
                $svgContent = Get-Content $svgFile -Raw -ErrorAction SilentlyContinue
                $svgPathCount = 0
                $svgViewBox = ""
                if ($svgContent) {
                    $svgPathCount = ([regex]::Matches($svgContent, '<path ')).Count +
                                    ([regex]::Matches($svgContent, '<polygon ')).Count
                    if ($svgContent -match 'viewBox="([^"]*)"') {
                        $svgViewBox = $Matches[1]
                    }
                }
                $svgInfo = @{
                    file_size_bytes = $svgBytes
                    path_count      = $svgPathCount
                    viewBox         = $svgViewBox
                }
            }
        }

        # PNG screenshot (Nightly only for committed output)
        $pngPath = $null
        if ($v.id -eq "nightly") {
            $pngFile = Join-Path $scenarioTempDir "screenshot.png"
            $pngConsole = Run-OpenSCADExport `
                -Exe $v.exe `
                -ScadFile $ScadFile `
                -OutputFile $pngFile `
                -Params $s.params `
                -ExtraArgs @("--imgsize=800,600")

            if (-not $DryRun -and (Test-Path $pngFile)) {
                $destPng = Join-Path $screenshotDir "$($s.id).png"
                Copy-Item $pngFile $destPng -Force
                $pngPath = "cli-extracts/nightly/screenshots/$($s.id).png"
                Write-Status "Screenshot saved: $destPng" "OK"
            }
        } else {
            # Also capture a screenshot for 2021.01 in temp (not committed)
            $pngFile = Join-Path $scenarioTempDir "screenshot.png"
            $pngConsole = Run-OpenSCADExport `
                -Exe $v.exe `
                -ScadFile $ScadFile `
                -OutputFile $pngFile `
                -Params $s.params `
                -ExtraArgs @("--imgsize=800,600")
        }

        # Assemble JSON result
        $stlBytes = 0
        $offBytes = 0
        if (-not $DryRun) {
            if (Test-Path $stlFile) { $stlBytes = (Get-Item $stlFile).Length }
            if (Test-Path $offFile) { $offBytes = (Get-Item $offFile).Length }
        }

        $result = [ordered]@{
            openscad_version = $(if ($v.id -eq "nightly") { "2026.01.03" } else { "2021.01" })
            backend          = $v.backend
            scenario_id      = $s.id
            parameters       = $s.params
            console          = [ordered]@{
                echo_lines = $parsed.echo_lines
                warnings   = $parsed.warnings
                errors     = $parsed.errors
            }
            geometry         = [ordered]@{
                type         = $s.geom_type
                vertices     = $parsed.vertices
                facets       = $parsed.facets
                render_time_s = $parsed.render_time
            }
            face_colors      = $faceColors
            exports          = [ordered]@{
                off_bytes = $offBytes
                stl_bytes = $stlBytes
            }
        }

        if ($pngPath) { $result.exports.png_path = $pngPath }
        if ($svgInfo) { $result.exports.svg = $svgInfo }

        # Write JSON
        $jsonFile = Join-Path $versionOutDir "$($s.id).json"
        $result | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonFile -Encoding utf8
        Write-Status "JSON written: $jsonFile" "OK"

        # Console log
        $consoleFile = Join-Path $scenarioTempDir "console.txt"
        if (-not $DryRun) {
            $parsed.raw | Set-Content -Path $consoleFile -Encoding utf8
        }

        # Summary row
        $SummaryRows += [PSCustomObject]@{
            Version   = $v.id
            Scenario  = $s.id
            Vertices  = $parsed.vertices
            Facets    = $parsed.facets
            RenderSec = $parsed.render_time
            Echos     = $parsed.echo_lines.Count
            Warnings  = $parsed.warnings.Count
            Colors    = if ($faceColors -is [array]) { $faceColors.Count } else { $faceColors }
            STL_KB    = [math]::Round($stlBytes / 1024, 1)
            OFF_KB    = [math]::Round($offBytes / 1024, 1)
        }
    }
}

# ── Summary Table ────────────────────────────────────────────────────────

Write-Status ""
Write-Status "=== Summary Comparison ==="
$SummaryRows | Format-Table -AutoSize

# ── Cleanup ──────────────────────────────────────────────────────────────

if (-not $DryRun) {
    Write-Status "Temp directory preserved for inspection: $TempDir"
    Write-Status "To clean up: Remove-Item -Recurse -Force '$TempDir'"
} else {
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    Write-Status "Temp directory cleaned up (dry run)"
}

Write-Status ""
Write-Status "=== Audit Complete ===" "OK"
Write-Status "Results in: $OutputDir"
