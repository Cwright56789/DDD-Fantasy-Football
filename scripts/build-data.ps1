<#
.SYNOPSIS
    Reads data/raw/*.json (all-matchups, all-boxscores, profiles, current) and
    produces the final, compact /data/*.json files the website reads.
#>
param(
    [string]$RawDir = (Join-Path $PSScriptRoot "..\data\raw"),
    [string]$OutDir = (Join-Path $PSScriptRoot "..\data")
)

. (Join-Path $PSScriptRoot "lib\Common.ps1")
. (Join-Path $PSScriptRoot "lib\Derive.ps1")

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
if (-not (Test-Path (Join-Path $OutDir "boxscores"))) { New-Item -ItemType Directory -Force -Path (Join-Path $OutDir "boxscores") | Out-Null }

Write-Host "Loading raw data..."
$rawMatchups = Get-Content (Join-Path $RawDir "all-matchups.json") -Raw | ConvertFrom-Json
$rawBoxscores = Get-Content (Join-Path $RawDir "all-boxscores.json") -Raw | ConvertFrom-Json
$rawProfiles = Get-Content (Join-Path $RawDir "profiles.json") -Raw | ConvertFrom-Json
$current = Get-Content (Join-Path $RawDir "current.json") -Raw | ConvertFrom-Json

Write-Host "Normalizing matchups ($($rawMatchups.Count) rows)..."
$matchups = New-Object System.Collections.Generic.List[object]
$byeRowCount = 0
$droppedRowCount = 0
foreach ($m in $rawMatchups) {
    # Rows with no home owner at all are pure blanks; skip. Rows with a home
    # owner but no away owner are real playoff-bye games (a team advances
    # without an opponent that week) and still count toward that team's
    # record/points, just with no opposing side.
    if (-not $m."Home Owner") { $droppedRowCount++; continue }
    if (-not $m."Away Owner") { $byeRowCount++ }
    $matchups.Add([pscustomobject]@{
        season = [int]$m.Season
        week = [int]$m.Week
        game = [int]$m.Game
        awayTeam = $m."Away Team"
        awayOwner = if ($m."Away Owner") { ConvertTo-OwnerSlug $m."Away Owner" } else { $null }
        awayPts = if ($null -ne $m."Away Team Points") { [double]$m."Away Team Points" } else { $null }
        homeTeam = $m."Home Team"
        homeOwner = ConvertTo-OwnerSlug $m."Home Owner"
        homePts = [double]$m."Home Team Points"
        winner = $m."Weekly Matchup Winner"
    })
}
if ($byeRowCount -gt 0) { Write-Host "  $byeRowCount playoff-bye rows (counted for the home side only)" }
if ($droppedRowCount -gt 0) { Write-Host "  skipped $droppedRowCount blank placeholder rows" }

Write-Host "Normalizing boxscores ($($rawBoxscores.Count) rows)..."
$boxscores = New-Object System.Collections.Generic.List[object]
$emptySlotCount = 0
foreach ($b in $rawBoxscores) {
    if (-not $b.Player) { $emptySlotCount++; continue } # unfilled roster slot, not a real player
    $boxscores.Add([pscustomobject]@{
        season = [int]$b.Season
        week = [int]$b.Week
        team = $b.Team
        owner = ConvertTo-OwnerSlug $b.Owner
        homeAway = $b."Home/Away"
        player = $b.Player
        position = $b.Position
        slot = $b.Slot
        points = [double]$b.Points
        projectedPoints = if ($null -ne $b.ProjectedPoints) { [double]$b.ProjectedPoints } else { $null }
    })
}
if ($emptySlotCount -gt 0) { Write-Host "  skipped $emptySlotCount empty roster-slot rows" }

Write-Host "Computing team-week scores..."
$teamWeekScores = New-TeamWeekScores -Matchups $matchups

Write-Host "Computing standings..."
$standings = New-Standings -TeamWeekScores $teamWeekScores

Write-Host "Computing weekly luck..."
$weeklyLuck = New-WeeklyLuck -TeamWeekScores $teamWeekScores
$luckSummary = New-LuckSummary -WeeklyLuck $weeklyLuck

Write-Host "Computing lineup efficiency (this can take a bit over $($boxscores.Count) rows)..."
$lineupEfficiency = New-LineupEfficiency -Boxscores $boxscores

Write-Host "Computing positional leaders..."
$positionalLeaders = New-PositionalLeaders -Boxscores $boxscores

Write-Host "Computing career highlights..."
$careerHighlights = New-CareerHighlights -TeamWeekScores $teamWeekScores -Boxscores $boxscores

Write-Host "Computing bench points left (per-position)..."
$benchTotals = New-BenchPointsLeft -Boxscores $boxscores

Write-Host "Computing weekly bench mistakes..."
$benchMistakes = New-WeeklyBenchMistakes -Boxscores $boxscores -TeamWeekScores $teamWeekScores

Write-Host "Computing head-to-head..."
$headToHead = New-HeadToHead -Matchups $matchups

Write-Host "Computing player index..."
$playerIndex = New-PlayerIndex -Boxscores $boxscores

Write-Host "Computing player spotlight..."
$fanFavorite = New-PlayerSpotlight -Boxscores $boxscores -PlayerName "Rashid Shaheed"

Write-Host "Computing waiver/trade transactions (this can take a minute)..."
$transactions = New-Transactions -Boxscores $boxscores

$archivePath = Join-Path $PSScriptRoot "..\data\archive\transactions-raw.json"
if (Test-Path $archivePath) {
    Write-Host "Merging real ESPN transaction archive (current season)..."
    $archiveRows = Get-Content $archivePath -Raw | ConvertFrom-Json
    $verifiedTrades = New-VerifiedTrades -ArchiveRows $archiveRows
    Write-Host "  $($verifiedTrades.Count) verified trades from $($archiveRows.Count) archived messages"
    $transactions.trades = @($transactions.trades) + @($verifiedTrades)
}

# ---- owners.json: canonical identity + manual profile content ----
Write-Host "Writing owners.json..."
$owners = New-Object System.Collections.Generic.List[object]
foreach ($o in $script:OwnerCanon) {
    $profile = $rawProfiles | Where-Object { (ConvertTo-OwnerSlug $_.owner) -eq $o.slug } | Select-Object -First 1
    $owners.Add([ordered]@{
        slug = $o.slug
        displayName = $o.displayName
        nickname = $profile.nickname
        accolades = @($profile.accolades)
    })
}
$owners | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path (Join-Path $OutDir "owners.json") -Encoding utf8

# ---- profiles.json: per-owner computed stats bundle ----
Write-Host "Writing profiles.json..."
$profilesOut = New-Object System.Collections.Generic.List[object]
foreach ($o in $script:OwnerCanon) {
    $slug = $o.slug
    $seasonRows = $standings.bySeason | Where-Object { $_.owner -eq $slug } | Sort-Object -Property season
    $allTimeRow = $standings.allTime | Where-Object { $_.owner -eq $slug } | Select-Object -First 1
    $luckBySeasonRows = $luckSummary.bySeason | Where-Object { $_.owner -eq $slug }
    $luckAllTimeRow = $luckSummary.allTime | Where-Object { $_.owner -eq $slug } | Select-Object -First 1
    $benchBySeasonRows = $benchTotals.bySeason | Where-Object { $_.owner -eq $slug }
    $benchAllTimeRow = $benchTotals.allTime | Where-Object { $_.owner -eq $slug } | Select-Object -First 1
    $highlight = $careerHighlights | Where-Object { $_.owner -eq $slug } | Select-Object -First 1
    $posLeaders = $positionalLeaders | Where-Object { $_.owner -eq $slug }

    $seasonRecords = New-Object System.Collections.Generic.List[object]
    foreach ($sr in $seasonRows) {
        $luckRow = $luckBySeasonRows | Where-Object { $_.season -eq $sr.season } | Select-Object -First 1
        $benchRow = $benchBySeasonRows | Where-Object { $_.season -eq $sr.season } | Select-Object -First 1
        $seasonRecords.Add([ordered]@{
            season = $sr.season; wins = $sr.wins; losses = $sr.losses; ties = $sr.ties
            pointsFor = $sr.pointsFor; pointsAgainst = $sr.pointsAgainst
            benchPoints = $benchRow.benchPoints
            expectedWins = $luckRow.expectedWins; luck = $luckRow.luck
        })
    }

    $profilesOut.Add([ordered]@{
        owner = $slug
        seasonRecords = $seasonRecords
        allTime = [ordered]@{
            wins = $allTimeRow.wins; losses = $allTimeRow.losses; ties = $allTimeRow.ties
            pointsFor = $allTimeRow.pointsFor; pointsAgainst = $allTimeRow.pointsAgainst
            benchPoints = $benchAllTimeRow.benchPoints
            expectedWins = $luckAllTimeRow.expectedWins; luck = $luckAllTimeRow.luck
        }
        careerHighlights = $highlight
        positionalLeaders = $posLeaders
    })
}
$profilesOut | ConvertTo-Json -Depth 10 -Compress | Set-Content -Path (Join-Path $OutDir "profiles.json") -Encoding utf8

# ---- meta.json ----
Write-Host "Writing meta.json..."
$allSeasons = @($matchups | ForEach-Object { $_.season } | Sort-Object -Unique)
[ordered]@{
    leagueName = "Diplomatic. Democratic. Degenerates."
    leagueShortName = "DDD"
    currentSeason = [int]$current.currentSeason
    currentWeek = [int]$current.currentWeek
    seasons = $allSeasons
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json | Set-Content -Path (Join-Path $OutDir "meta.json") -Encoding utf8

# ---- matchups.json ----
Write-Host "Writing matchups.json..."
$matchups | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path (Join-Path $OutDir "matchups.json") -Encoding utf8

# ---- boxscores/{season}.json ----
Write-Host "Writing per-season boxscore files..."
foreach ($g in ($boxscores | Group-Object -Property season)) {
    $g.Group | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path (Join-Path $OutDir "boxscores\$($g.Name).json") -Encoding utf8
    Write-Host "  season $($g.Name): $($g.Group.Count) rows"
}

# ---- standings.json ----
Write-Host "Writing standings.json..."
[ordered]@{ bySeason = $standings.bySeason; allTime = $standings.allTime } | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path (Join-Path $OutDir "standings.json") -Encoding utf8

# ---- luck.json ----
Write-Host "Writing luck.json..."
[ordered]@{ weekly = $weeklyLuck; bySeason = $luckSummary.bySeason; allTime = $luckSummary.allTime } | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path (Join-Path $OutDir "luck.json") -Encoding utf8

# ---- lineup-efficiency.json ----
Write-Host "Writing lineup-efficiency.json..."
$lineupEfficiency | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path (Join-Path $OutDir "lineup-efficiency.json") -Encoding utf8

# ---- head-to-head.json ----
Write-Host "Writing head-to-head.json..."
$headToHead | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path (Join-Path $OutDir "head-to-head.json") -Encoding utf8

Write-Host "Writing player-index.json..."
$playerIndex | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path (Join-Path $OutDir "player-index.json") -Encoding utf8

# ---- bench-mistakes.json ----
Write-Host "Writing bench-mistakes.json..."
$benchMistakes | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path (Join-Path $OutDir "bench-mistakes.json") -Encoding utf8

# ---- fan-favorite.json ----
if ($fanFavorite) {
    Write-Host "Writing fan-favorite.json..."
    $fanFavorite | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path (Join-Path $OutDir "fan-favorite.json") -Encoding utf8
}

# ---- transactions.json ----
Write-Host "Writing transactions.json..."
$transactions | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path (Join-Path $OutDir "transactions.json") -Encoding utf8

Write-Host "Done. /data is ready."
