<#
.SYNOPSIS
    Run all KI-012 capture bundles through desktop OpenSCAD CLI.

.DESCRIPTION
    Automates Steps 0-6 of the desktop-comparison-protocol.md:
    prepares working directories, runs each bundle's SCAD through
    the specified OpenSCAD executable, collects triangle counts and
    timing, and prints a summary table.

    Visual inspection (Step 5) must still be done manually.

.PARAMETER OpenScadExe
    Full path to the OpenSCAD nightly executable.

.PARAMETER Label
    Short label for the output STL files (e.g. "apr2026", "jan2026", "apr2026-cgal").

.PARAMETER Backend
    Geometry backend to use. Default: "Manifold". Set to "" to omit (uses CGAL).

.PARAMETER BundleDir
    Path to the investigation directory containing the capture bundles.
    Default: the directory containing this script.

.EXAMPLE
    .\run-all-desktop-tests.ps1 -OpenScadExe "C:\OpenSCAD\nightly-2026-04\openscad.exe" -Label "apr2026"
    .\run-all-desktop-tests.ps1 -OpenScadExe "C:\OpenSCAD\nightly-2026-01\openscad.exe" -Label "jan2026"
    .\run-all-desktop-tests.ps1 -OpenScadExe "C:\OpenSCAD\nightly-2026-04\openscad.exe" -Label "apr2026-cgal" -Backend ""
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$OpenScadExe,

    [Parameter(Mandatory=$true)]
    [string]$Label,

    [string]$Backend = "Manifold",

    [string]$BundleDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OpenScadExe)) {
    Write-Error "OpenSCAD executable not found: $OpenScadExe"
    exit 1
}

$version = & $OpenScadExe --version 2>&1
Write-Host "OpenSCAD version: $version" -ForegroundColor Cyan

$bundles = @(
    @{ Name = "baseline"; Dir = "baseline-capture"; OutputPrefix = "baseline" },
    @{ Name = "bug-a";    Dir = "bug-a-capture";    OutputPrefix = "bug-a" },
    @{ Name = "bug-b";    Dir = "bug-b-capture";    OutputPrefix = "bug-b" }
)

function Get-StlTriangleCount([string]$Path) {
    if (-not (Test-Path $Path)) { return 0 }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 84) { return 0 }
    [BitConverter]::ToUInt32($bytes, 80)
}

$results = @()

