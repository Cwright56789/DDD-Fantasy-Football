<#
.SYNOPSIS
    One-click refresh: pulls fresh data into the Excel workbook via Power Query,
    rebuilds the site's /data JSON, and publishes the update to GitHub Pages.

.DESCRIPTION
    Run this whenever you want the live site to reflect the latest ESPN
    results. Requires Excel to be installed (and not already open with this
    workbook) and git to be configured with a remote to push to.
#>
param(
    [string]$XlsxPath = (Join-Path $PSScriptRoot "..\Fantasy Football Tracker.xlsx"),
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$XlsxPath = (Resolve-Path $XlsxPath).Path

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---------------------------------------------------------------- 1. Refresh Excel
Step "Refreshing Power Query data in Excel (this can take a minute)..."

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    $workbook = $excel.Workbooks.Open($XlsxPath)
    $workbook.RefreshAll()

    # Power Query refreshes run asynchronously; this blocks until they finish.
    $excel.CalculateUntilAsyncQueriesDone()

    $workbook.Save()
    Write-Host "  Workbook refreshed and saved."
} finally {
    if ($workbook) { $workbook.Close($true) }
    if ($excel) { $excel.Quit() }
    if ($workbook) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null }
    if ($excel) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

# ---------------------------------------------------------------- 2. Real transactions
Step "Pulling ESPN's real transaction log for the current season..."
& (Join-Path $PSScriptRoot "fetch-transactions.ps1") -XlsxPath $XlsxPath

# ---------------------------------------------------------------- 2b. Draft results
Step "Pulling real ESPN draft results..."
& (Join-Path $PSScriptRoot "fetch-draft.ps1") -XlsxPath $XlsxPath

# ---------------------------------------------------------------- 3. Rebuild /data
Step "Rebuilding site data from the refreshed workbook..."
& (Join-Path $PSScriptRoot "xlsx-to-json.ps1") -XlsxPath $XlsxPath
& (Join-Path $PSScriptRoot "xlsx-profiles-to-json.ps1") -XlsxPath $XlsxPath
& (Join-Path $PSScriptRoot "build-data.ps1")

# ---------------------------------------------------------------- 4. Publish
if ($SkipPush) {
    Write-Host "`n-SkipPush set: data rebuilt locally, not committed or pushed." -ForegroundColor Yellow
    return
}

Step "Publishing..."
Push-Location $repoRoot
try {
    $status = git status --porcelain -- data
    if (-not $status) {
        Write-Host "  No data changes since last publish -- nothing to push."
        return
    }
    git add data
    $stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm 'UTC'")
    git commit -m "Update data ($stamp)" | Out-Null
    git push
    Write-Host "  Pushed. The live site will update in a minute or two." -ForegroundColor Green
} finally {
    Pop-Location
}
