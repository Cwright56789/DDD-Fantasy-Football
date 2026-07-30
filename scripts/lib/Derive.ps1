<#
    Pure derivation logic shared by the xlsx bootstrap importer and the live ESPN
    fetch script. Input: normalized $matchups and $boxscores arrays (see shapes
    below). Output: the computed tables that the site's /data JSON is built from.

    $matchups row shape (after normalization):
      season, week, game, awayOwner (slug), awayTeam, awayPts, homeOwner (slug), homeTeam, homePts, winner ("HOME"|"AWAY"|"TIE")

    $boxscores row shape (after normalization):
      season, week, team, owner (slug), homeAway, player, position, slot, points
#>

function New-TeamWeekScores {
    param([array]$Matchups)

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($m in $Matchups) {
        if (-not $m.awayOwner) {
            # Playoff-bye row: only the home side played, and only a "TIE"
            # would ever count as anything but a loss here since there's no
            # real opponent to beat.
            $homeResult = if ($m.winner -eq "TIE") { "T" } else { "L" }
            $rows.Add([pscustomobject]@{
                season = $m.season; week = $m.week; owner = $m.homeOwner; team = $m.homeTeam
                points = $m.homePts; oppOwner = $null; oppTeam = $null; oppPoints = $null
                result = $homeResult
            })
            continue
        }

        $awayResult = if ($m.winner -eq "AWAY") { "W" } elseif ($m.winner -eq "HOME") { "L" } else { "T" }
        $homeResult = if ($m.winner -eq "HOME") { "W" } elseif ($m.winner -eq "AWAY") { "L" } else { "T" }

        $rows.Add([pscustomobject]@{
            season = $m.season; week = $m.week; owner = $m.awayOwner; team = $m.awayTeam
            points = $m.awayPts; oppOwner = $m.homeOwner; oppTeam = $m.homeTeam; oppPoints = $m.homePts
            result = $awayResult
        })
        $rows.Add([pscustomobject]@{
            season = $m.season; week = $m.week; owner = $m.homeOwner; team = $m.homeTeam
            points = $m.homePts; oppOwner = $m.awayOwner; oppTeam = $m.awayTeam; oppPoints = $m.awayPts
            result = $homeResult
        })
    }
    return $rows
}

function New-Standings {
    param([array]$TeamWeekScores)

    # season -> owner -> accumulator
    $bySeasonOwner = @{}
    $allTime = @{}

    foreach ($r in $TeamWeekScores) {
        $seasonKey = "$($r.season)"
        if (-not $bySeasonOwner.ContainsKey($seasonKey)) { $bySeasonOwner[$seasonKey] = @{} }
        $bucket = $bySeasonOwner[$seasonKey]

        foreach ($target in @($bucket, $allTime)) {
            if (-not $target.ContainsKey($r.owner)) {
                $target[$r.owner] = [ordered]@{
                    owner = $r.owner; wins = 0; losses = 0; ties = 0
                    pointsFor = 0.0; pointsAgainst = 0.0; gamesPlayed = 0
                }
            }
            $acc = $target[$r.owner]
            $acc.gamesPlayed++
            $acc.pointsFor += $r.points
            $acc.pointsAgainst += $r.oppPoints
            if ($r.result -eq "W") { $acc.wins++ }
            elseif ($r.result -eq "L") { $acc.losses++ }
            else { $acc.ties++ }
        }
    }

    $seasons = New-Object System.Collections.Generic.List[object]
    foreach ($seasonKey in ($bySeasonOwner.Keys | Sort-Object)) {
        foreach ($owner in $bySeasonOwner[$seasonKey].Keys) {
            $acc = $bySeasonOwner[$seasonKey][$owner]
            $seasons.Add([pscustomobject]@{
                season = [int]$seasonKey
                owner = $acc.owner
                wins = $acc.wins; losses = $acc.losses; ties = $acc.ties
                pointsFor = Round2 $acc.pointsFor
                pointsAgainst = Round2 $acc.pointsAgainst
                gamesPlayed = $acc.gamesPlayed
            })
        }
    }

    $allTimeList = New-Object System.Collections.Generic.List[object]
    foreach ($owner in $allTime.Keys) {
        $acc = $allTime[$owner]
        $allTimeList.Add([pscustomobject]@{
            owner = $acc.owner
            wins = $acc.wins; losses = $acc.losses; ties = $acc.ties
            pointsFor = Round2 $acc.pointsFor
            pointsAgainst = Round2 $acc.pointsAgainst
            gamesPlayed = $acc.gamesPlayed
        })
    }

    return [ordered]@{ bySeason = $seasons; allTime = $allTimeList }
}

