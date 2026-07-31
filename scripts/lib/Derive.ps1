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

        $decidedRows = $rowsForOwner | Where-Object { $_.oppOwner } # excludes playoff-bye rows (no real opponent)

        $highest = $decidedRows | Sort-Object -Property points -Descending | Select-Object -First 1
        $lowest  = $decidedRows | Sort-Object -Property points | Select-Object -First 1

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

function New-PlayerSpotlight {
    <# League in-joke: a permanent fan-favorite player, shown with real stats. #>
    param([array]$Boxscores, [string]$PlayerName)

    $rows = $Boxscores | Where-Object { $_.player -eq $PlayerName }
    if ($rows.Count -eq 0) { return $null }

    $bestGame = $rows | Sort-Object -Property points -Descending | Select-Object -First 1
    $byOwner = $rows | Group-Object -Property owner | ForEach-Object {
        [pscustomobject]@{
            owner = $_.Name
            games = $_.Count
            points = Round2 (($_.Group | Measure-Object -Property points -Sum).Sum)
            seasons = @($_.Group | Select-Object -ExpandProperty season -Unique | Sort-Object)
        }
    } | Sort-Object -Property games -Descending

    [ordered]@{
        player = $PlayerName
        gamesPlayed = $rows.Count
        totalPoints = Round2 (($rows | Measure-Object -Property points -Sum).Sum)
        seasons = @($rows | Select-Object -ExpandProperty season -Unique | Sort-Object)
        bestGame = [ordered]@{ points = Round2 $bestGame.points; season = $bestGame.season; week = $bestGame.week; owner = $bestGame.owner }
        byOwner = $byOwner
    }
}

function New-WeeklyBenchMistakes {
    <#
        For each team-week: the single biggest "should've started this guy
        instead" mistake (highest-scoring benched player vs. the weakest
        starter at the same position that week), and whether fixing it
        would've flipped that week's result.
    #>
    param([array]$Boxscores, [array]$TeamWeekScores)

    $twsLookup = @{}
    foreach ($r in $TeamWeekScores) { $twsLookup["$($r.season)|$($r.week)|$($r.owner)"] = $r }

    $rows = New-Object System.Collections.Generic.List[object]
    $grouped = $Boxscores | Where-Object { $_.slot -ne "IR" } | Group-Object -Property season, week, owner
    foreach ($g in $grouped) {
        $players = $g.Group
        $first = $players[0]

        $bestMistake = $null
        foreach ($posGroup in ($players | Group-Object -Property position)) {
            $started = @($posGroup.Group | Where-Object { $_.slot -ne "Bench" })
            $benched = @($posGroup.Group | Where-Object { $_.slot -eq "Bench" })
            if ($started.Count -eq 0 -or $benched.Count -eq 0) { continue }
            $minStarted = $started | Sort-Object -Property points | Select-Object -First 1
            $maxBench = $benched | Sort-Object -Property points -Descending | Select-Object -First 1
            $cost = $maxBench.points - $minStarted.points
            if ($cost -gt 0 -and ($null -eq $bestMistake -or $cost -gt $bestMistake.cost)) {
                $bestMistake = [pscustomobject]@{
                    position = $posGroup.Name
                    benchedPlayer = $maxBench.player; benchedPoints = $maxBench.points
                    startedPlayer = $minStarted.player; startedPoints = $minStarted.points
                    cost = $cost
                }
            }
        }
        if (-not $bestMistake) { continue }

        $tws = $twsLookup["$($first.season)|$($first.week)|$($first.owner)"]
        if (-not $tws) { continue }

        $wouldHaveFlipped = $null
        if ($tws.oppOwner) {
            $hypotheticalPoints = $tws.points + $bestMistake.cost
            $wouldHaveFlipped = ($tws.result -ne "W") -and ($hypotheticalPoints -gt $tws.oppPoints)
        }

        $rows.Add([pscustomobject]@{
            season = $first.season; week = $first.week; owner = $first.owner
            position = $bestMistake.position
            benchedPlayer = $bestMistake.benchedPlayer; benchedPoints = Round2 $bestMistake.benchedPoints
            startedPlayer = $bestMistake.startedPlayer; startedPoints = Round2 $bestMistake.startedPoints
            pointsCost = Round2 $bestMistake.cost
            actualPoints = Round2 $tws.points
            opponent = $tws.oppOwner
            opponentPoints = if ($null -ne $tws.oppPoints) { Round2 $tws.oppPoints } else { $null }
            result = $tws.result
            wouldHaveFlipped = $wouldHaveFlipped
        })
    }
    return $rows
}

