<#
.SYNOPSIS
    Pulls ESPN's real transaction/activity log for the current season (the only
    season ESPN's communication feed retains -- it's a rolling ~2 month window,
    not full history) and appends any new entries to a permanent local archive,
    so real transaction data accumulates over time instead of being lost as
    ESPN's own window rolls forward.

.DESCRIPTION
    Temporarily repurposes the workbook's "Invoked Function" scratch query to
    run this fetch, then restores it to its original formula and closes
    without saving -- so the .xlsx file itself is never permanently modified
    by this script.
#>
param(
    [string]$XlsxPath = (Join-Path $PSScriptRoot "..\Fantasy Football Tracker.xlsx"),
    [string]$ArchivePath = (Join-Path $PSScriptRoot "..\data\archive\transactions-raw.json")
)

$ErrorActionPreference = "Stop"
$XlsxPath = (Resolve-Path $XlsxPath).Path

$originalInvokedFunctionFormula = @'
let
    Source = fnGetLeagueData(2025, "mMatchup"),
    schedule = Source[schedule],
    #"Converted to Table" = Table.FromList(schedule, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    #"Expanded Column1" = Table.ExpandRecordColumn(#"Converted to Table", "Column1", {"away", "home", "id", "matchupPeriodId", "winner"}, {"Column1.away", "Column1.home", "Column1.id", "Column1.matchupPeriodId", "Column1.winner"}),
    #"Expanded Column1.away" = Table.ExpandRecordColumn(#"Expanded Column1", "Column1.away", {"cumulativeScore", "gamesPlayed", "pointsByScoringPeriod", "teamId", "totalPoints"}, {"Column1.away.cumulativeScore", "Column1.away.gamesPlayed", "Column1.away.pointsByScoringPeriod", "Column1.away.teamId", "Column1.away.totalPoints"}),
    #"Expanded Column1.home" = Table.ExpandRecordColumn(#"Expanded Column1.away", "Column1.home", {"cumulativeScore", "gamesPlayed", "pointsByScoringPeriod", "teamId", "totalPoints"}, {"Column1.home.cumulativeScore", "Column1.home.gamesPlayed", "Column1.home.pointsByScoringPeriod", "Column1.home.teamId", "Column1.home.totalPoints"}),
    #"Expanded Column1.away.cumulativeScore" = Table.ExpandRecordColumn(#"Expanded Column1.home", "Column1.away.cumulativeScore", {"losses", "scoreByStat", "statBySlot", "ties", "wins"}, {"Column1.away.cumulativeScore.losses", "Column1.away.cumulativeScore.scoreByStat", "Column1.away.cumulativeScore.statBySlot", "Column1.away.cumulativeScore.ties", "Column1.away.cumulativeScore.wins"}),
    #"Expanded Column1.home.cumulativeScore" = Table.ExpandRecordColumn(#"Expanded Column1.away.cumulativeScore", "Column1.home.cumulativeScore", {"losses", "scoreByStat", "statBySlot", "ties", "wins"}, {"Column1.home.cumulativeScore.losses", "Column1.home.cumulativeScore.scoreByStat", "Column1.home.cumulativeScore.statBySlot", "Column1.home.cumulativeScore.ties", "Column1.home.cumulativeScore.wins"}),
    #"Expanded Column1.away.pointsByScoringPeriod" = Table.ExpandRecordColumn(#"Expanded Column1.home.cumulativeScore", "Column1.away.pointsByScoringPeriod", {"1"}, {"Column1.away.pointsByScoringPeriod.1"}),
    #"Expanded Column1.home.pointsByScoringPeriod" = Table.ExpandRecordColumn(#"Expanded Column1.away.pointsByScoringPeriod", "Column1.home.pointsByScoringPeriod", {"1"}, {"Column1.home.pointsByScoringPeriod.1"}),
    #"Renamed Columns" = Table.RenameColumns(#"Expanded Column1.home.pointsByScoringPeriod",{{"Column1.matchupPeriodId", "Week"}, {"Column1.winner", "Weekly Matchup Winner"}, {"Column1.home.totalPoints", "Home Team Points"}, {"Column1.home.teamId", "Home Team"}, {"Column1.away.totalPoints", "Away Team Points"}, {"Column1.away.teamId", "Away Team"}, {"Column1.away.pointsByScoringPeriod.1", "Away Team's Points in Week 1"}, {"Column1.home.pointsByScoringPeriod.1", "Home Team's Points in Week 1"}, {"Column1.home.gamesPlayed", "Home Team Games Played to Date"}, {"Column1.home.cumulativeScore.wins", "Home Team Wins to Date"}, {"Column1.home.cumulativeScore.ties", "Home Team Ties to Date"}, {"Column1.home.cumulativeScore.losses", "Home Team Losses to Date"}, {"Column1.away.gamesPlayed", "Away Team Games Played to Date"}, {"Column1.away.cumulativeScore.wins", "Away Team Wins to Date"}, {"Column1.away.cumulativeScore.ties", "Away Team Ties to Date"}, {"Column1.away.cumulativeScore.losses", "Away Team Losses to Date"}, {"Column1.id", "Game"}}),
    #"Removed Columns" = Table.RemoveColumns(#"Renamed Columns",{"Column1.away.cumulativeScore.statBySlot", "Column1.away.cumulativeScore.scoreByStat", "Column1.home.cumulativeScore.scoreByStat", "Column1.home.cumulativeScore.statBySlot", "Home Team's Points in Week 1", "Away Team's Points in Week 1", "Away Team Losses to Date", "Away Team Ties to Date", "Away Team Wins to Date", "Away Team Games Played to Date", "Home Team Losses to Date", "Home Team Ties to Date", "Home Team Wins to Date", "Home Team Games Played to Date"}),
    #"Reordered Columns" = Table.ReorderColumns(#"Removed Columns",{"Game", "Week", "Away Team", "Away Team Points", "Home Team", "Home Team Points", "Weekly Matchup Winner"})