function New-WeeklyLuck {
    param([array]$TeamWeekScores)

    $rows = New-Object System.Collections.Generic.List[object]
    $grouped = $TeamWeekScores | Group-Object -Property season, week
    foreach ($g in $grouped) {
        $weekRows = $g.Group
        $n = $weekRows.Count - 1
        foreach ($r in $weekRows) {
            $winsVsField = ($weekRows | Where-Object { $_.points -lt $r.points }).Count
            $expectedWinPct = if ($n -le 0) { $null } else { $winsVsField / $n }
            $rows.Add([pscustomobject]@{
                season = $r.season; week = $r.week; owner = $r.owner; points = $r.points
                result = $r.result
                winsVsField = $winsVsField; opponentsInField = $n
                expectedWinPct = Round4 $expectedWinPct
            })
        }
    }
    return $rows
}

function New-LuckSummary {
    param([array]$WeeklyLuck)

    function Summarize($rows) {
        $actualWins = ($rows | Where-Object { $_.result -eq "W" }).Count
        $expectedWins = ($rows | Measure-Object -Property expectedWinPct -Sum).Sum
        [pscustomobject]@{
            gamesPlayed = $rows.Count
            actualWins = $actualWins
            expectedWins = Round2 $expectedWins
            luck = Round2 ($actualWins - $expectedWins)
        }
    }

    $bySeason = New-Object System.Collections.Generic.List[object]
    foreach ($g in ($WeeklyLuck | Group-Object -Property season, owner)) {
        $first = $g.Group[0]
        $s = Summarize $g.Group
        $bySeason.Add([pscustomobject]@{ season = $first.season; owner = $first.owner; gamesPlayed = $s.gamesPlayed; actualWins = $s.actualWins; expectedWins = $s.expectedWins; luck = $s.luck })
    }

    $allTime = New-Object System.Collections.Generic.List[object]
    foreach ($g in ($WeeklyLuck | Group-Object -Property owner)) {
        $s = Summarize $g.Group
        $allTime.Add([pscustomobject]@{ owner = $g.Name; gamesPlayed = $s.gamesPlayed; actualWins = $s.actualWins; expectedWins = $s.expectedWins; luck = $s.luck })
    }

    return [ordered]@{ bySeason = $bySeason; allTime = $allTime }
}

$script:LineupRules = [ordered]@{
    QB   = 1
    RB   = 2
    WR   = 2
    TE   = 1
    K    = 1
    "D/ST" = 1
}

function New-LineupEfficiency {
    param([array]$Boxscores)

    $rows = New-Object System.Collections.Generic.List[object]
    $grouped = $Boxscores | Where-Object { $_.slot -ne "IR" } | Group-Object -Property season, week, owner
    foreach ($g in $grouped) {
        $players = $g.Group
        $first = $players[0]

        $pool = @{}
        foreach ($pos in $script:LineupRules.Keys) {
            $pool[$pos] = @($players | Where-Object { $_.position -eq $pos } | Sort-Object -Property points -Descending)
        }

        $optimal = 0.0
        $flexPool = New-Object System.Collections.Generic.List[object]
        foreach ($pos in $script:LineupRules.Keys) {
            $take = $script:LineupRules[$pos]
            $list = $pool[$pos]
            $used = @($list | Select-Object -First $take)
            $optimal += ($used | Measure-Object -Property points -Sum).Sum
            if ($pos -in @("RB", "WR", "TE")) {
                $remaining = @($list | Select-Object -Skip $take)
                foreach ($p in $remaining) { $flexPool.Add($p) }
            }
        }
        if ($flexPool.Count -gt 0) {
            $bestFlex = ($flexPool | Sort-Object -Property points -Descending | Select-Object -First 1)
            $optimal += $bestFlex.points
        }

        $actualStarted = ($players | Where-Object { $_.slot -ne "Bench" } | Measure-Object -Property points -Sum).Sum
        if (-not $actualStarted) { $actualStarted = 0.0 }

        $efficiency = if ($optimal -eq 0) { $null } else { $actualStarted / $optimal }

        $rows.Add([pscustomobject]@{
            season = $first.season; week = $first.week; owner = $first.owner
            optimalPoints = Round2 $optimal
            actualStartedPoints = Round2 $actualStarted
            efficiencyPct = Round4 $efficiency
            pointsLeftOnBench = Round2 ([math]::Max(0, $optimal - $actualStarted))
        })
    }
    return $rows
}