function New-Transactions {
    <#
        No real ESPN transaction log is pulled, so this infers roster moves by
        diffing each team's weekly roster: a player who shows up on someone's
        roster this week but wasn't there last week was acquired. If nobody
        had them last week, it's a waiver/free-agent pickup; if another owner
        had them, it's an inter-team move (and if the reverse also happened
        the same week between the same two teams, it's flagged as a likely
        trade). "Effectiveness" = points scored while they stayed rostered.
    #>
    param([array]$Boxscores)

    $pickups = New-Object System.Collections.Generic.List[object]

    foreach ($seasonGroup in ($Boxscores | Group-Object -Property season)) {
        $season = [int]$seasonGroup.Name
        $seasonRows = $seasonGroup.Group
        $weeks = @($seasonRows | Select-Object -ExpandProperty week -Unique | Sort-Object)

        # rosterByWeek[week] = @{ owner = @(player,...) }; ownerByWeek[week] = @{ player = owner }
        # pointsLookup["week|owner|player"] = @{ points=; slot=; position= }
        $rosterByWeek = @{}
        $ownerByWeek = @{}
        $pointsLookup = @{}
        foreach ($w in $weeks) {
            $wRows = $seasonRows | Where-Object { $_.week -eq $w }
            $rosterByWeek[$w] = @{}
            $ownerByWeek[$w] = @{}
            foreach ($og in ($wRows | Group-Object -Property owner)) {
                $players = @($og.Group | Select-Object -ExpandProperty player -Unique)
                $rosterByWeek[$w][$og.Name] = $players
                foreach ($p in $players) { $ownerByWeek[$w][$p] = $og.Name }
            }
            foreach ($row in $wRows) {
                $pointsLookup["$w|$($row.owner)|$($row.player)"] = $row
            }
        }

        for ($i = 1; $i -lt $weeks.Count; $i++) {
            $w = $weeks[$i]; $prevW = $weeks[$i - 1]
            foreach ($owner in $rosterByWeek[$w].Keys) {
                $current = $rosterByWeek[$w][$owner]
                $previous = if ($rosterByWeek[$prevW].ContainsKey($owner)) { $rosterByWeek[$prevW][$owner] } else { @() }
                $newPlayers = @($current | Where-Object { $previous -notcontains $_ })

                foreach ($player in $newPlayers) {
                    $fromOwner = if ($ownerByWeek[$prevW].ContainsKey($player)) { $ownerByWeek[$prevW][$player] } else { $null }
                    if ($fromOwner -eq $owner) { continue }

                    $acqRow = $pointsLookup["$w|$owner|$player"]

                    # walk forward while still on this roster; stop at the first
                    # gap (drop) or end of season
                    $weeksRostered = 0; $totalPoints = 0.0; $startedPoints = 0.0
                    $stillRostered = $true
                    for ($j = $i; $j -lt $weeks.Count; $j++) {
                        $ww = $weeks[$j]
                        if (-not ($rosterByWeek[$ww].ContainsKey($owner)) -or ($rosterByWeek[$ww][$owner] -notcontains $player)) {
                            $stillRostered = $false
                            break
                        }
                        $weeksRostered++
                        $row = $pointsLookup["$ww|$owner|$player"]
                        if ($row) {
                            $totalPoints += $row.points
                            if ($row.slot -ne "Bench") { $startedPoints += $row.points }
                        }
                    }

                    $pickups.Add([pscustomobject]@{
                        season = $season; week = $w; owner = $owner
                        player = $player; position = $acqRow.position
                        fromOwner = $fromOwner
                        weeksRostered = $weeksRostered
                        totalPoints = Round2 $totalPoints
                        startedPoints = Round2 $startedPoints
                        avgPointsPerWeek = if ($weeksRostered -gt 0) { Round2 ($totalPoints / $weeksRostered) } else { 0 }
                        stillRostered = $stillRostered
                    })
                }
            }
        }
    }

    # Pair up reciprocal inter-team moves (same season+week, opposite owner/fromOwner) as trades.
    $trades = New-Object System.Collections.Generic.List[object]
    $used = New-Object System.Collections.Generic.HashSet[int]
    $interTeam = @($pickups | Where-Object { $_.fromOwner })
    for ($x = 0; $x -lt $interTeam.Count; $x++) {
        if ($used.Contains($x)) { continue }
        $a = $interTeam[$x]
        for ($y = $x + 1; $y -lt $interTeam.Count; $y++) {
            if ($used.Contains($y)) { continue }
            $b = $interTeam[$y]
            if ($b.season -eq $a.season -and $b.week -eq $a.week -and $b.owner -eq $a.fromOwner -and $b.fromOwner -eq $a.owner) {
                $trades.Add([pscustomobject]@{
                    season = $a.season; week = $a.week
                    teamA = [pscustomobject]@{ owner = $a.owner; received = $a.player; position = $a.position; weeksRostered = $a.weeksRostered; totalPoints = $a.totalPoints; startedPoints = $a.startedPoints; stillRostered = $a.stillRostered }
                    teamB = [pscustomobject]@{ owner = $b.owner; received = $b.player; position = $b.position; weeksRostered = $b.weeksRostered; totalPoints = $b.totalPoints; startedPoints = $b.startedPoints; stillRostered = $b.stillRostered }
                })
                $used.Add($x) | Out-Null
                $used.Add($y) | Out-Null
                break
            }
        }
    }

    $tradedIndexes = New-Object System.Collections.Generic.HashSet[string]
    foreach ($t in $trades) {
        $tradedIndexes.Add("$($t.season)|$($t.week)|$($t.teamA.owner)|$($t.teamA.received)") | Out-Null
        $tradedIndexes.Add("$($t.season)|$($t.week)|$($t.teamB.owner)|$($t.teamB.received)") | Out-Null
    }
    $remainingPickups = @($pickups | Where-Object { -not $tradedIndexes.Contains("$($_.season)|$($_.week)|$($_.owner)|$($_.player)") })

    # Confidence: a same-week swap between two teams involving 2+ items each is
    # essentially certain to be a real trade (vanishingly unlikely to be
    # coincidental independent waiver moves). A single 1-for-1 swap could
    # plausibly be two unrelated moves that happened to cross paths, so it's
    # flagged lower-confidence rather than asserted as a trade outright.
    $groupSizes = @{}
    foreach ($t in $trades) {
        $pair = @($t.teamA.owner, $t.teamB.owner) | Sort-Object
        $key = "$($t.season)|$($t.week)|$($pair -join '|')"
        if (-not $groupSizes.ContainsKey($key)) { $groupSizes[$key] = 0 }
        $groupSizes[$key]++
    }
    foreach ($t in $trades) {
        $pair = @($t.teamA.owner, $t.teamB.owner) | Sort-Object
        $key = "$($t.season)|$($t.week)|$($pair -join '|')"
        $t | Add-Member -NotePropertyName confidence -NotePropertyValue $(if ($groupSizes[$key] -ge 2) { "high" } else { "low" })
        $t | Add-Member -NotePropertyName verified -NotePropertyValue $false
    }

    return [ordered]@{ pickups = $remainingPickups; trades = $trades.ToArray() }
}

