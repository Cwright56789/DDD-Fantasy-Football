<#
.SYNOPSIS
    One-time bootstrap importer: converts key sheets of the Fantasy Football Tracker.xlsx
    into JSON files under /data, using the header row of each sheet as property names.

.DESCRIPTION
    This is used to seed the site's /data folder from the existing workbook. Going forward,
    scripts/fetch-data.ps1 pulls fresh data directly from the ESPN API and regenerates the
    same /data files, so this script does not need to run on a schedule.
#>
param(
    [string]$XlsxPath = (Join-Path $PSScriptRoot "..\Fantasy Football Tracker.xlsx"),
    [string]$OutDir = (Join-Path $PSScriptRoot "..\data\raw")
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $XlsxPath))

function Get-EntryText($zip, $path) {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $path }
    if (-not $entry) { return $null }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $text = $reader.ReadToEnd()
    $reader.Close()
    return $text
}

# ---- shared strings ----
$ssText = Get-EntryText $zip "xl/sharedStrings.xml"
$sharedStrings = @()
if ($ssText) {
    [xml]$ssXml = $ssText
    foreach ($si in $ssXml.sst.si) { $sharedStrings += $si.InnerText }
}

# ---- workbook sheet name -> sheetN.xml mapping ----
[xml]$wbXml = Get-EntryText $zip "xl/workbook.xml"
[xml]$relsXml = Get-EntryText $zip "xl/_rels/workbook.xml.rels"

$ridToTarget = @{}
foreach ($rel in $relsXml.Relationships.Relationship) {
    $ridToTarget[$rel.Id] = $rel.Target
}

$sheetNameToNum = @{}
$ns = New-Object System.Xml.XmlNamespaceManager($wbXml.NameTable)
$ns.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
foreach ($sheet in $wbXml.workbook.sheets.sheet) {
    $rid = $sheet.GetAttribute("id", $ns.LookupNamespace("r"))
    $target = $ridToTarget[$rid]
    if ($target -match 'sheet(\d+)\.xml$') {
        $sheetNameToNum[$sheet.name] = [int]$matches[1]
    }
}

function Get-ColLetters([string]$cellRef) {
    if ($cellRef -match '^([A-Z]+)(\d+)$') { return $matches[1] }
    return $null
}

function ColLetterToIndex([string]$col) {
    $idx = 0
    foreach ($ch in $col.ToCharArray()) { $idx = $idx * 26 + ([int][char]$ch - [int][char]'A' + 1) }
    return $idx
}

function Export-SheetToJson {
    param(
        [string]$SheetName,
        [string]$OutFile,
        [int]$HeaderRow = 1
    )
    $sheetNum = $sheetNameToNum[$SheetName]
    if (-not $sheetNum) { Write-Warning "Sheet not found: $SheetName"; return }
    Write-Host "Exporting '$SheetName' (sheet$sheetNum.xml) -> $OutFile"

    $sheetText = Get-EntryText $zip ("xl/worksheets/sheet{0}.xml" -f $sheetNum)
    [xml]$sheetXml = $sheetText
    $rows = $sheetXml.worksheet.sheetData.row

    $headers = @{}
    $headerRowNode = $rows | Where-Object { [int]$_.r -eq $HeaderRow } | Select-Object -First 1
    foreach ($c in $headerRowNode.c) {
        $col = Get-ColLetters $c.r
        $val = if ($c.t -eq "s") { $sharedStrings[[int]$c.v] } else { $c.v }
        if ($val) { $headers[$col] = $val }
    }

    $records = New-Object System.Collections.Generic.List[object]
    foreach ($row in $rows) {
        if ([int]$row.r -le $HeaderRow) { continue }
        $obj = [ordered]@{}
        $hasAny = $false
        foreach ($col in $headers.Keys) {
            $cell = $row.c | Where-Object { (Get-ColLetters $_.r) -eq $col } | Select-Object -First 1
            $val = $null
            if ($cell -and $cell.v) {
                if ($cell.t -eq "s") { $val = $sharedStrings[[int]$cell.v] }
                elseif ($cell.t -eq "str" -or $cell.t -eq "inlineStr") { $val = $cell.v }
                else {
                    $num = 0.0
                    if ([double]::TryParse($cell.v, [ref]$num)) { $val = $num } else { $val = $cell.v }
                }
                $hasAny = $true
            }
            $obj[$headers[$col]] = $val
        }
        if ($hasAny) { $records.Add([pscustomobject]$obj) }
    }

    $json = $records | ConvertTo-Json -Depth 5
    Set-Content -Path (Join-Path $OutDir $OutFile) -Value $json -Encoding utf8
    Write-Host "  -> $($records.Count) records"
}

Export-SheetToJson -SheetName "AllMatchups" -OutFile "all-matchups.json"
Export-SheetToJson -SheetName "AllBoxscores" -OutFile "all-boxscores.json"

function Get-SingleCellValue([string]$sheetName, [string]$cellRef) {
    $sheetNum = $sheetNameToNum[$sheetName]
    $sheetText = Get-EntryText $zip ("xl/worksheets/sheet{0}.xml" -f $sheetNum)
    [xml]$sheetXml = $sheetText
    $row = [int]($cellRef -replace '^[A-Z]+', '')
    $rowNode = $sheetXml.worksheet.sheetData.row | Where-Object { [int]$_.r -eq $row } | Select-Object -First 1
    $cell = $rowNode.c | Where-Object { $_.r -eq $cellRef } | Select-Object -First 1
    if ($cell.t -eq "s") { return $sharedStrings[[int]$cell.v] }
    return $cell.v
}

$currentSeason = [int](Get-SingleCellValue "CurrentSeason" "A2")
$currentWeek = [int](Get-SingleCellValue "CurrentWeek" "A2")
[pscustomobject]@{ currentSeason = $currentSeason; currentWeek = $currentWeek } | ConvertTo-Json | Set-Content -Path (Join-Path $OutDir "current.json") -Encoding utf8
Write-Host "Current season/week -> $currentSeason / $currentWeek"

$zip.Dispose()
Write-Host "Done."
