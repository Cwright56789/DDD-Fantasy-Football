<#
.SYNOPSIS
    Extracts the 12 per-owner "team profile" sheets (nickname, accolades, season
    records, career highlights, positional leaders) into data/raw/profiles.json.
#>
param(
    [string]$XlsxPath = (Join-Path $PSScriptRoot "..\Fantasy Football Tracker.xlsx"),
    [string]$OutFile = (Join-Path $PSScriptRoot "..\data\raw\profiles.json")
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

$OwnerSheets = [ordered]@{
    "Charlie Wright"   = 5
    "Pat Elliott"      = 6
    "Michael Cole"     = 7
    "Will Samuel"      = 8
    "Noah Jordan"      = 9
    "Patrick Culcasi"  = 10
    "Greg Nieskens"    = 11
    "Kyle Roche"       = 12
    "Carter Davis"     = 13
    "Tommy Denlinger"  = 14
    "Tommy Alexander"  = 15
    "Brooks Rush"      = 16
}

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $XlsxPath))

function Get-EntryText($zip, $path) {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $path }
    if (-not $entry) { return $null }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $text = $reader.ReadToEnd()
    $reader.Close()
    return $text
}

$ssText = Get-EntryText $zip "xl/sharedStrings.xml"
$sharedStrings = @()
if ($ssText) {
    [xml]$ssXml = $ssText
    foreach ($si in $ssXml.sst.si) { $sharedStrings += $si.InnerText }
}

function Get-ColLetters([string]$cellRef) {
    if ($cellRef -match '^([A-Z]+)(\d+)$') { return $matches[1] }
    return $null
}

function Get-SheetGrid([int]$sheetNum) {
    $sheetText = Get-EntryText $zip ("xl/worksheets/sheet{0}.xml" -f $sheetNum)
    [xml]$sheetXml = $sheetText
    $grid = @{}
    foreach ($row in $sheetXml.worksheet.sheetData.row) {
        $r = [int]$row.r
        foreach ($c in $row.c) {
            if (-not $c.v) { continue }
            $col = Get-ColLetters $c.r
            $val = $null
            if ($c.t -eq "s") { $val = $sharedStrings[[int]$c.v] }
            elseif ($c.t -eq "str" -or $c.t -eq "e") { $val = $c.v }
            else {
                $num = 0.0
                if ([double]::TryParse($c.v, [ref]$num)) { $val = $num } else { $val = $c.v }
            }
            $grid["$col$r"] = $val
        }
    }
    return $grid
}

function G($grid, $col, $row) {
    $v = $grid["$col$row"]
    if ($v -is [string] -and ($v -eq "#VALUE!" -or $v -eq "#DIV/0!" -or $v -eq "")) { return $null }
    return $v
}

$profiles = New-Object System.Collections.Generic.List[object]

foreach ($ownerName in $OwnerSheets.Keys) {
    $sheetNum = $OwnerSheets[$ownerName]
    Write-Host "Parsing profile sheet for $ownerName (sheet$sheetNum.xml)"
    $grid = Get-SheetGrid $sheetNum

    $nickname = (G $grid "A" 1) -replace '\s*TEAM PROFILE\s*$', ''

    $accolades = New-Object System.Collections.Generic.List[string]
    for ($r = 4; $r -le 10; $r++) {
        $v = G $grid "A" $r
        if ($v) { $accolades.Add($v) }
    }

    $seasonRecords = New-Object System.Collections.Generic.List[object]
    for ($r = 14; $r -le 18; $r++) {
        $season = G $grid "A" $r
        if (-not $season) { continue }
        $seasonRecords.Add([ordered]@{
            season       = $season
            wins         = [int](G $grid "B" $r)
            losses       = [int](G $grid "C" $r)
            pointsFor    = G $grid "D" $r
            pointsAgainst= G $grid "E" $r
            benchPoints  = G $grid "F" $r
            avgEfficiency= G $grid "G" $r
            expectedWins = G $grid "H" $r
            expectedLosses = G $grid "I" $r
        })
    }

    $highlightRows = [ordered]@{
        highestScore          = 21
        lowestScore            = 22
        biggestMarginOfVictory = 23
        closestWin             = 24
        closestLoss            = 25
        worstBlowoutLoss       = 26
        worstBenchedPlayer     = 27
    }
    $careerHighlights = [ordered]@{}
    foreach ($key in $highlightRows.Keys) {
        $r = $highlightRows[$key]
        $careerHighlights[$key] = [ordered]@{
            points   = G $grid "D" $r
            season   = G $grid "F" $r
            week     = G $grid "G" $r
            opponent = G $grid "H" $r
        }
    }

    $positionalLeaders = New-Object System.Collections.Generic.List[object]
    for ($r = 30; $r -le 35; $r++) {
        $pos = G $grid "A" $r
        if (-not $pos) { continue }
        $positionalLeaders.Add([ordered]@{
            position               = $pos
            totalHistoricalPoints  = G $grid "D" $r
            topPerformer           = G $grid "G" $r
            topPerformerSeason     = G $grid "H" $r
            topPerformerPoints     = G $grid "I" $r
        })
    }

    $profiles.Add([ordered]@{
        owner              = $ownerName
        nickname           = $nickname
        accolades          = $accolades
        seasonRecords      = $seasonRecords
        careerHighlights   = $careerHighlights
        positionalLeaders  = $positionalLeaders
    })
}

$zip.Dispose()

$outDir = Split-Path $OutFile -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$profiles | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding utf8
Write-Host "Wrote $($profiles.Count) profiles -> $OutFile"