function New-VerifiedTrades {
    <#
        Parses the real ESPN transaction archive (fetch-transactions.ps1) into
        trade groupings. Each real trade gets reported redundantly at multiple
        lifecycle stages (proposed/accepted/processed) as separate messages
        with the same from/to/target -- these are deduped first. Remaining
        legs are grouped by same-day + owner-pair into one trade record.
    #>
    param([array]$ArchiveRows)

    if (-not $ArchiveRows -or $ArchiveRows.Count -eq 0) { return @() }

    $legs = New-Object System.Collections.Generic.List[object]
    $seen = New-Object System.Collections.Generic.HashSet[string]
    foreach ($r in $ArchiveRows) {
        if (-not $r."From Owner" -or -not $r."To Owner") { continue } # not a team-to-team move
        if (-not $r."Target Name") { continue } # unresolved target = a draft pick, not a player; not tracked

        $fromOwner = ConvertTo-OwnerSlug $r."From Owner"
        $toOwner = ConvertTo-OwnerSlug $r."To Owner"
        $targetId = $r."Target ID"
        $key = "$fromOwner|$toOwner|$targetId"
        if ($seen.Contains($key)) { continue }
        $seen.Add($key) | Out-Null

        $msgDate = [double]$r."Message Date"
        $dayKey = [math]::Floor($msgDate / 86400000) # epoch ms -> day bucket

        $legs.Add([pscustomobject]@{
            season = [int]$r.Season
            dayKey = $dayKey
            fromOwner = $fromOwner
            toOwner = $toOwner
            asset = $r."Target Name"
        })
    }

    $trades = New-Object System.Collections.Generic.List[object]

    # Group by season|day|sorted-owner-pair so multi-item trades collapse into one record.
    $groups = @{}
    foreach ($leg in $legs) {
        $pair = @($leg.fromOwner, $leg.toOwner) | Sort-Object
        $key = "$($leg.season)|$($leg.dayKey)|$($pair -join '_')"
        if (-not $groups.ContainsKey($key)) { $groups[$key] = New-Object System.Collections.Generic.List[object] }
        $groups[$key].Add($leg)
    }

    foreach ($key in $groups.Keys) {
        $items = $groups[$key]
        $pair = @($items[0].fromOwner, $items[0].toOwner) | Sort-Object
        $ownerA, $ownerB = $pair[0], $pair[1]
        $aReceived = @($items | Where-Object { $_.toOwner -eq $ownerA } | ForEach-Object { $_.asset })
        $bReceived = @($items | Where-Object { $_.toOwner -eq $ownerB } | ForEach-Object { $_.asset })
        # Both sides must have at least one real player; a trade that was
        # entirely (or partly) draft picks and got filtered down to players
        # on only one side isn't a meaningful player-for-player trade to show.
        if ($aReceived.Count -eq 0 -or $bReceived.Count -eq 0) { continue }

        $trades.Add([pscustomobject]@{
            season = $items[0].season
            teamA = [pscustomobject]@{ owner = $ownerA; receivedItems = $aReceived }
            teamB = [pscustomobject]@{ owner = $ownerB; receivedItems = $bReceived }
            verified = $true
            confidence = "verified"
        })
    }

    return $trades.ToArray()
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