in
    #"Reordered Columns"
'@

$fetchFormula = @'
let
    fnGetPlayerNames = (season as number) as table =>
        let
            url = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/" & Number.ToText(season) & "/players?scoringPeriodId=0&view=players_wl",
            filterHeader = "{""players"":{""limit"":20000}}",
            Source = Json.Document(Web.Contents(url, [Headers=[Cookie = "espn_s2=" & ESPN_S2 & "; SWID=" & SWID, #"X-Fantasy-Filter" = filterHeader]])),
            #"Converted to Table" = Table.FromList(Source, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
            #"Expanded Column1" = Table.ExpandRecordColumn(#"Converted to Table", "Column1", {"id", "fullName"}, {"Player ID", "Player Name"})
        in
            #"Expanded Column1",
    fnGetLeagueCommunication = (season as number) as any =>
        let
            url = "https://lm-api-communication.fantasy.espn.com/apis/v3/games/ffl/seasons/" & Number.ToText(season) & "/segments/0/leagues/" & LeagueID & "?view=kona_league_communication",
            Source = Json.Document(Web.Contents(url, [Headers=[Cookie = "espn_s2=" & ESPN_S2 & "; SWID=" & SWID]]))
        in
            Source,
    season = CurrentSeason,
    Source = fnGetLeagueCommunication(season),
    topics = Source[communication][topics],
    #"Converted to Table" = Table.FromList(topics, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    #"Expanded Column1" = Table.ExpandRecordColumn(#"Converted to Table", "Column1", {"type", "date", "id", "messages"}, {"Type", "Topic Date", "Topic ID", "messages"}),
    #"Filtered" = Table.SelectRows(#"Expanded Column1", each [Type] = "ACTIVITY_TRANSACTIONS"),
    #"Expanded Messages" = Table.ExpandListColumn(#"Filtered", "messages"),
    #"Expanded Messages Record" = Table.ExpandRecordColumn(#"Expanded Messages", "messages", {"date", "from", "to", "targetId", "messageTypeId", "id"}, {"Message Date", "From Team ID", "To Team ID", "Target ID", "Message Type ID", "Message ID"}),
    #"Added Season" = Table.AddColumn(#"Expanded Messages Record", "Season", each season, Int64.Type),
    #"Merged From" = Table.NestedJoin(#"Added Season", {"From Team ID"}, fnGetTeams(season), {"Team ID"}, "FromLookup", JoinKind.LeftOuter),
    #"Expanded From" = Table.ExpandTableColumn(#"Merged From", "FromLookup", {"Team Name", "Owner Name"}, {"From Team", "From Owner"}),
    #"Merged To" = Table.NestedJoin(#"Expanded From", {"To Team ID"}, fnGetTeams(season), {"Team ID"}, "ToLookup", JoinKind.LeftOuter),
    #"Expanded To" = Table.ExpandTableColumn(#"Merged To", "ToLookup", {"Team Name", "Owner Name"}, {"To Team", "To Owner"}),
    #"Merged Player" = Table.NestedJoin(#"Expanded To", {"Target ID"}, fnGetPlayerNames(season), {"Player ID"}, "PlayerLookup", JoinKind.LeftOuter),
    #"Expanded Player" = Table.ExpandTableColumn(#"Merged Player", "PlayerLookup", {"Player Name"}, {"Target Name"}),
    #"Removed" = Table.RemoveColumns(#"Expanded Player", {"From Team ID", "To Team ID"}),
    #"Reordered" = Table.ReorderColumns(#"Removed", {"Season", "Topic ID", "Topic Date", "Message Date", "Message ID", "Message Type ID", "From Owner", "From Team", "To Owner", "To Team", "Target ID", "Target Name"})
in
    #"Reordered"
'@

function Get-EscapedFormula($f) { $f }

$excel = $null
$wb = $null
$rows = @()
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $wb = $excel.Workbooks.Open($XlsxPath)

    $q = $wb.Queries.Item("Invoked Function")
    $q.Formula = $fetchFormula

    $sheet = $wb.Worksheets.Item("Invoked Function")
    $lo = $sheet.ListObjects.Item("Invoked_Function")
    $lo.QueryTable.Refresh($false) | Out-Null

    $used = $sheet.UsedRange
    $rowCount = $used.Rows.Count
    $colCount = $used.Columns.Count

    $headers = @()
    for ($c = 1; $c -le $colCount; $c++) { $headers += $sheet.Cells.Item(1, $c).Text }

    for ($r = 2; $r -le $rowCount; $r++) {
        $obj = [ordered]@{}
        for ($c = 1; $c -le $colCount; $c++) {
            $obj[$headers[$c - 1]] = $sheet.Cells.Item($r, $c).Text
        }
        if ($obj["Message ID"]) { $rows += [pscustomobject]$obj }
    }

    Write-Host "Fetched $($rows.Count) real transaction message rows for the current season."

    # restore scratch query to its original state, and don't save (never persist this change)
    $q.Formula = $originalInvokedFunctionFormula
    $lo.QueryTable.Refresh($false) | Out-Null
} finally {
    if ($wb) { $wb.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($wb) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null }
    if ($excel) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

# ---- merge into permanent archive, deduped by Message ID (a stable UUID) ----
$archiveDir = Split-Path $ArchivePath -Parent
if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null }

$existing = @()
if (Test-Path $ArchivePath) {
    $existing = @(Get-Content $ArchivePath -Raw | ConvertFrom-Json)
}

$byId = [ordered]@{}
foreach ($r in $existing) { $byId[$r."Message ID"] = $r }
foreach ($r in $rows) { $byId[$r."Message ID"] = $r }

$merged = @($byId.Values)
$merged | ConvertTo-Json -Depth 5 | Set-Content -Path $ArchivePath -Encoding utf8
Write-Host "Archive now holds $($merged.Count) total transaction messages (was $($existing.Count))."