foreach ($bundle in $bundles) {
    $bundlePath = Join-Path $BundleDir $bundle.Dir
    if (-not (Test-Path $bundlePath)) {
        Write-Warning "Bundle not found: $bundlePath -- skipping"
        continue
    }

    $workDir = Join-Path $bundlePath "work"
    $outputName = "$($bundle.OutputPrefix)-$Label.stl"
    $outputPath = Join-Path $workDir $outputName

    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "Bundle: $($bundle.Name)  ->  $outputName" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow

    # Step 0: Prepare working directory
    if (Test-Path $workDir) {
        Remove-Item $workDir -Recurse -Force
    }
    New-Item $workDir -ItemType Directory -Force | Out-Null

    Copy-Item (Join-Path $bundlePath "scad-source.scad") $workDir

    $companionDir = Join-Path $bundlePath "companion-files"
    if (Test-Path $companionDir) {
        Copy-Item "$companionDir\*" $workDir -Recurse -Force
    }

    # Verify critical companion file exists
    $lwflFile = Join-Path $workDir "Cases and App Specifics\iPad 7,8,9\Fintie-equivalent Case\LWFL\openings_and_additions.txt"
    if (Test-Path $lwflFile) {
        Write-Host "  [OK] LWFL companion file present" -ForegroundColor Green
    } else {
        Write-Warning "  [WARN] LWFL companion file NOT found at expected path"
    }

    # Build args from callmain-args.json
    $argsFile = Join-Path $bundlePath "callmain-args.json"
    $callMainArgs = Get-Content $argsFile -Raw | ConvertFrom-Json

    # Skip first element (./this.program), filter out -o and its value and the input file
    $cliArgs = @()
    $skipNext = $false
    for ($i = 1; $i -lt $callMainArgs.Count; $i++) {
        if ($skipNext) { $skipNext = $false; continue }
        $arg = $callMainArgs[$i]

        if ($arg -eq "-o") {
            $skipNext = $true
            continue
        }
        # Skip the input file path (starts with /work/ or /tmp/)
        if ($arg -match "^/(work|tmp)/.*\.scad$") { continue }
        # Override backend if needed
        if ($arg -match "^--backend=") {
            if ($Backend) {
                $cliArgs += "--backend=$Backend"
            }
            continue
        }

        $cliArgs += $arg
    }

    if ($Backend -and ($cliArgs -notcontains "--backend=$Backend")) {
        $cliArgs = @("--backend=$Backend") + $cliArgs
    }

    $cliArgs += @("-o", $outputName, "scad-source.scad")

    Write-Host "  Running OpenSCAD ($($cliArgs.Count) args)..." -ForegroundColor Cyan

    # Build a properly escaped command-line string so Start-Process
    # preserves literal quotes inside -D values (e.g. type_of_keyguard="3D-Printed").
    # Without this, Windows' C runtime strips the inner quotes as delimiters.
    $argParts = foreach ($a in $cliArgs) {
        if ($a -match '[\s"]') {
            '"' + ($a -replace '\\', '\\' -replace '"', '\"') + '"'
        } else {
            $a
        }
    }
    $argString = $argParts -join ' '

    Push-Location $workDir
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $exitCode = 0
    $stderr = ""
    try {
        $proc = Start-Process -FilePath $OpenScadExe -ArgumentList $argString `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardError (Join-Path $workDir "stderr.txt")
        $exitCode = $proc.ExitCode
        if (Test-Path (Join-Path $workDir "stderr.txt")) {
            $stderr = Get-Content (Join-Path $workDir "stderr.txt") -Raw -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Error "  Failed to run OpenSCAD: $_"
        $exitCode = -1
    }
    $sw.Stop()
    Pop-Location

    $renderTime = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    $triangles = 0
    $fileSize = 0

    if (Test-Path $outputPath) {
        $triangles = Get-StlTriangleCount $outputPath
        $fileSize = (Get-Item $outputPath).Length
        Write-Host "  [OK] $outputName -- ${renderTime}s, $triangles triangles, $fileSize bytes" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] No output file produced (exit code: $exitCode)" -ForegroundColor Red
    }

    if ($stderr -and $stderr.Trim()) {
        $lines = ($stderr.Trim() -split "`n" | Select-Object -First 5)
        Write-Host "  Stderr (first 5 lines):" -ForegroundColor DarkYellow
        foreach ($line in $lines) {
            Write-Host "    $line" -ForegroundColor DarkYellow
        }
    }

    $results += [PSCustomObject]@{
        Bundle      = $bundle.Name
        Label       = $Label
        ExitCode    = $exitCode
        RenderTime  = "${renderTime}s"
        Triangles   = $triangles
        FileSize    = $fileSize
        OutputFile  = $outputPath
    }
}

Write-Host "`n`n========================================"  -ForegroundColor Cyan
Write-Host "SUMMARY: Desktop comparison ($Label)"         -ForegroundColor Cyan
Write-Host "OpenSCAD: $version"                           -ForegroundColor Cyan
Write-Host "Backend: $(if ($Backend) { $Backend } else { 'CGAL (default)' })" -ForegroundColor Cyan
Write-Host "========================================`n"   -ForegroundColor Cyan

$results | Format-Table -AutoSize

Write-Host "`nWASM reference triangle counts:" -ForegroundColor DarkGray
Write-Host "  Baseline: 56,780  |  Bug A: 56,158  |  Bug B: 56,548" -ForegroundColor DarkGray

Write-Host "`nNext: Open each STL in a viewer and check for Bug A / Bug B symptoms." -ForegroundColor Yellow
Write-Host "Record results in desktop-comparison-results.md`n" -ForegroundColor Yellow
