<#
.SYNOPSIS
    Pulls real ESPN draft results for every season (2023 through the current
    season, if that season's draft has completed) and writes a permanent
    archive. Unlike transactions, draft data doesn't roll off ESPN's servers,
    so this is a straightforward full pull each time, not an incremental merge.

.DESCRIPTION
    Temporarily repurposes the workbook's "Invoked Function" scratch query,
    then restores it and closes without saving -- the .xlsx file itself is
    never permanently modified by this script.
#>
param(
    [string]$XlsxPath = (Join-Path $PSScriptRoot "..\Fantasy Football Tracker.xlsx"),
    [string]$OutPath = (Join-Path $PSScriptRoot "..\data\archive\draft-picks-raw.json"),
    [int]$StartSeason = 2023
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

$fetchFormulaTemplate = @'
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
    fnGetDraft = (season as number) as table =>
        let
            attempt = try
                let
                    Source = fnGetLeagueData(season, "mDraftDetail"),
                    picks = Source[draftDetail][picks],
                    #"Converted to Table" = Table.FromList(picks, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
                    #"Expanded" = Table.ExpandRecordColumn(#"Converted to Table", "Column1", {"overallPickNumber","roundId","roundPickNumber","teamId","playerId","keeper"}, {"Overall Pick","Round","Round Pick","Team ID","Player ID","Keeper"}),
                    #"Added Season" = Table.AddColumn(#"Expanded", "Season", each season, Int64.Type),
                    #"Merged Team" = Table.NestedJoin(#"Added Season", {"Team ID"}, fnGetTeams(season), {"Team ID"}, "TeamLookup", JoinKind.LeftOuter),
                    #"Expanded Team" = Table.ExpandTableColumn(#"Merged Team", "TeamLookup", {"Team Name","Owner Name"}, {"Team","Owner"}),
                    #"Merged Player" = Table.NestedJoin(#"Expanded Team", {"Player ID"}, fnGetPlayerNames(season), {"Player ID"}, "PlayerLookup", JoinKind.LeftOuter),
                    #"Expanded Player" = Table.ExpandTableColumn(#"Merged Player", "PlayerLookup", {"Player Name"}, {"Player"}),
                    #"Removed" = Table.RemoveColumns(#"Expanded Player", {"Team ID", "Player ID"}),
                    #"Reordered" = Table.ReorderColumns(#"Removed", {"Season","Overall Pick","Round","Round Pick","Owner","Team","Player","Keeper"})
                in
                    #"Reordered"
        in
            if attempt[HasError] then #table({"Season","Overall Pick","Round","Round Pick","Owner","Team","Player","Keeper"}, {}) else attempt[Value],
    seasons = {__START__..__END__},
    results = List.Transform(seasons, each fnGetDraft(_)),
    combined = Table.Combine(results)
in
    combined
'@

$excel = $null
$wb = $null
$rows = @()
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $wb = $excel.Workbooks.Open($XlsxPath)

    # figure out the current season to know the upper bound
    $currentSeasonQuery = $wb.Queries.Item("CurrentSeason")
    $endSeason = [int]($wb.Worksheets.Item("CurrentSeason").Range("A2").Text)

    $fetchFormula = $fetchFormulaTemplate.Replace("__START__", "$StartSeason").Replace("__END__", "$endSeason")

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
        for ($c = 1; $c -le $colCount; $c++) { $obj[$headers[$c - 1]] = $sheet.Cells.Item($r, $c).Text }
        if ($obj["Player"] -or $obj["Owner"]) { $rows += [pscustomobject]$obj }
    }

    Write-Host "Fetched $($rows.Count) draft picks for seasons $StartSeason-$endSeason."

    $q.Formula = $originalInvokedFunctionFormula
    $lo.QueryTable.Refresh($false) | Out-Null
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
} finally {
    if ($wb) { $wb.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($wb) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null }
    if ($excel) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

if ($rows.Count -gt 0) {
    $outDir = Split-Path $OutPath -Parent
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
    $rows | ConvertTo-Json -Depth 5 | Set-Content -Path $OutPath -Encoding utf8
    Write-Host "Wrote $OutPath"
}