function New-PositionalLeaders {
    param([array]$Boxscores)

    # owner -> position -> total points; owner -> position -> player -> season -> points
    $result = New-Object System.Collections.Generic.List[object]
    $byOwnerPos = $Boxscores | Group-Object -Property owner, position
    foreach ($g in $byOwnerPos) {
        $rowsForGroup = $g.Group
        $first = $rowsForGroup[0]
        $total = ($rowsForGroup | Measure-Object -Property points -Sum).Sum

        $byPlayerSeason = $rowsForGroup | Group-Object -Property player, season
        $best = $null
        $bestPoints = -[double]::MaxValue
        foreach ($ps in $byPlayerSeason) {
            $sum = ($ps.Group | Measure-Object -Property points -Sum).Sum
            if ($sum -gt $bestPoints) {
                $bestPoints = $sum
                $best = [pscustomobject]@{ player = $ps.Group[0].player; season = $ps.Group[0].season; points = Round2 $sum }
            }
        }

        $result.Add([pscustomobject]@{
            owner = $first.owner
            position = $first.position
            totalHistoricalPoints = Round2 $total
            topPerformer = $best.player
            topPerformerSeason = $best.season
            topPerformerPoints = $best.points
        })
    }
    return $result
}

function New-CareerHighlights {
    param([array]$TeamWeekScores, [array]$Boxscores)

    $result = New-Object System.Collections.Generic.List[object]
    $byOwner = $TeamWeekScores | Group-Object -Property owner
    foreach ($g in $byOwner) {
        $rowsForOwner = $g.Group
        $owner = $g.Name

        $highest = $rowsForOwner | Sort-Object -Property points -Descending | Select-Object -First 1
        $lowest  = $rowsForOwner | Sort-Object -Property points | Select-Object -First 1

        $decidedRows = $rowsForOwner | Where-Object { $_.oppOwner } # excludes playoff-bye rows (no real opponent)
        $wins = $decidedRows | Where-Object { $_.result -eq "W" }
        $losses = $decidedRows | Where-Object { $_.result -eq "L" }

        $withMargin = $decidedRows | ForEach-Object {
            [pscustomobject]@{ season=$_.season; week=$_.week; opponent=$_.oppOwner; margin=($_.points - $_.oppPoints); result=$_.result }
        }

        $biggestWin = $withMargin | Where-Object { $_.result -eq "W" } | Sort-Object -Property margin -Descending | Select-Object -First 1
        $closestWin = $withMargin | Where-Object { $_.result -eq "W" } | Sort-Object -Property margin | Select-Object -First 1
        $closestLoss = $withMargin | Where-Object { $_.result -eq "L" } | Sort-Object -Property margin -Descending | Select-Object -First 1
        $worstLoss = $withMargin | Where-Object { $_.result -eq "L" } | Sort-Object -Property margin | Select-Object -First 1

        $benchRows = $Boxscores | Where-Object { $_.owner -eq $owner -and $_.slot -eq "Bench" }
        $worstBenched = $benchRows | Sort-Object -Property points -Descending | Select-Object -First 1

        $result.Add([pscustomobject]@{
            owner = $owner
            highestScore = [pscustomobject]@{ points = Round2 $highest.points; season = $highest.season; week = $highest.week; opponent = $highest.oppOwner }
            lowestScore = [pscustomobject]@{ points = Round2 $lowest.points; season = $lowest.season; week = $lowest.week; opponent = $lowest.oppOwner }
            biggestMarginOfVictory = if ($biggestWin) { [pscustomobject]@{ margin = Round2 $biggestWin.margin; season = $biggestWin.season; week = $biggestWin.week; opponent = $biggestWin.opponent } } else { $null }
            closestWin = if ($closestWin) { [pscustomobject]@{ margin = Round2 $closestWin.margin; season = $closestWin.season; week = $closestWin.week; opponent = $closestWin.opponent } } else { $null }
            closestLoss = if ($closestLoss) { [pscustomobject]@{ margin = Round2 $closestLoss.margin; season = $closestLoss.season; week = $closestLoss.week; opponent = $closestLoss.opponent } } else { $null }
            worstBlowoutLoss = if ($worstLoss) { [pscustomobject]@{ margin = Round2 $worstLoss.margin; season = $worstLoss.season; week = $worstLoss.week; opponent = $worstLoss.opponent } } else { $null }
            worstBenchedPlayer = if ($worstBenched) { [pscustomobject]@{ points = Round2 $worstBenched.points; season = $worstBenched.season; week = $worstBenched.week; player = $worstBenched.player } } else { $null }
        })
    }
    return $result
}

