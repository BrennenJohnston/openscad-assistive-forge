<#
.SYNOPSIS
    Download and swap the OpenSCAD WASM build for version bisect testing.

.DESCRIPTION
    Downloads a WASM snapshot from files.openscad.org/snapshots/, extracts
    openscad.js and openscad.wasm, places them in public/wasm/openscad-official/,
    and updates INTEGRITY.json. Backs up the current build first.

    After swapping, run `pixi run dev` (or `npm run dev`) to test with the
    new build. The app's WASM integrity check reads INTEGRITY.json, so updating
    it avoids size-mismatch warnings.

.PARAMETER BuildDate
    The date of the WASM build to download (e.g., "2026.01.03", "2025.03.25").
    Must match a WebAssembly-web.zip on files.openscad.org/snapshots/.

.PARAMETER Restore
    Restore the backed-up original build instead of downloading a new one.

.PARAMETER ProjectRoot
    Path to the project root. Default: two levels up from the script directory
    (assumes script is in docs/audit/ki-012-investigation/).

.PARAMETER SkipBackup
    Skip backing up the current build (useful when re-running after a failed swap).

.EXAMPLE
    .\swap-wasm-build.ps1 -BuildDate "2026.01.03"
    .\swap-wasm-build.ps1 -BuildDate "2026.02.01"
    .\swap-wasm-build.ps1 -Restore
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$BuildDate,

    [switch]$Restore,

    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,

    [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"

$wasmDir = Join-Path $ProjectRoot "public\wasm\openscad-official"
$backupDir = Join-Path $PSScriptRoot "_wasm-backup"
$cacheDir = Join-Path $PSScriptRoot "_wasm-cache"
$integrityFile = Join-Path $wasmDir "INTEGRITY.json"

if (-not (Test-Path $wasmDir)) {
    Write-Error "WASM directory not found: $wasmDir"
    exit 1
}

# --- Restore mode ---

if ($Restore) {
    if (-not (Test-Path $backupDir)) {
        Write-Error "No backup found at $backupDir. Nothing to restore."
        exit 1
    }

    Write-Host "Restoring original WASM build from backup..." -ForegroundColor Cyan

    foreach ($file in @("openscad.js", "openscad.wasm", "INTEGRITY.json")) {
        $src = Join-Path $backupDir $file
        $dst = Join-Path $wasmDir $file
        if (Test-Path $src) {
            Copy-Item $src $dst -Force
            Write-Host "  Restored $file" -ForegroundColor Green
        }
    }

    $restored = Get-Content $integrityFile -Raw | ConvertFrom-Json
    Write-Host "`nRestored build: $($restored.build)" -ForegroundColor Cyan
    Write-Host "Restart the dev server to use the restored build.`n" -ForegroundColor Yellow
    exit 0
}

# --- Download mode ---

if (-not $BuildDate) {
    Write-Error "Specify -BuildDate (e.g., '2026.01.03') or -Restore."
    exit 1
}

$snapshotsBaseUrl = "https://files.openscad.org/snapshots"

# The naming convention changed over time:
#   Old: OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip
#   New: OpenSCAD-2026.01.03-WebAssembly-web.zip
# We try the simpler new format first, then fall back to pattern matching.
$archiveName = "OpenSCAD-$BuildDate-WebAssembly-web.zip"
$downloadUrl = "$snapshotsBaseUrl/$archiveName"

# Ensure cache directory exists
if (-not (Test-Path $cacheDir)) {
    New-Item $cacheDir -ItemType Directory -Force | Out-Null
}

$zipPath = Join-Path $cacheDir $archiveName

# Check if already cached
if (Test-Path $zipPath) {
    Write-Host "Using cached archive: $archiveName" -ForegroundColor DarkGray
} else {
    Write-Host "Downloading $archiveName ..." -ForegroundColor Cyan
    Write-Host "  URL: $downloadUrl" -ForegroundColor DarkGray

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    } catch {
        # Try the old naming convention with wasm build number
        Write-Host "  Simple name not found, trying pattern match..." -ForegroundColor Yellow
        Remove-Item $zipPath -ErrorAction SilentlyContinue

        # Fetch the directory listing and find the matching file
        try {
            $listing = Invoke-WebRequest -Uri "$snapshotsBaseUrl/" -UseBasicParsing
            $pattern = "OpenSCAD-$BuildDate[.\w]*-WebAssembly-web\.zip"
            $matches = [regex]::Matches($listing.Content, $pattern)

            if ($matches.Count -eq 0) {
                Write-Error "No WebAssembly-web.zip found for date $BuildDate on files.openscad.org/snapshots/"
                exit 1
            }

            # Use the last match (latest build number for that date)
            $archiveName = $matches[$matches.Count - 1].Value
            $downloadUrl = "$snapshotsBaseUrl/$archiveName"
            $zipPath = Join-Path $cacheDir $archiveName

            if (Test-Path $zipPath) {
                Write-Host "  Using cached archive: $archiveName" -ForegroundColor DarkGray
            } else {
                Write-Host "  Found: $archiveName" -ForegroundColor Cyan
                Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
            }
        } catch {
            Write-Error "Failed to download WASM build for $BuildDate`: $_"
            exit 1
        }
    }

    $sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    Write-Host "  Downloaded: $sizeMB MB" -ForegroundColor Green
}

# --- Back up current build ---

if (-not $SkipBackup -and -not (Test-Path $backupDir)) {
    Write-Host "Backing up current build..." -ForegroundColor Cyan
    New-Item $backupDir -ItemType Directory -Force | Out-Null

    foreach ($file in @("openscad.js", "INTEGRITY.json")) {
        $src = Join-Path $wasmDir $file
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $backupDir $file) -Force
            Write-Host "  Backed up $file" -ForegroundColor Green
        }
    }

    $wasmBin = Join-Path $wasmDir "openscad.wasm"
    if (Test-Path $wasmBin) {
        Copy-Item $wasmBin (Join-Path $backupDir "openscad.wasm") -Force
        Write-Host "  Backed up openscad.wasm" -ForegroundColor Green
    } else {
        Write-Host "  openscad.wasm not present (downloaded at runtime)" -ForegroundColor DarkGray
    }
}

# --- Extract and install ---

Write-Host "Extracting WASM files from $archiveName ..." -ForegroundColor Cyan

$extractDir = Join-Path $cacheDir "extract-$BuildDate"
if (Test-Path $extractDir) {
    Remove-Item $extractDir -Recurse -Force
}

Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

# Find openscad.js and openscad.wasm in the extracted archive
# They may be at the root or inside a subdirectory
$jsFile = Get-ChildItem $extractDir -Recurse -Filter "openscad.js" | Select-Object -First 1
$wasmFile = Get-ChildItem $extractDir -Recurse -Filter "openscad.wasm" | Select-Object -First 1

if (-not $jsFile) {
    Write-Error "openscad.js not found in archive"
    exit 1
}
if (-not $wasmFile) {
    Write-Error "openscad.wasm not found in archive"
    exit 1
}

Copy-Item $jsFile.FullName (Join-Path $wasmDir "openscad.js") -Force
Copy-Item $wasmFile.FullName (Join-Path $wasmDir "openscad.wasm") -Force

$jsSize = (Get-Item (Join-Path $wasmDir "openscad.js")).Length
$wasmSize = (Get-Item (Join-Path $wasmDir "openscad.wasm")).Length

Write-Host "  Installed openscad.js  ($jsSize bytes)" -ForegroundColor Green
Write-Host "  Installed openscad.wasm ($wasmSize bytes)" -ForegroundColor Green

# --- Update INTEGRITY.json ---

$jsSha256 = (Get-FileHash (Join-Path $wasmDir "openscad.js") -Algorithm SHA256).Hash.ToLower()
$wasmSha256 = (Get-FileHash (Join-Path $wasmDir "openscad.wasm") -Algorithm SHA256).Hash.ToLower()

$integrity = @{
    version = "1.0"
    generated = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    build = "OpenSCAD-$BuildDate"
    source = "https://files.openscad.org/snapshots/"
    archive = $archiveName
    files = @{
        "openscad.js" = @{
            sha256 = $jsSha256
            size = $jsSize
        }
        "openscad.wasm" = @{
            sha256 = $wasmSha256
            size = $wasmSize
        }
    }
    bisectTest = $true
    swappedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    originalBuild = "OpenSCAD-2026.04.03"
}

$integrity | ConvertTo-Json -Depth 4 | Set-Content $integrityFile -Encoding UTF8

Write-Host "`n  Updated INTEGRITY.json for build: OpenSCAD-$BuildDate" -ForegroundColor Cyan

# --- Clean up extracted files ---

Remove-Item $extractDir -Recurse -Force

# --- Summary ---

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "WASM build swapped to: OpenSCAD-$BuildDate" -ForegroundColor Yellow
Write-Host "Archive: $archiveName" -ForegroundColor DarkGray
Write-Host "openscad.js:   $jsSize bytes (sha256: $($jsSha256.Substring(0,16))...)" -ForegroundColor DarkGray
Write-Host "openscad.wasm: $wasmSize bytes (sha256: $($wasmSha256.Substring(0,16))...)" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Start dev server: pixi run dev" -ForegroundColor White
Write-Host "  2. Load the LWFL preset" -ForegroundColor White
Write-Host "  3. Test Bug A (expose_home_button=no) and Bug B (expose_upper_message_bar=no)" -ForegroundColor White
Write-Host "  4. Record results in version-bisect-results.md" -ForegroundColor White
Write-Host "  5. When done, restore original: .\swap-wasm-build.ps1 -Restore" -ForegroundColor White
Write-Host ""