function New-BenchPointsLeft {
    <#
        Per position, per team-week: could a benched player at that position
        have outscored your worst starter at that position? Summed across
        positions and weeks, this is the "Bench Points" figure the league's
        own season-record sheets have always used.
    #>
    param([array]$Boxscores)

    $rows = New-Object System.Collections.Generic.List[object]
    $grouped = $Boxscores | Where-Object { $_.slot -ne "IR" } | Group-Object -Property season, week, owner, position
    foreach ($g in $grouped) {
        $players = $g.Group
        $first = $players[0]
        $started = @($players | Where-Object { $_.slot -ne "Bench" } | ForEach-Object { $_.points })
        $benched = @($players | Where-Object { $_.slot -eq "Bench" } | ForEach-Object { $_.points })
        if ($started.Count -eq 0 -or $benched.Count -eq 0) { continue }
        $minStarted = ($started | Measure-Object -Minimum).Minimum
        $maxBench = ($benched | Measure-Object -Maximum).Maximum
        $left = [math]::Max(0, $maxBench - $minStarted)
        $rows.Add([pscustomobject]@{ season = $first.season; week = $first.week; owner = $first.owner; position = $first.position; pointsLeft = $left })
    }

    $bySeason = New-Object System.Collections.Generic.List[object]
    foreach ($g in ($rows | Group-Object -Property season, owner)) {
        $first = $g.Group[0]
        $sum = ($g.Group | Measure-Object -Property pointsLeft -Sum).Sum
        $bySeason.Add([pscustomobject]@{ season = $first.season; owner = $first.owner; benchPoints = Round2 $sum })
    }

    $allTime = New-Object System.Collections.Generic.List[object]
    foreach ($g in ($rows | Group-Object -Property owner)) {
        $sum = ($g.Group | Measure-Object -Property pointsLeft -Sum).Sum
        $allTime.Add([pscustomobject]@{ owner = $g.Name; benchPoints = Round2 $sum })
    }

    return [ordered]@{ bySeason = $bySeason; allTime = $allTime }
}

function New-HeadToHead {
    param([array]$Matchups)

    # key = "ownerA|ownerB" with ownerA < ownerB alphabetically; store perspective-normalized W/L/T from ownerA's view
    $pairs = @{}
    foreach ($m in $Matchups) {
        if (-not $m.awayOwner) { continue } # playoff-bye row, no real opponent

        if ($m.winner -eq "TIE") { $awayRes = "T"; $homeRes = "T" }
        elseif ($m.winner -eq "AWAY") { $awayRes = "W"; $homeRes = "L" }
        else { $awayRes = "L"; $homeRes = "W" }

        $a, $b = $m.awayOwner, $m.homeOwner
        $aPts, $bPts = $m.awayPts, $m.homePts
        $aRes = $awayRes
        if ($a -gt $b) {
            $a, $b = $b, $a
            $aPts, $bPts = $bPts, $aPts
            $aRes = $homeRes
        }
        $key = "$a|$b"
        if (-not $pairs.ContainsKey($key)) {
            $pairs[$key] = [ordered]@{ ownerA = $a; ownerB = $b; aWins = 0; bWins = 0; ties = 0; aPoints = 0.0; bPoints = 0.0; games = 0 }
        }
        $p = $pairs[$key]
        $p.games++
        $p.aPoints += $aPts
        $p.bPoints += $bPts
        if ($aRes -eq "W") { $p.aWins++ } elseif ($aRes -eq "L") { $p.bWins++ } else { $p.ties++ }
    }

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($p in $pairs.Values) {
        $result.Add([pscustomobject]@{
            ownerA = $p.ownerA; ownerB = $p.ownerB
            aWins = $p.aWins; bWins = $p.bWins; ties = $p.ties
            aPoints = Round2 $p.aPoints; bPoints = Round2 $p.bPoints; games = $p.games
        })
    }
    return $result
}
