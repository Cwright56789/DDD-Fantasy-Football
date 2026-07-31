// All page render functions. Each takes the #app container element and an
// array of route params (from the hash path) and fills in the container.

const Views = {};

function ownerLink(slug, name) {
    return `<a href="#/teams/${slug}">${fmt.escapeHtml(name)}</a>`;
}

function onionSvg(color) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2c-1 2-2 3-2 4.5 0 .6.2 1 .5 1.4C8.4 9.4 6 12.4 6 15.5 6 19.6 8.7 23 12 23s6-3.4 6-7.5c0-3.1-2.4-6.1-4.5-7.6.3-.4.5-.8.5-1.4C14 5 13 4 12 2z" fill="${color}"/>
    </svg>`;
}
const TROPHY_ICON = "🏆";
const ONION_WIN_ICON = onionSvg("#D9A521");
const ONION_LOSE_ICON = onionSvg("#C0392B");

function accoladeIcon(text) {
    if (/champion$/i.test(text)) return TROPHY_ICON;
    if (/onion bowl winner/i.test(text)) return ONION_WIN_ICON;
    if (/onion bowl loser/i.test(text)) return ONION_LOSE_ICON;
    return null;
}

function trophyBadges(accolades) {
    if (!accolades || !accolades.length) return "";
    return accolades.map(a => {
        const icon = accoladeIcon(a);
        return `<span class="badge ${icon ? "trophy" : ""}">${icon ? icon + " " : ""}${fmt.escapeHtml(a)}</span>`;
    }).join("");
}

function trophyIconRow(accolades) {
    const icons = (accolades || []).map(accoladeIcon).filter(Boolean);
    if (!icons.length) return "";
    return `<div style="margin-top:8px;font-size:15px">${icons.join(" ")}</div>`;
}

function barChart(rows, { labelFn, valueFn, formatFn, maxAbs }) {
    if (!maxAbs) {
        maxAbs = Math.max(1, ...rows.map(r => Math.abs(valueFn(r))));
    }
    return rows.map(r => {
        const v = valueFn(r);
        const pct = Math.min(100, (Math.abs(v) / maxAbs) * 100);
        const neg = v < 0 ? "neg" : "";
        return `<div class="bar-row">
            <div class="bar-label">${fmt.escapeHtml(labelFn(r))}</div>
            <div class="bar-track"><div class="bar-fill ${neg}" style="width:${pct}%"></div></div>
            <div class="bar-value">${formatFn(v)}</div>
        </div>`;
    }).join("");
}

// ---------------------------------------------------------------- Home
Views.home = async function (root) {
    const [meta, standings, matchups, owners, luck, fanFavorite] = await Promise.all([
        DDD.getMeta(), DDD.getStandings(), DDD.getMatchups(), DDD.getOwners(), DDD.getLuck(), DDD.getFanFavorite()
    ]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const seasonRows = standings.bySeason.filter(r => r.season === meta.currentSeason);
    const seasonHasGames = seasonRows.some(r => r.gamesPlayed > 0);

    const thisWeekGames = matchups.filter(m => m.season === meta.currentSeason && m.week === meta.currentWeek);

    let standingsHtml;
    if (seasonHasGames) {
        const sorted = [...seasonRows].sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));
        standingsHtml = renderStandingsTable(sorted, ownerMap, luck.bySeason.filter(r => r.season === meta.currentSeason));
    } else {
        const lastSeason = Math.max(...meta.seasons);
        const lastRows = [...standings.bySeason.filter(r => r.season === lastSeason)]
            .sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));
        standingsHtml = `<p class="empty-state">The ${meta.currentSeason} season hasn't kicked off yet. Here's how ${lastSeason} finished:</p>` +
            renderStandingsTable(lastRows, ownerMap, luck.bySeason.filter(r => r.season === lastSeason));
    }

    let matchupsHtml;
    if (thisWeekGames.length) {
        const mistakesLookup = await buildMistakesLookup(meta.currentSeason);
        matchupsHtml = thisWeekGames.map(m => matchupCard(m, ownerMap, { mistakesLookup })).join("");
    } else {
        matchupsHtml = `<p class="empty-state">No games yet this week.</p>`;
    }

    // trophy teaser: champions, most recent year first
    const champs = owners
        .map(o => {
            const champLine = o.accolades.find(a => /champion$/i.test(a) && !/co-/i.test(a));
            if (!champLine) return null;
            const year = parseInt(champLine, 10) || 0;
            return { owner: o, champLine, year };
        })
        .filter(Boolean)
        .sort((a, b) => b.year - a.year);
    const trophyHtml = champs.map(({ owner: o, champLine }) => {
        return `<div class="stat-tile" style="text-align:left">
            <div style="font-size:12px;color:var(--text-muted)">${fmt.escapeHtml(champLine)}</div>
            <div style="font-weight:700">${ownerLink(o.slug, o.displayName)}</div>
        </div>`;
    }).join("");

    let spotlightHtml = "";
    if (fanFavorite) {
        const bestOwnerName = fanFavorite.byOwner[0] ? (ownerMap[fanFavorite.byOwner[0].owner]?.displayName || fanFavorite.byOwner[0].owner) : "";
        const bestGameOwnerName = ownerMap[fanFavorite.bestGame.owner]?.displayName || fanFavorite.bestGame.owner;
        const ownerListHtml = fanFavorite.byOwner.map(o => `<div class="bar-row" style="margin:4px 0">
            <div class="bar-label" style="width:140px">${ownerLink(o.owner, ownerMap[o.owner]?.displayName || o.owner)}</div>
            <div style="font-size:12px;color:var(--text-muted);width:50px">${o.seasons.join("/")}</div>
            <div style="font-size:12px;color:var(--text-muted);width:70px">${o.games} game${o.games === 1 ? "" : "s"}</div>
            <div class="bar-value" style="width:auto;font-weight:700">${fmt.pts(o.points)} pts</div>
        </div>`).join("");

        spotlightHtml = `
        <div class="card spotlight" style="align-items:flex-start">
            <div class="spotlight-icon">⚡</div>
            <div class="spotlight-body">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">League Fan Favorite</div>
                <div style="font-size:18px;font-weight:800;margin:2px 0 8px">${fmt.escapeHtml(fanFavorite.player)}</div>
                <div class="spotlight-stats">
                    <div><div class="value">${fmt.pts(fanFavorite.totalPoints)}</div><div class="label">Total Pts</div></div>
                    <div><div class="value">${fanFavorite.gamesPlayed}</div><div class="label">Games Started</div></div>
                    <div><div class="value">${fmt.pts(fanFavorite.bestGame.points)}</div><div class="label">Best Game (${bestGameOwnerName}, S${fanFavorite.bestGame.season} W${fanFavorite.bestGame.week})</div></div>
                    <div><div class="value">${bestOwnerName}</div><div class="label">Rostered Him Most</div></div>
                </div>
                <div style="margin-top:12px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">Who's Owned Him</div>
                <div style="margin-top:4px">${ownerListHtml}</div>
            </div>
            <div class="spotlight-autograph">Rashid Shaheed</div>
        </div>`;
    }

    root.innerHTML = `
        <div class="two-col">
            <div>
                <div class="card">
                    <h2>${seasonHasGames ? meta.currentSeason + " Standings" : "Latest Final Standings"}</h2>
                    <div class="table-scroll">${standingsHtml}</div>
                    <p style="margin-top:10px"><a href="#/standings">Full standings &amp; history →</a></p>
                </div>
                <div class="card">
                    <h2>Week ${meta.currentWeek}, ${meta.currentSeason}</h2>
                    ${matchupsHtml}
                    <p style="margin-top:10px"><a href="#/matchups">All matchups →</a></p>
                </div>
            </div>
            <div>
                <div class="card">
                    <h2>🏆 Champions</h2>
                    ${trophyHtml || `<p class="empty-state">No champions crowned yet.</p>`}
                    <p style="margin-top:10px"><a href="#/teams">All teams &amp; trophies →</a></p>
                </div>
                <div class="card">
                    <h2>Explore</h2>
                    <p><a href="#/stats">Luck, lineup efficiency &amp; bench stats →</a></p>
                    <p><a href="#/h2h">Head-to-head grid →</a></p>
                </div>
            </div>
        </div>
        ${spotlightHtml}
    `;
};

function renderStandingsTable(rows, ownerMap, luckRows) {
    const luckByOwner = {}; (luckRows || []).forEach(l => luckByOwner[l.owner] = l);
    return `<table class="data">
        <thead><tr>
            <th class="left">#</th><th class="left">Team</th><th>W</th><th>L</th><th>T</th>
            <th>PF</th><th>PA</th><th>Diff</th><th>xW</th><th>Luck</th>
        </tr></thead>
        <tbody>
        ${rows.map((r, i) => {
            const o = ownerMap[r.owner] || {};
            const luck = luckByOwner[r.owner];
            return `<tr>
                <td class="left">${i + 1}</td>
                <td class="left">${ownerLink(r.owner, o.displayName || r.owner)}</td>
                <td>${r.wins}</td><td>${r.losses}</td><td>${r.ties || 0}</td>
                <td>${fmt.pts(r.pointsFor)}</td><td>${fmt.pts(r.pointsAgainst)}</td>
                <td>${fmt.signed(r.pointsFor - r.pointsAgainst)}</td>
                <td>${luck ? luck.expectedWins : "—"}</td>
                <td>${luck ? fmt.signed(luck.luck) : "—"}</td>
            </tr>`;
        }).join("")}
        </tbody>
    </table>`;
}

function benchMistakeNote(m, ownerSlug, mistakesLookup) {
    if (!mistakesLookup) return "";
    const r = mistakesLookup[`${m.season}|${m.week}|${ownerSlug}`];
    if (!r) return "";
    const flipTag = r.wouldHaveFlipped ? ` <strong style="color:var(--win)">— would've won</strong>` : "";
    return `<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
        ⚠️ left <strong>${fmt.pts(r.pointsCost)} pts</strong> on the bench (${fmt.escapeHtml(r.benchedPlayer)} over ${fmt.escapeHtml(r.startedPlayer)})${flipTag}
    </div>`;
}

function matchupCard(m, ownerMap, opts) {
    opts = opts || {};
    const mistakesLookup = opts.mistakesLookup;
    const awayWin = m.winner === "AWAY", homeWin = m.winner === "HOME";
    const ao = ownerMap[m.awayOwner] || {}, ho = ownerMap[m.homeOwner] || {};
    const id = `mu-${m.season}-${m.week}-${m.game}`;
    return `<div class="card" style="padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer" onclick="Views._toggleBox('${id}', ${m.season}, ${m.week}, '${m.awayOwner}', '${m.homeOwner}')">
            <div style="flex:1">
                <div style="font-weight:${awayWin ? 700 : 400}">${fmt.escapeHtml(m.awayTeam)} <span style="color:var(--text-muted);font-weight:400">(${ownerLinkText(ao)})</span></div>
                ${benchMistakeNote(m, m.awayOwner, mistakesLookup)}
                <div style="font-weight:${homeWin ? 700 : 400};margin-top:6px">${fmt.escapeHtml(m.homeTeam)} <span style="color:var(--text-muted);font-weight:400">(${ownerLinkText(ho)})</span></div>
                ${benchMistakeNote(m, m.homeOwner, mistakesLookup)}
            </div>
            <div style="text-align:right;font-variant-numeric:tabular-nums">
                <div style="font-weight:${awayWin ? 700 : 400}">${fmt.pts(m.awayPts)}</div>
                <div style="font-weight:${homeWin ? 700 : 400}">${fmt.pts(m.homePts)}</div>
            </div>
        </div>
        <div id="${id}" style="display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px"></div>
    </div>`;
}
function ownerLinkText(o) { return o.displayName ? `<a href="#/teams/${o.slug}">${fmt.escapeHtml(o.displayName)}</a>` : ""; }

async function buildMistakesLookup(season) {
    const mistakes = await DDD.getBenchMistakes();
    const rows = season ? mistakes.filter(r => r.season === season) : mistakes;
    const lookup = {};
    rows.forEach(r => { lookup[`${r.season}|${r.week}|${r.owner}`] = r; });
    return lookup;
}

Views._toggleBox = async function (id, season, week, awayOwner, homeOwner) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "block";
    el.innerHTML = `<div class="spinner-text">Loading box score...</div>`;
    const box = await DDD.getBoxscores(season);
    const rows = box.filter(r => r.week === week && (r.owner === awayOwner || r.owner === homeOwner));
    el.innerHTML = boxscoreTable(rows, awayOwner, homeOwner);
};

function boxscoreTable(rows, awayOwner, homeOwner) {
    const slotOrder = ["QB", "RB", "WR", "TE", "FLEX", "D/ST", "K", "Bench", "IR"];
    function side(owner) {
        const mine = rows.filter(r => r.owner === owner);
        mine.sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot) || b.points - a.points);
        return `<table class="data" style="font-size:12.5px">
            <thead><tr><th class="left">Slot</th><th class="left">Player</th><th class="left">Pos</th><th>Pts</th></tr></thead>
            <tbody>${mine.map(r => `<tr${r.slot === "Bench" ? ' style="opacity:.6"' : ""}>
                <td class="left">${fmt.escapeHtml(r.slot)}</td>
                <td class="left">${fmt.escapeHtml(r.player)}</td>
                <td class="left">${fmt.escapeHtml(r.position)}</td>
                <td>${fmt.pts(r.points)}</td>
            </tr>`).join("")}</tbody>
        </table>`;
    }
    return `<div class="grid cols-2">
        <div>${side(awayOwner)}</div>
        <div>${side(homeOwner)}</div>
    </div>`;
}

// ---------------------------------------------------------------- Standings
Views.standings = async function (root, params) {
    const [meta, standings, owners, luck] = await Promise.all([
        DDD.getMeta(), DDD.getStandings(), DDD.getOwners(), DDD.getLuck()
    ]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const options = [...meta.seasons].sort((a, b) => b - a);
    let selected = params[0] || (standings.bySeason.some(r => r.season === meta.currentSeason) ? String(meta.currentSeason) : String(options[0]));

    function rowsFor(sel) {
        if (sel === "all") return { rows: standings.allTime, luckRows: luck.allTime };
        const s = Number(sel);
        return { rows: standings.bySeason.filter(r => r.season === s), luckRows: luck.bySeason.filter(r => r.season === s) };
    }
    const { rows, luckRows } = rowsFor(selected);
    const sorted = [...rows].sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));

    root.innerHTML = `
        <div class="card">
            <h2>Standings</h2>
            <div class="toolbar">
                ${options.map(s => `<button class="btn ${String(s) === selected ? "active" : ""}" onclick="location.hash='#/standings/${s}'">${s}</button>`).join("")}
                <button class="btn ${selected === "all" ? "active" : ""}" onclick="location.hash='#/standings/all'">All-Time</button>
            </div>
            <div class="table-scroll">${renderStandingsTable(sorted, ownerMap, luckRows)}</div>
            <p style="margin-top:10px;color:var(--text-muted);font-size:12px">
                xW = expected wins based on weekly points rank vs the field (a measure of schedule luck). Luck = actual wins minus expected wins.
            </p>
        </div>
    `;
};

// ---------------------------------------------------------------- Teams
Views.teams = async function (root) {
    const [owners, standings] = await Promise.all([DDD.getOwners(), DDD.getStandings()]);
    const allTimeMap = {}; standings.allTime.forEach(r => allTimeMap[r.owner] = r);

    const cards = owners.map(o => {
        const rec = allTimeMap[o.slug];
        return `<a class="owner-card" href="#/teams/${o.slug}">
            <div class="name">${fmt.escapeHtml(o.displayName)}</div>
            <div class="mini-record">${rec ? fmt.record(rec.wins, rec.losses, rec.ties) + " all-time" : ""}</div>
            ${trophyIconRow(o.accolades)}
        </a>`;
    }).join("");

    root.innerHTML = `<div class="section-title">All Owners</div><div class="grid cols-3">${cards}</div>`;
};

Views.teamProfile = async function (root, params) {
    const slug = params[0];
    const [owners, profiles, standings, leagueBadges] = await Promise.all([DDD.getOwners(), DDD.getProfiles(), DDD.getStandings(), computeLeagueBadges()]);
    const owner = owners.find(o => o.slug === slug);
    const profile = profiles.find(p => p.owner === slug);

    if (!owner || !profile) {
        root.innerHTML = `<p class="empty-state">Team not found.</p>`;
        return;
    }

    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);
    const nameOf = (s) => ownerMap[s] ? ownerMap[s].displayName : s;

    const seasonRows = [...profile.seasonRecords].sort((a, b) => b.season - a.season);
    const at = profile.allTime;

    const seasonTable = `<table class="data">
        <thead><tr><th class="left">Season</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>xW</th><th>Luck</th><th>Bench Pts</th></tr></thead>
        <tbody>
        ${seasonRows.map(s => `<tr>
            <td class="left">${s.season}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.ties || 0}</td>
            <td>${fmt.pts(s.pointsFor)}</td><td>${fmt.pts(s.pointsAgainst)}</td>
            <td>${s.expectedWins ?? "—"}</td><td>${fmt.signed(s.luck)}</td><td>${fmt.pts(s.benchPoints)}</td>
        </tr>`).join("")}
        <tr style="font-weight:700;background:var(--bg-inset)">
            <td class="left">All-Time</td><td>${at.wins}</td><td>${at.losses}</td><td>${at.ties || 0}</td>
            <td>${fmt.pts(at.pointsFor)}</td><td>${fmt.pts(at.pointsAgainst)}</td>
            <td>${at.expectedWins ?? "—"}</td><td>${fmt.signed(at.luck)}</td><td>${fmt.pts(at.benchPoints)}</td>
        </tr>
        </tbody>
    </table>`;

    const h = profile.careerHighlights || {};
    function hCard(title, entry, isPlayer) {
        if (!entry) return "";
        const sub = isPlayer
            ? `${fmt.escapeHtml(entry.player)}`
            : `vs ${nameOf(entry.opponent)}`;
        const val = ("margin" in entry) ? fmt.signed(entry.margin) : fmt.pts(entry.points);
        return `<div class="stat-tile" style="text-align:left;border:1px solid var(--border);border-radius:8px">
            <div class="label" style="margin-top:0">${title}</div>
            <div class="value" style="font-size:19px">${val}</div>
            <div style="font-size:12px;color:var(--text-muted)">${sub} · S${entry.season} W${entry.week}</div>
        </div>`;
    }

    const highlightsHtml = `<div class="grid cols-3">
        ${hCard("Highest Score", h.highestScore)}
        ${hCard("Lowest Score", h.lowestScore)}
        ${hCard("Biggest Win Margin", h.biggestMarginOfVictory)}
        ${hCard("Closest Win", h.closestWin)}
        ${hCard("Closest Loss", h.closestLoss)}
        ${hCard("Worst Blowout Loss", h.worstBlowoutLoss)}
        ${hCard("Worst Benched Player", h.worstBenchedPlayer, true)}
    </div>`;

    const posOrder = ["QB", "RB", "WR", "TE", "D/ST", "K"];
    const posRows = [...(profile.positionalLeaders || [])].sort((a, b) => posOrder.indexOf(a.position) - posOrder.indexOf(b.position));
    const posTable = `<table class="data">
        <thead><tr><th class="left">Position</th><th>All-Time Points</th><th class="left">Best Single Season</th><th>Points</th></tr></thead>
        <tbody>${posRows.map(p => `<tr>
            <td class="left">${fmt.escapeHtml(p.position)}</td>
            <td>${fmt.pts(p.totalHistoricalPoints)}</td>
            <td class="left">${fmt.escapeHtml(p.topPerformer)} <span style="color:var(--text-muted)">(${p.topPerformerSeason})</span></td>
            <td>${fmt.pts(p.topPerformerPoints)}</td>
        </tr>`).join("")}</tbody>
    </table>`;

    const myBadges = leagueBadges[slug] || [];
    const badgesHtml = myBadges.length ? `<div class="trophy-row" style="margin-top:8px">${myBadges.map(b => `<span class="badge trophy">${b.icon} ${fmt.escapeHtml(b.label)}</span>`).join("")}</div>` : "";

    root.innerHTML = `
        <div class="card">
            <h1 style="margin:2px 0 10px">${fmt.escapeHtml(owner.displayName)}</h1>
            <div class="trophy-row">${trophyBadges(owner.accolades)}</div>
            ${badgesHtml}
        </div>
        <div class="card"><h2>Season Records</h2><div class="table-scroll">${seasonTable}</div></div>
        <div class="card"><h2>Career Highlights</h2>${highlightsHtml}</div>
        <div class="card"><h2>Positional Leaders</h2><div class="table-scroll">${posTable}</div></div>
        <p><a href="#/teams">← All teams</a></p>
    `;
};

// ---------------------------------------------------------------- Matchups
function ownerLine(slug, ownerMap) { return ownerLink(slug, ownerMap[slug]?.displayName || slug); }

async function weeklyAwardsHtml(season, week, games, ownerMap) {
    if (!games.length) return "";
    const [luck, lineupEfficiency, mistakesLookup] = await Promise.all([DDD.getLuck(), DDD.getLineupEfficiency(), buildMistakesLookup(season)]);

    const weekTeams = [];
    games.forEach(m => {
        weekTeams.push({ owner: m.awayOwner, points: m.awayPts, opp: m.homeOwner, oppPoints: m.homePts, result: m.winner === "AWAY" ? "W" : m.winner === "HOME" ? "L" : "T" });
        weekTeams.push({ owner: m.homeOwner, points: m.homePts, opp: m.awayOwner, oppPoints: m.awayPts, result: m.winner === "HOME" ? "W" : m.winner === "AWAY" ? "L" : "T" });
    });

    const topScore = [...weekTeams].sort((a, b) => b.points - a.points)[0];
    const lowScore = [...weekTeams].sort((a, b) => a.points - b.points)[0];

    const weekEff = lineupEfficiency.filter(r => r.season === season && r.week === week);
    const bestEff = [...weekEff].sort((a, b) => b.efficiencyPct - a.efficiencyPct)[0];

    const weekLuck = luck.weekly.filter(r => r.season === season && r.week === week);
    const luckiestWin = [...weekLuck].filter(r => r.result === "W").sort((a, b) => a.expectedWinPct - b.expectedWinPct)[0];
    const unluckiestLoss = [...weekLuck].filter(r => r.result === "L").sort((a, b) => b.expectedWinPct - a.expectedWinPct)[0];

    const mistakesThisWeek = Object.values(mistakesLookup).filter(m => m.week === week);
    const worstMistake = [...mistakesThisWeek].sort((a, b) => b.pointsCost - a.pointsCost)[0];

    const withMargin = games.map(m => ({ ...m, margin: Math.abs(m.awayPts - m.homePts) }));
    const closest = [...withMargin].sort((a, b) => a.margin - b.margin)[0];
    const blowout = [...withMargin].sort((a, b) => b.margin - a.margin)[0];

    function tile(icon, label, value, sub) {
        return `<div class="stat-tile" style="text-align:left;border:1px solid var(--border);border-radius:8px">
            <div class="label" style="margin-top:0">${icon} ${label}</div>
            <div class="value" style="font-size:18px">${value}</div>
            <div style="font-size:12px;color:var(--text-muted)">${sub}</div>
        </div>`;
    }

    const tiles = [
        topScore ? tile("📈", "Top Score", fmt.pts(topScore.points), ownerLine(topScore.owner, ownerMap)) : "",
        lowScore ? tile("📉", "Low Score", fmt.pts(lowScore.points), ownerLine(lowScore.owner, ownerMap)) : "",
        bestEff ? tile("🎯", "Manager of the Week", fmt.pct(bestEff.efficiencyPct, 0), ownerLine(bestEff.owner, ownerMap)) : "",
        luckiestWin ? tile("🍀", "Luckiest Win", fmt.pct(luckiestWin.expectedWinPct, 0) + " exp.", ownerLine(luckiestWin.owner, ownerMap)) : "",
        unluckiestLoss ? tile("💀", "Unluckiest Loss", fmt.pct(unluckiestLoss.expectedWinPct, 0) + " exp.", ownerLine(unluckiestLoss.owner, ownerMap)) : "",
        worstMistake ? tile("🪑", "Worst Bench Mistake", "+" + fmt.pts(worstMistake.pointsCost), `${ownerLine(worstMistake.owner, ownerMap)}: benched ${fmt.escapeHtml(worstMistake.benchedPlayer)}`) : "",
        closest ? tile("⚡", "Closest Game", fmt.pts(closest.margin), `${ownerLine(closest.awayOwner, ownerMap)} vs ${ownerLine(closest.homeOwner, ownerMap)}`) : "",
        blowout ? tile("💥", "Biggest Blowout", fmt.pts(blowout.margin), `${ownerLine(blowout.awayOwner, ownerMap)} vs ${ownerLine(blowout.homeOwner, ownerMap)}`) : ""
    ].join("");

    return `<div class="card">
        <h3>🏅 Week ${week} Awards</h3>
        <div class="grid cols-4">${tiles}</div>
    </div>`;
}

Views.matchups = async function (root, params) {
    const [meta, matchups, owners] = await Promise.all([DDD.getMeta(), DDD.getMatchups(), DDD.getOwners()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const seasonOptions = [...meta.seasons].sort((a, b) => b - a);
    let season = Number(params[0]) || (matchups.some(m => m.season === meta.currentSeason) ? meta.currentSeason : seasonOptions[0]);
    const weeksForSeason = [...new Set(matchups.filter(m => m.season === season).map(m => m.week))].sort((a, b) => a - b);
    let week = Number(params[1]) || (weeksForSeason.includes(meta.currentWeek) ? meta.currentWeek : weeksForSeason[weeksForSeason.length - 1]);

    const games = matchups.filter(m => m.season === season && m.week === week)
        .sort((a, b) => a.game - b.game);

    const mistakesLookup = games.length ? await buildMistakesLookup(season) : null;
    const awardsHtml = await weeklyAwardsHtml(season, week, games, ownerMap);

    root.innerHTML = `
        <div class="card">
            <h2>Matchups</h2>
            <div class="toolbar">
                <select id="season-select">${seasonOptions.map(s => `<option value="${s}" ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select>
                <select id="week-select">${weeksForSeason.map(w => `<option value="${w}" ${w === week ? "selected" : ""}>Week ${w}</option>`).join("")}</select>
            </div>
        </div>
        ${awardsHtml}
        <div id="matchup-list">
            ${games.length ? games.map(m => matchupCard(m, ownerMap, { mistakesLookup })).join("") : `<p class="empty-state">No games this week.</p>`}
        </div>
    `;

    document.getElementById("season-select").addEventListener("change", (e) => {
        location.hash = `#/matchups/${e.target.value}`;
    });
    document.getElementById("week-select").addEventListener("change", (e) => {
        location.hash = `#/matchups/${season}/${e.target.value}`;
    });
};

// ---------------------------------------------------------------- Playoffs / Onion Bowl
const REGULAR_SEASON_WEEKS = 14; // confirmed via ESPN league settings (matchupPeriodCount), stable across seasons
const PLAYOFF_TEAM_COUNT = 6;

function seedStandings(matchups, season) {
    const regRows = matchups.filter(m => m.season === season && m.week <= REGULAR_SEASON_WEEKS);
    const acc = {};
    regRows.forEach(m => {
        [["awayOwner", "awayPts", "homeOwner", "homePts"], ["homeOwner", "homePts", "awayOwner", "awayPts"]].forEach(([oKey, pKey, oppKey, oppPKey]) => {
            const owner = m[oKey];
            if (!owner) return;
            if (!acc[owner]) acc[owner] = { owner, wins: 0, losses: 0, ties: 0, points: 0 };
            acc[owner].points += m[pKey];
            const won = m.winner === (oKey === "awayOwner" ? "AWAY" : "HOME");
            const tied = m.winner === "TIE";
            if (tied) acc[owner].ties++;
            else if (won) acc[owner].wins++;
            else acc[owner].losses++;
        });
    });
    const rows = Object.values(acc).sort((a, b) => (b.wins - a.wins) || (b.points - a.points));
    rows.forEach((r, i) => r.seed = i + 1);
    return rows;
}

Views.playoffs = async function (root, params) {
    const [meta, matchups, owners] = await Promise.all([DDD.getMeta(), DDD.getMatchups(), DDD.getOwners()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const seasonOptions = [...meta.seasons].sort((a, b) => b - a);
    const season = Number(params[0]) || seasonOptions[0];

    const seeds = seedStandings(matchups, season);
    const seedOf = {}; seeds.forEach(r => { seedOf[r.owner] = r.seed; });
    const playoffOwners = new Set(seeds.filter(r => r.seed <= PLAYOFF_TEAM_COUNT).map(r => r.owner));

    const postseason = matchups.filter(m => m.season === season && m.week > REGULAR_SEASON_WEEKS && m.awayOwner)
        .sort((a, b) => a.week - b.week);

    const playoffGames = postseason.filter(m => playoffOwners.has(m.awayOwner) && playoffOwners.has(m.homeOwner));
    const consolationGames = postseason.filter(m => !playoffOwners.has(m.awayOwner) && !playoffOwners.has(m.homeOwner));

    // The champion / Onion Bowl winner-loser come from each owner's accolades
    // (already verified correct), not from guessing ESPN's exact bracket-tree
    // structure -- with byes and placement games sharing the same week, that
    // structure isn't reliably reconstructable from matchup results alone.
    function findByAccolade(pattern) { return owners.find(o => o.accolades.some(a => pattern.test(a) && a.includes(String(season))))?.slug; }
    const champion = findByAccolade(/Champion$/);
    const onionWinner = findByAccolade(/Onion Bowl Winner$/);
    const onionLoser = findByAccolade(/Onion Bowl Loser$/);

    function gamesByWeek(games) {
        const byWeek = {};
        games.forEach(g => { if (!byWeek[g.week]) byWeek[g.week] = []; byWeek[g.week].push(g); });
        return Object.keys(byWeek).map(Number).sort((a, b) => a - b).map(w => ({ week: w, games: byWeek[w] }));
    }

    function section(games) {
        return gamesByWeek(games).map(({ week, games }) => `
            <div class="section-title">Week ${week}</div>
            <div class="grid cols-2">${games.map(g => {
                const aWin = g.winner === "AWAY", bWin = g.winner === "HOME";
                return `<div class="card" style="padding:12px 14px">
                    <div style="display:flex;justify-content:space-between;font-weight:${aWin ? 700 : 400}">
                        <span>(${seedOf[g.awayOwner] || "?"}) ${ownerLine(g.awayOwner, ownerMap)}</span><span>${fmt.pts(g.awayPts)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-weight:${bWin ? 700 : 400};margin-top:4px">
                        <span>(${seedOf[g.homeOwner] || "?"}) ${ownerLine(g.homeOwner, ownerMap)}</span><span>${fmt.pts(g.homePts)}</span>
                    </div>
                </div>`;
            }).join("")}</div>
        `).join("");
    }

    root.innerHTML = `
        <div class="card">
            <h2>Playoffs &amp; Onion Bowl</h2>
            <div class="toolbar">
                ${seasonOptions.map(s => `<button class="btn ${s === season ? "active" : ""}" onclick="location.hash='#/playoffs/${s}'">${s}</button>`).join("")}
            </div>
            <p style="color:var(--text-muted);font-size:13px">Seeds 1-${PLAYOFF_TEAM_COUNT} made the playoffs (by regular-season record through Week ${REGULAR_SEASON_WEEKS}, ties broken by points); the rest play down in the Onion Bowl ladder. Games are grouped by week, not by bracket round &mdash; ESPN's exact bracket tree (who has a bye, which game is the "real" final vs. a placement game) isn't reconstructable from the results alone when several games share a week, so seeds are shown on every game instead of guessing round labels.</p>
            <div class="grid cols-2">
                ${champion ? `<div class="stat-tile" style="text-align:left"><div class="label" style="margin-top:0">🏆 Champion</div><div class="value" style="font-size:18px">${ownerLine(champion, ownerMap)}</div></div>` : ""}
                ${onionWinner ? `<div class="stat-tile" style="text-align:left"><div class="label" style="margin-top:0">🧅 Onion Bowl</div><div class="value" style="font-size:14px">${ownerLine(onionWinner, ownerMap)} beat ${ownerLine(onionLoser, ownerMap)}</div></div>` : ""}
            </div>
        </div>
        <h2>🏆 Playoff Games (Seeds 1-${PLAYOFF_TEAM_COUNT})</h2>
        ${playoffGames.length ? section(playoffGames) : `<p class="empty-state">Playoffs haven't started yet this season.</p>`}
        <h2 style="margin-top:22px">🧅 Onion Bowl Ladder (Seeds ${PLAYOFF_TEAM_COUNT + 1}-12)</h2>
        ${consolationGames.length ? section(consolationGames) : `<p class="empty-state">Not decided yet this season.</p>`}
    `;
};

// ---------------------------------------------------------------- Transactions
Views.transactions = async function (root, params) {
    const [meta, owners, tx] = await Promise.all([DDD.getMeta(), DDD.getOwners(), DDD.getTransactions()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);
    const seasonOptions = [...meta.seasons].sort((a, b) => b - a);
    const subTab = params[0] || "pickups";
    const selected = params[1] || "all";

    root.innerHTML = `
        <div class="card">
            <h2>Waiver Wire &amp; Trades</h2>
            <p style="color:var(--text-muted);font-size:13px">
                <strong>A note on accuracy:</strong> ESPN's real activity log only retains a rolling ~2-month window, so the 2023-2025 seasons can't be pulled from it &mdash; those trades are <em>inferred</em> from week-to-week roster changes instead (a "trade" means players swapped rosters the same week between two teams). Multi-player swaps are essentially certain to be real trades; single 1-for-1 swaps are flagged as lower-confidence since they could occasionally be coincidental, unrelated waiver moves.
                Starting with the 2026 season, trades are pulled directly from ESPN's real transaction log and archived permanently here, so they'll only get more accurate and complete as the season goes on &mdash; no more guessing. Draft-pick-only trades aren't tracked here (this page is about player value, not picks).
            </p>
            <div class="toolbar">
                <button class="btn ${subTab === "pickups" ? "active" : ""}" onclick="location.hash='#/transactions/pickups/${selected}'">Waiver Pickups</button>
                <button class="btn ${subTab === "trades" ? "active" : ""}" onclick="location.hash='#/transactions/trades/${selected}'">Trades</button>
            </div>
            <div class="toolbar">
                ${seasonOptions.map(s => `<button class="btn ${String(s) === selected ? "active" : ""}" onclick="location.hash='#/transactions/${subTab}/${s}'">${s}</button>`).join("")}
                <button class="btn ${selected === "all" ? "active" : ""}" onclick="location.hash='#/transactions/${subTab}/all'">All-Time</button>
            </div>
        </div>
        <div id="tx-body"></div>
    `;

    const body = document.getElementById("tx-body");
    if (subTab === "trades") Views._transactionsTrades(body, tx, ownerMap, selected);
    else Views._transactionsPickups(body, tx, ownerMap, selected);
};

Views._transactionsPickups = function (root, tx, ownerMap, selected) {
    let rows = tx.pickups.filter(p => !p.fromOwner);
    if (selected !== "all") rows = rows.filter(p => p.season === Number(selected));
    rows = [...rows].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 40);

    root.innerHTML = `
        <div class="section-title">Best Waiver / Free-Agent Pickups</div>
        <div class="card">
            <div class="table-scroll">
                <table class="data">
                    <thead><tr>
                        <th class="left">Owner</th><th class="left">Player</th><th>Pos</th>
                        <th class="left">Acquired</th><th>Weeks Rostered</th><th>Total Pts</th><th>Started Pts</th><th>Pts/Wk</th>
                    </tr></thead>
                    <tbody>${rows.map(r => `<tr>
                        <td class="left">${ownerLink(r.owner, ownerMap[r.owner]?.displayName || r.owner)}</td>
                        <td class="left">${fmt.escapeHtml(r.player)}</td>
                        <td>${fmt.escapeHtml(r.position)}</td>
                        <td class="left">S${r.season} W${r.week}</td>
                        <td>${r.weeksRostered}</td>
                        <td><strong>${fmt.pts(r.totalPoints)}</strong></td>
                        <td>${fmt.pts(r.startedPoints)}</td>
                        <td>${fmt.pts(r.avgPointsPerWeek)}</td>
                    </tr>`).join("")}</tbody>
                </table>
            </div>
        </div>
    `;
};

Views._transactionsTrades = function (root, tx, ownerMap, selected) {
    let trades = tx.trades;
    if (selected !== "all") trades = trades.filter(t => t.season === Number(selected));

    const verified = trades.filter(t => t.verified);
    const heuristic = trades.filter(t => !t.verified);

    // heuristic trades are logged one row per matched leg; group same-week
    // legs between the same two owners into one card
    const groups = {};
    heuristic.forEach(t => {
        const pair = [t.teamA.owner, t.teamB.owner].sort().join("|");
        const key = `${t.season}|${t.week}|${pair}`;
        if (!groups[key]) groups[key] = { season: t.season, week: t.week, owners: pair.split("|"), items: [], confidence: t.confidence, id: `h:${key}` };
        groups[key].items.push(t);
    });
    const heuristicGroups = Object.values(groups).sort((a, b) => (b.season - a.season) || (b.week - a.week));
    const highGroups = heuristicGroups.filter(g => g.confidence === "high");
    const lowGroups = heuristicGroups.filter(g => g.confidence !== "high");

    verified.forEach(t => {
        const pair = [t.teamA.owner, t.teamB.owner].sort().join("|");
        t.id = `v:${t.season}|${pair}|${t.teamA.receivedItems.join(",")}|${t.teamB.receivedItems.join(",")}`;
    });

    // re-render triggers for the exclusion toggles below
    window.__tradeToggle = (id) => { TradeExclusions.toggle(id); Views._transactionsTrades(root, tx, ownerMap, selected); };
    window.__tradeReset = () => { TradeExclusions.clearAll(); Views._transactionsTrades(root, tx, ownerMap, selected); };

    function excludeToggle(id) {
        const excluded = TradeExclusions.isExcluded(id);
        return `<label style="font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none">
            <input type="checkbox" ${excluded ? "checked" : ""} onchange="window.__tradeToggle('${id}')"> Exclude from totals
        </label>`;
    }

    // ---- net trade value per owner: points received minus points given up, summed across every non-excluded trade ----
    const netValue = {};
    function addNet(owner, delta) { netValue[owner] = (netValue[owner] || 0) + delta; }
    heuristicGroups.filter(g => !TradeExclusions.isExcluded(g.id)).forEach(g => {
        const [ownerA, ownerB] = g.owners;
        const aTotal = g.items.reduce((s, it) => s + (it.teamA.owner === ownerA ? it.teamA.totalPoints : it.teamB.totalPoints), 0);
        const bTotal = g.items.reduce((s, it) => s + (it.teamA.owner === ownerB ? it.teamA.totalPoints : it.teamB.totalPoints), 0);
        addNet(ownerA, aTotal - bTotal);
        addNet(ownerB, bTotal - aTotal);
    });
    const netRows = Object.keys(netValue).map(owner => ({ owner, value: netValue[owner] })).sort((a, b) => b.value - a.value);
    const excludedCount = TradeExclusions.count();

    function heuristicSide(items, ownerSlug) {
        const total = items.reduce((s, it) => s + (it.teamA.owner === ownerSlug ? it.teamA.totalPoints : it.teamB.totalPoints), 0);
        const rows = items.map(it => {
            const side = it.teamA.owner === ownerSlug ? it.teamA : it.teamB;
            return `<div style="font-size:13px;margin-top:2px">${fmt.escapeHtml(side.received)} <span style="color:var(--text-muted)">(${side.position}, ${fmt.pts(side.totalPoints)} pts, ${side.weeksRostered}wk)</span></div>`;
        }).join("");
        return { total, rows };
    }

    function confidenceBadge(confidence) {
        if (confidence === "verified") return `<span class="badge trophy">✓ ESPN-verified</span>`;
        if (confidence === "high") return `<span class="badge">high confidence</span>`;
        return `<span class="badge">possible trade — could be coincidental waiver moves</span>`;
    }

    function heuristicCard(g) {
        const [ownerA, ownerB] = g.owners;
        const a = heuristicSide(g.items, ownerA), b = heuristicSide(g.items, ownerB);
        const aWon = a.total > b.total, bWon = b.total > a.total;
        const excluded = TradeExclusions.isExcluded(g.id);
        return `<div class="card" style="${excluded ? "opacity:.5" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="font-size:12px;color:var(--text-muted)">Week ${g.week} &middot; ${confidenceBadge(g.confidence)}</div>
                ${excludeToggle(g.id)}
            </div>
            <div class="grid cols-2">
                <div>
                    <div style="font-weight:700">${ownerLink(ownerA, ownerMap[ownerA]?.displayName || ownerA)} received ${aWon ? "🏆" : ""}</div>
                    ${a.rows}
                    <div style="margin-top:6px;font-weight:700">${fmt.pts(a.total)} pts total</div>
                </div>
                <div>
                    <div style="font-weight:700">${ownerLink(ownerB, ownerMap[ownerB]?.displayName || ownerB)} received ${bWon ? "🏆" : ""}</div>
                    ${b.rows}
                    <div style="margin-top:6px;font-weight:700">${fmt.pts(b.total)} pts total</div>
                </div>
            </div>
        </div>`;
    }

    function verifiedCard(t) {
        const excluded = TradeExclusions.isExcluded(t.id);
        return `<div class="card" style="${excluded ? "opacity:.5" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="font-size:12px;color:var(--text-muted)">${confidenceBadge("verified")}</div>
                ${excludeToggle(t.id)}
            </div>
            <div class="grid cols-2">
                <div>
                    <div style="font-weight:700">${ownerLink(t.teamA.owner, ownerMap[t.teamA.owner]?.displayName || t.teamA.owner)} received</div>
                    ${t.teamA.receivedItems.map(item => `<div style="font-size:13px;margin-top:2px">${fmt.escapeHtml(item)}</div>`).join("")}
                </div>
                <div>
                    <div style="font-weight:700">${ownerLink(t.teamB.owner, ownerMap[t.teamB.owner]?.displayName || t.teamB.owner)} received</div>
                    ${t.teamB.receivedItems.map(item => `<div style="font-size:13px;margin-top:2px">${fmt.escapeHtml(item)}</div>`).join("")}
                </div>
            </div>
        </div>`;
    }

    // group any list of trade-like records by season, most recent first
    function bySeasonSections(items, seasonOf, renderFn) {
        const bySeason = {};
        items.forEach(it => {
            const s = seasonOf(it);
            if (!bySeason[s]) bySeason[s] = [];
            bySeason[s].push(it);
        });
        const seasons = Object.keys(bySeason).map(Number).sort((a, b) => b - a);
        return seasons.map(s => `
            <div class="section-title">Season ${s} (${bySeason[s].length})</div>
            ${bySeason[s].map(renderFn).join("")}
        `).join("");
    }

    const netValueHtml = netRows.length ? `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
                <h3 style="margin:0">Net Trade Value by Team</h3>
                ${excludedCount ? `<button class="btn" onclick="window.__tradeReset()">${excludedCount} trade${excludedCount === 1 ? "" : "s"} excluded — reset</button>` : ""}
            </div>
            <p style="color:var(--text-muted);font-size:13px">Points gained minus points given up, summed across every inferred trade (2023-2025 only &mdash; verified 2026+ trades don't have point totals yet since they're mostly draft picks). Use "Exclude from totals" on any trade below if you know it wasn't real &mdash; this is saved on your device only, so it won't change what other people see.</p>
            ${barChart(netRows, { labelFn: r => ownerMap[r.owner]?.displayName || r.owner, valueFn: r => r.value, formatFn: v => fmt.signed(v) })}
        </div>` : "";

    root.innerHTML = `
        ${netValueHtml}
        <h2 style="margin-top:22px">✓ ESPN-Verified Trades (${verified.length})</h2>
        ${verified.length ? bySeasonSections(verified, t => t.season, verifiedCard) : `<p class="empty-state">None yet for this filter &mdash; only tracked from the 2026 season onward.</p>`}

        <h2 style="margin-top:22px">High-Confidence Trades (${highGroups.length})</h2>
        ${highGroups.length ? bySeasonSections(highGroups, g => g.season, heuristicCard) : `<p class="empty-state">None for this filter.</p>`}

        <h2 style="margin-top:22px">Possible Trades &mdash; Lower Confidence (${lowGroups.length})</h2>
        ${lowGroups.length ? bySeasonSections(lowGroups, g => g.season, heuristicCard) : `<p class="empty-state">None for this filter.</p>`}
    `;
};

// ---------------------------------------------------------------- Stats
Views.stats = async function (root, params) {
    const tab = params[0] || "luck";
    const tabs = [
        ["power", "Power Rankings"],
        ["luck", "Luck"],
        ["efficiency", "Lineup Efficiency"],
        ["bench", "Bench"],
        ["projections", "Projections"],
        ["positions", "Positional Leaders"]
    ];
    root.innerHTML = `
        <div class="card">
            <h2>League Stats</h2>
            <div class="toolbar">
                ${tabs.map(([key, label]) => `<button class="btn ${tab === key ? "active" : ""}" onclick="location.hash='#/stats/${key}'">${label}</button>`).join("")}
            </div>
        </div>
        <div id="stats-body"><div class="spinner-text">Loading...</div></div>
    `;
    const body = document.getElementById("stats-body");
    if (tab === "power") await Views._statsPower(body, params.slice(1));
    else if (tab === "luck") await Views._statsLuck(body, params.slice(1));
    else if (tab === "efficiency") await Views._statsEfficiency(body, params.slice(1));
    else if (tab === "bench") await Views._statsBench(body, params.slice(1));
    else if (tab === "projections") await Views._statsProjections(body, params.slice(1));
    else await Views._statsPositions(body, params.slice(1));
};

function percentileRank(rows, keyFn) {
    // returns a Map from row -> 0..1 percentile (higher key value = higher percentile)
    const sorted = [...rows].sort((a, b) => keyFn(a) - keyFn(b));
    const map = new Map();
    sorted.forEach((r, i) => map.set(r, rows.length > 1 ? i / (rows.length - 1) : 1));
    return map;
}

Views._statsPower = async function (root, params) {
    const [meta, owners, matchups, lineupEfficiency] = await Promise.all([
        DDD.getMeta(), DDD.getOwners(), DDD.getMatchups(), DDD.getLineupEfficiency()
    ]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const seasonOptions = [...meta.seasons].sort((a, b) => b - a);
    const season = Number(params[0]) || (matchups.some(m => m.season === meta.currentSeason) ? meta.currentSeason : seasonOptions[0]);
    const seasonMatchups = matchups.filter(m => m.season === season);
    const weeksForSeason = [...new Set(seasonMatchups.map(m => m.week))].sort((a, b) => a - b);
    const week = Number(params[1]) || (weeksForSeason.includes(meta.currentWeek) ? meta.currentWeek : weeksForSeason[weeksForSeason.length - 1]);

    // team-week rows for this season (owner, week, points, result)
    const teamWeeks = [];
    seasonMatchups.forEach(m => {
        if (m.awayOwner) teamWeeks.push({ owner: m.awayOwner, week: m.week, points: m.awayPts, result: m.winner === "AWAY" ? "W" : m.winner === "HOME" ? "L" : "T" });
        teamWeeks.push({ owner: m.homeOwner, week: m.week, points: m.homePts, result: m.winner === "HOME" ? "W" : m.winner === "AWAY" ? "L" : "T" });
    });

    const effByOwnerWeek = {};
    lineupEfficiency.filter(r => r.season === season).forEach(r => { effByOwnerWeek[`${r.owner}|${r.week}`] = r.efficiencyPct; });

    function computeForWeek(w) {
        const through = teamWeeks.filter(t => t.week <= w);
        const byOwner = {};
        through.forEach(t => {
            if (!byOwner[t.owner]) byOwner[t.owner] = { points: [], wins: 0, games: 0, effs: [] };
            const b = byOwner[t.owner];
            b.points.push(t.points);
            b.games++;
            if (t.result === "W") b.wins++;
        });
        // trailing-3 form + efficiency need per-week lookups
        Object.keys(byOwner).forEach(owner => {
            const rowsForOwner = through.filter(t => t.owner === owner).sort((a, b) => a.week - b.week);
            const trailing = rowsForOwner.slice(-3);
            byOwner[owner].recentForm = trailing.reduce((s, r) => s + r.points, 0) / trailing.length;
            const effs = rowsForOwner.map(r => effByOwnerWeek[`${owner}|${r.week}`]).filter(v => v !== undefined);
            byOwner[owner].avgEff = effs.length ? effs.reduce((s, v) => s + v, 0) / effs.length : null;
        });

        const rows = Object.keys(byOwner).map(owner => {
            const b = byOwner[owner];
            return {
                owner,
                pointsPerGame: b.points.reduce((s, p) => s + p, 0) / b.games,
                winPct: b.wins / b.games,
                recentForm: b.recentForm,
                avgEff: b.avgEff
            };
        });

        const ppgRank = percentileRank(rows, r => r.pointsPerGame);
        const winRank = percentileRank(rows, r => r.winPct);
        const formRank = percentileRank(rows, r => r.recentForm);
        const effRank = percentileRank(rows, r => r.avgEff === null ? 0 : r.avgEff);

        rows.forEach(r => {
            r.score = 100 * (0.40 * ppgRank.get(r) + 0.30 * winRank.get(r) + 0.20 * formRank.get(r) + 0.10 * effRank.get(r));
        });
        rows.sort((a, b) => b.score - a.score);
        rows.forEach((r, i) => r.rank = i + 1);
        return rows;
    }

    const current = computeForWeek(week);
    const prevWeekNum = weeksForSeason[weeksForSeason.indexOf(week) - 1];
    const prevRanks = {};
    if (prevWeekNum) computeForWeek(prevWeekNum).forEach(r => { prevRanks[r.owner] = r.rank; });

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                ${seasonOptions.map(s => `<button class="btn ${s === season ? "active" : ""}" onclick="location.hash='#/stats/power/${s}'">${s}</button>`).join("")}
            </div>
            <div class="toolbar">
                ${weeksForSeason.map(w => `<button class="btn ${w === week ? "active" : ""}" onclick="location.hash='#/stats/power/${season}/${w}'">Week ${w}</button>`).join("")}
            </div>
            <p style="color:var(--text-muted);font-size:13px">A blended score (0-100) using season-to-date points/game (40%), win% (30%), trailing-3-week form (20%), and lineup efficiency (10%) &mdash; a truer read on team strength than the standings alone.</p>
            <table class="data">
                <thead><tr><th>#</th><th class="left">Team</th><th>Score</th><th>Pts/Gm</th><th>Win%</th><th>Last 3 Wks</th><th>Trend</th></tr></thead>
                <tbody>${current.map(r => {
                    const prev = prevRanks[r.owner];
                    let trend = `<span style="color:var(--text-muted)">–</span>`;
                    if (prev !== undefined) {
                        const diff = prev - r.rank;
                        if (diff > 0) trend = `<span style="color:var(--win)">▲ ${diff}</span>`;
                        else if (diff < 0) trend = `<span style="color:var(--loss)">▼ ${Math.abs(diff)}</span>`;
                        else trend = `<span style="color:var(--text-muted)">–</span>`;
                    }
                    return `<tr>
                        <td>${r.rank}</td>
                        <td class="left">${ownerLink(r.owner, ownerMap[r.owner]?.displayName || r.owner)}</td>
                        <td><strong>${r.score.toFixed(1)}</strong></td>
                        <td>${fmt.pts(r.pointsPerGame)}</td>
                        <td>${fmt.pct(r.winPct, 0)}</td>
                        <td>${fmt.pts(r.recentForm)}</td>
                        <td>${trend}</td>
                    </tr>`;
                }).join("")}</tbody>
            </table>
        </div>
    `;
};

Views._statsLuck = async function (root, params) {
    const [meta, owners, luck] = await Promise.all([DDD.getMeta(), DDD.getOwners(), DDD.getLuck()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);
    const options = [...meta.seasons].sort((a, b) => b - a);
    const selected = params[0] || "all";

    const rows = selected === "all" ? luck.allTime : luck.bySeason.filter(r => r.season === Number(selected));
    const sorted = [...rows].sort((a, b) => b.luck - a.luck);

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                ${options.map(s => `<button class="btn ${String(s) === selected ? "active" : ""}" onclick="location.hash='#/stats/luck/${s}'">${s}</button>`).join("")}
                <button class="btn ${selected === "all" ? "active" : ""}" onclick="location.hash='#/stats/luck/all'">All-Time</button>
            </div>
            <p style="color:var(--text-muted);font-size:13px">Positive = luckier than their weekly scores deserved (won games they were expected to lose). Negative = unlucky.</p>
            ${barChart(sorted, {
                labelFn: r => ownerMap[r.owner] ? ownerMap[r.owner].displayName : r.owner,
                valueFn: r => r.luck,
                formatFn: v => fmt.signed(v, 1)
            })}
        </div>
    `;
};

Views._statsEfficiency = async function (root, params) {
    const [meta, owners, eff] = await Promise.all([DDD.getMeta(), DDD.getOwners(), DDD.getLineupEfficiency()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);
    const options = [...meta.seasons].sort((a, b) => b - a);
    const selected = params[0] || "all";

    const rows = selected === "all" ? eff : eff.filter(r => r.season === Number(selected));
    const byOwner = {};
    rows.forEach(r => {
        if (!byOwner[r.owner]) byOwner[r.owner] = { sumEff: 0, n: 0, sumLeft: 0 };
        byOwner[r.owner].sumEff += r.efficiencyPct || 0;
        byOwner[r.owner].sumLeft += r.pointsLeftOnBench || 0;
        byOwner[r.owner].n++;
    });
    const summary = Object.keys(byOwner).map(owner => ({
        owner, avgEfficiency: byOwner[owner].sumEff / byOwner[owner].n,
        totalLeftOnBench: byOwner[owner].sumLeft
    })).sort((a, b) => b.avgEfficiency - a.avgEfficiency);

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                ${options.map(s => `<button class="btn ${String(s) === selected ? "active" : ""}" onclick="location.hash='#/stats/efficiency/${s}'">${s}</button>`).join("")}
                <button class="btn ${selected === "all" ? "active" : ""}" onclick="location.hash='#/stats/efficiency/all'">All-Time</button>
            </div>
            <p style="color:var(--text-muted);font-size:13px">Average % of the mathematically-optimal lineup each team actually started, week to week.</p>
            ${barChart(summary, {
                labelFn: r => ownerMap[r.owner] ? ownerMap[r.owner].displayName : r.owner,
                valueFn: r => r.avgEfficiency,
                formatFn: v => fmt.pct(v)
            })}
        </div>
    `;
};

Views._statsBench = async function (root, params) {
    const [meta, owners, profiles] = await Promise.all([DDD.getMeta(), DDD.getOwners(), DDD.getProfiles()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);
    const options = [...meta.seasons].sort((a, b) => b - a);
    const selected = params[0] || "all";

    let rows;
    if (selected === "all") {
        rows = profiles.map(p => ({ owner: p.owner, points: p.allTime.benchPoints || 0 }));
    } else {
        rows = profiles.map(p => {
            const sr = p.seasonRecords.find(s => s.season === Number(selected));
            return { owner: p.owner, points: sr ? (sr.benchPoints || 0) : 0 };
        });
    }
    rows.sort((a, b) => b.points - a.points);

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                ${options.map(s => `<button class="btn ${String(s) === selected ? "active" : ""}" onclick="location.hash='#/stats/bench/${s}'">${s}</button>`).join("")}
                <button class="btn ${selected === "all" ? "active" : ""}" onclick="location.hash='#/stats/bench/all'">All-Time</button>
            </div>
            <h3>Bench Points Left</h3>
            <p style="color:var(--text-muted);font-size:13px">Position by position, each week: did a benched player at that spot outscore your worst starter there? Summed up, this is the cost of bad start/sit calls.</p>
            ${barChart(rows, { labelFn: r => ownerMap[r.owner] ? ownerMap[r.owner].displayName : r.owner, valueFn: r => r.points, formatFn: v => fmt.pts(v) })}
        </div>
    `;
};

const MIN_PROJECTION_FOR_PCT = 1; // exclude near-zero projections from % comparisons (e.g. projected 0, scored 0.1)

Views._statsProjections = async function (root, params) {
    const [meta, owners] = await Promise.all([DDD.getMeta(), DDD.getOwners()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const seasonOptions = [...meta.seasons].sort((a, b) => b - a);
    const season = Number(params[0]) || seasonOptions[0];
    const boxscores = await DDD.getBoxscores(season);
    const weeksForSeason = [...new Set(boxscores.map(r => r.week))].sort((a, b) => a - b);
    const week = Number(params[1]) || (weeksForSeason.includes(meta.currentWeek) ? meta.currentWeek : weeksForSeason[weeksForSeason.length - 1]);

    const rows = boxscores
        .filter(r => r.week === week && r.projectedPoints !== null && r.projectedPoints !== undefined)
        .map(r => ({ ...r, diff: r.points - r.projectedPoints }));
    const pctEligible = rows.filter(r => Math.abs(r.projectedPoints) >= MIN_PROJECTION_FOR_PCT)
        .map(r => ({ ...r, pctDiff: r.diff / r.projectedPoints }));

    function table(list, valueLabel, valueFn) {
        return `<table class="data">
            <thead><tr><th class="left">Player</th><th class="left">Owner</th><th>Pos</th><th>Proj</th><th>Actual</th><th>${valueLabel}</th></tr></thead>
            <tbody>${list.map(r => `<tr>
                <td class="left">${fmt.escapeHtml(r.player)}</td>
                <td class="left">${ownerLink(r.owner, ownerMap[r.owner]?.displayName || r.owner)}</td>
                <td>${fmt.escapeHtml(r.position)}</td>
                <td>${fmt.pts(r.projectedPoints)}</td>
                <td>${fmt.pts(r.points)}</td>
                <td><strong>${valueFn(r)}</strong></td>
            </tr>`).join("")}</tbody>
        </table>`;
    }

    const biggestBeat = [...rows].sort((a, b) => b.diff - a.diff).slice(0, 10);
    const biggestBust = [...rows].sort((a, b) => a.diff - b.diff).slice(0, 10);
    const bestPct = [...pctEligible].sort((a, b) => b.pctDiff - a.pctDiff).slice(0, 10);
    const worstPct = [...pctEligible].sort((a, b) => a.pctDiff - b.pctDiff).slice(0, 10);

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="proj-season">${seasonOptions.map(s => `<option value="${s}" ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select>
                <select id="proj-week">${weeksForSeason.map(w => `<option value="${w}" ${w === week ? "selected" : ""}>Week ${w}</option>`).join("")}</select>
            </div>
            <p style="color:var(--text-muted);font-size:13px">How every rostered player did against their preseason-of-that-week ESPN projection. Percentage comparisons exclude players projected for under ${MIN_PROJECTION_FOR_PCT} point, since a tiny projection makes the % swing meaningless (e.g. projected 0, scored 0.1).</p>
        </div>
        <div class="two-col">
            <div class="card">
                <h3>📈 Biggest Beat (points)</h3>
                <div class="table-scroll">${table(biggestBeat, "+/-", r => fmt.signed(r.diff))}</div>
            </div>
            <div class="card">
                <h3>📉 Biggest Bust (points)</h3>
                <div class="table-scroll">${table(biggestBust, "+/-", r => fmt.signed(r.diff))}</div>
            </div>
        </div>
        <div class="two-col">
            <div class="card">
                <h3>🚀 Best Beat (%)</h3>
                <div class="table-scroll">${table(bestPct, "%", r => fmt.signed(r.pctDiff * 100, 0) + "%")}</div>
            </div>
            <div class="card">
                <h3>💩 Worst Bust (%)</h3>
                <div class="table-scroll">${table(worstPct, "%", r => fmt.signed(r.pctDiff * 100, 0) + "%")}</div>
            </div>
        </div>
    `;

    document.getElementById("proj-season").addEventListener("change", (e) => {
        location.hash = `#/stats/projections/${e.target.value}`;
    });
    document.getElementById("proj-week").addEventListener("change", (e) => {
        location.hash = `#/stats/projections/${season}/${e.target.value}`;
    });
};

Views._statsPositions = async function (root) {
    const [owners, profiles] = await Promise.all([DDD.getOwners(), DDD.getProfiles()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);
    const positions = ["QB", "RB", "WR", "TE", "D/ST", "K"];

    const sections = positions.map(pos => {
        const rows = profiles.map(p => {
            const entry = (p.positionalLeaders || []).find(pl => pl.position === pos);
            return entry ? { owner: p.owner, ...entry } : null;
        }).filter(Boolean).sort((a, b) => b.totalHistoricalPoints - a.totalHistoricalPoints);

        const bestSingleSeason = [...rows].sort((a, b) => b.topPerformerPoints - a.topPerformerPoints)[0];

        return `<div class="card">
            <h3>${pos}</h3>
            ${bestSingleSeason ? `<p style="font-size:13px;color:var(--text-muted)">Best single season: <strong>${fmt.escapeHtml(bestSingleSeason.topPerformer)}</strong> (${fmt.escapeHtml(ownerMap[bestSingleSeason.owner]?.displayName || bestSingleSeason.owner)}, ${bestSingleSeason.topPerformerSeason}) — ${fmt.pts(bestSingleSeason.topPerformerPoints)} pts</p>` : ""}
            <table class="data">
                <thead><tr><th class="left">Owner</th><th>All-Time Pts</th><th class="left">Top Player (best season)</th></tr></thead>
                <tbody>${rows.map(r => `<tr>
                    <td class="left">${ownerLink(r.owner, ownerMap[r.owner]?.displayName || r.owner)}</td>
                    <td>${fmt.pts(r.totalHistoricalPoints)}</td>
                    <td class="left">${fmt.escapeHtml(r.topPerformer)} (${r.topPerformerSeason}, ${fmt.pts(r.topPerformerPoints)})</td>
                </tr>`).join("")}</tbody>
            </table>
        </div>`;
    }).join("");

    root.innerHTML = sections;
};

// Net trade value per owner across all heuristic (2023-2025) trades, unfiltered
// by any personal exclusion toggles -- used for the objective league badges.
function computeNetTradeValueByOwner(trades) {
    const heuristic = trades.filter(t => !t.verified);
    const groups = {};
    heuristic.forEach(t => {
        const pair = [t.teamA.owner, t.teamB.owner].sort().join("|");
        const key = `${t.season}|${t.week}|${pair}`;
        if (!groups[key]) groups[key] = { owners: pair.split("|"), items: [] };
        groups[key].items.push(t);
    });
    const netValue = {};
    Object.values(groups).forEach(g => {
        const [ownerA, ownerB] = g.owners;
        const aTotal = g.items.reduce((s, it) => s + (it.teamA.owner === ownerA ? it.teamA.totalPoints : it.teamB.totalPoints), 0);
        const bTotal = g.items.reduce((s, it) => s + (it.teamA.owner === ownerB ? it.teamA.totalPoints : it.teamB.totalPoints), 0);
        netValue[ownerA] = (netValue[ownerA] || 0) + (aTotal - bTotal);
        netValue[ownerB] = (netValue[ownerB] || 0) + (bTotal - aTotal);
    });
    return netValue;
}

// ---------------------------------------------------------------- Career badges (league records)
let _leagueBadgesCache = null;
async function computeLeagueBadges() {
    if (_leagueBadgesCache) return _leagueBadgesCache;

    const [profiles, lineupEfficiency, transactions] = await Promise.all([
        DDD.getProfiles(), DDD.getLineupEfficiency(), DDD.getTransactions()
    ]);

    const badges = {}; // ownerSlug -> [{icon, label}]
    function award(owner, icon, label) {
        if (!owner) return;
        if (!badges[owner]) badges[owner] = [];
        badges[owner].push({ icon, label });
    }
    function best(list, keyFn, compareBetter) {
        let bestItem = null, bestVal = null;
        list.forEach(item => {
            const v = keyFn(item);
            if (v === null || v === undefined) return;
            if (bestVal === null || compareBetter(v, bestVal)) { bestVal = v; bestItem = item; }
        });
        return bestItem;
    }
    const higher = (a, b) => a > b;
    const lower = (a, b) => a < b;

    const withHighest = profiles.filter(p => p.careerHighlights?.highestScore);
    award(best(withHighest, p => p.careerHighlights.highestScore.points, higher)?.owner, "🔥", "Highest Score Ever");
    award(best(withHighest, p => p.careerHighlights.lowestScore.points, lower)?.owner, "🥶", "Lowest Score Ever");

    const withMargin = profiles.filter(p => p.careerHighlights?.biggestMarginOfVictory);
    award(best(withMargin, p => p.careerHighlights.biggestMarginOfVictory.margin, higher)?.owner, "💥", "Biggest Blowout Ever");
    const withWorstLoss = profiles.filter(p => p.careerHighlights?.worstBlowoutLoss);
    award(best(withWorstLoss, p => p.careerHighlights.worstBlowoutLoss.margin, lower)?.owner, "😵", "Worst Blowout Loss Ever");

    const withClosestWin = profiles.filter(p => p.careerHighlights?.closestWin);
    award(best(withClosestWin, p => p.careerHighlights.closestWin.margin, lower)?.owner, "⚡", "Clutch (Closest Win Ever)");
    const withClosestLoss = profiles.filter(p => p.careerHighlights?.closestLoss);
    award(best(withClosestLoss, p => p.careerHighlights.closestLoss.margin, higher)?.owner, "💔", "Heartbreak (Closest Loss Ever)");

    award(best(profiles, p => p.allTime.benchPoints, higher)?.owner, "🪑", "Human Bench");
    award(best(profiles, p => p.allTime.luck, higher)?.owner, "🍀", "Luckiest Ever");
    award(best(profiles, p => p.allTime.luck, lower)?.owner, "💀", "Unluckiest Ever");

    // avg lineup efficiency all-time
    const effByOwner = {};
    lineupEfficiency.forEach(r => {
        if (!effByOwner[r.owner]) effByOwner[r.owner] = { sum: 0, n: 0 };
        effByOwner[r.owner].sum += r.efficiencyPct || 0;
        effByOwner[r.owner].n++;
    });
    const effRows = Object.keys(effByOwner).map(owner => ({ owner, avg: effByOwner[owner].sum / effByOwner[owner].n }));
    award(best(effRows, r => r.avg, higher)?.owner, "🎯", "Most Efficient Manager Ever");

    // net trade value
    const netValue = computeNetTradeValueByOwner(transactions.trades);
    const netRows = Object.keys(netValue).map(owner => ({ owner, value: netValue[owner] }));
    award(best(netRows, r => r.value, higher)?.owner, "💰", "Trade Shark");
    award(best(netRows, r => r.value, lower)?.owner, "🩸", "Trade Victim");

    // best single waiver pickup
    const pickups = transactions.pickups.filter(p => !p.fromOwner);
    award(best(pickups, p => p.totalPoints, higher)?.owner, "🎣", "Waiver Wire Wizard");

    _leagueBadgesCache = badges;
    return badges;
}

// ---------------------------------------------------------------- Rivalries
const RIVAL_PAIRS = [
    ["charlie-wright", "pat-elliott"],
    ["michael-cole", "tommy-alexander"],
    ["brooks-rush", "noah-jordan"],
    ["tommy-denlinger", "patrick-culcasi"],
    ["greg-nieskens", "carter-davis"],
    ["kyle-roche", "will-samuel"]
];

function rivalryLookup(h2h, ownerA, ownerB) {
    const rec = h2h.find(p => (p.ownerA === ownerA && p.ownerB === ownerB) || (p.ownerA === ownerB && p.ownerB === ownerA));
    if (!rec) return null;
    if (rec.ownerA === ownerA) return { aWins: rec.aWins, bWins: rec.bWins, ties: rec.ties, aPoints: rec.aPoints, bPoints: rec.bPoints, games: rec.games };
    return { aWins: rec.bWins, bWins: rec.aWins, ties: rec.ties, aPoints: rec.bPoints, bPoints: rec.aPoints, games: rec.games };
}

Views.rivalry = async function (root, params) {
    const [pairA, pairB] = (params[0] || "").split("_vs_");
    const [owners, h2h, matchups] = await Promise.all([DDD.getOwners(), DDD.getHeadToHead(), DDD.getMatchups()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    if (!pairA || !pairB || !ownerMap[pairA] || !ownerMap[pairB]) {
        root.innerHTML = `<p class="empty-state">Rivalry not found.</p>`;
        return;
    }

    const rec = rivalryLookup(h2h, pairA, pairB) || { aWins: 0, bWins: 0, ties: 0, aPoints: 0, bPoints: 0, games: 0 };
    const games = matchups.filter(m =>
        (m.awayOwner === pairA && m.homeOwner === pairB) || (m.awayOwner === pairB && m.homeOwner === pairA)
    ).sort((a, b) => (b.season - a.season) || (b.week - a.week));

    const withMargin = games.map(m => {
        const aPts = m.awayOwner === pairA ? m.awayPts : m.homePts;
        const bPts = m.awayOwner === pairA ? m.homePts : m.awayPts;
        return { ...m, aPts, bPts, margin: aPts - bPts };
    });
    const biggestBlowout = [...withMargin].sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin))[0];
    const closest = [...withMargin].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0];

    function gameRow(m) {
        const aWon = m.margin > 0, bWon = m.margin < 0;
        return `<tr>
            <td class="left">S${m.season} W${m.week}</td>
            <td style="font-weight:${aWon ? 700 : 400}">${fmt.pts(m.aPts)}</td>
            <td style="font-weight:${bWon ? 700 : 400}">${fmt.pts(m.bPts)}</td>
            <td>${fmt.signed(m.margin)}</td>
        </tr>`;
    }

    const oA = ownerMap[pairA], oB = ownerMap[pairB];
    root.innerHTML = `
        <div class="card">
            <h2>🔥 ${fmt.escapeHtml(oA.displayName)} vs ${fmt.escapeHtml(oB.displayName)}</h2>
            <div class="grid cols-3">
                <div class="stat-tile"><div class="value">${rec.aWins}-${rec.bWins}${rec.ties ? "-" + rec.ties : ""}</div><div class="label">${fmt.escapeHtml(oA.displayName)}'s record</div></div>
                <div class="stat-tile"><div class="value">${rec.games}</div><div class="label">All-time meetings</div></div>
                <div class="stat-tile"><div class="value">${fmt.pts(rec.aPoints)} - ${fmt.pts(rec.bPoints)}</div><div class="label">Total points</div></div>
            </div>
        </div>
        <div class="grid cols-2">
            ${biggestBlowout ? `<div class="card">
                <h3>Biggest Blowout</h3>
                <div style="font-size:20px;font-weight:800">${fmt.signed(biggestBlowout.margin)}</div>
                <div style="color:var(--text-muted);font-size:13px">S${biggestBlowout.season} W${biggestBlowout.week}: ${fmt.pts(biggestBlowout.aPts)} - ${fmt.pts(biggestBlowout.bPts)}</div>
            </div>` : ""}
            ${closest ? `<div class="card">
                <h3>Closest Game</h3>
                <div style="font-size:20px;font-weight:800">${fmt.signed(closest.margin)}</div>
                <div style="color:var(--text-muted);font-size:13px">S${closest.season} W${closest.week}: ${fmt.pts(closest.aPts)} - ${fmt.pts(closest.bPts)}</div>
            </div>` : ""}
        </div>
        <div class="card">
            <h3>Full History</h3>
            <div class="table-scroll">
                <table class="data">
                    <thead><tr><th class="left">Week</th><th>${fmt.escapeHtml(oA.displayName)}</th><th>${fmt.escapeHtml(oB.displayName)}</th><th>Margin</th></tr></thead>
                    <tbody>${games.length ? withMargin.map(gameRow).join("") : `<tr><td colspan="4" class="left">No meetings yet.</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <p><a href="#/h2h">← All rivalries</a></p>
    `;
};

// ---------------------------------------------------------------- Head-to-Head
Views.h2h = async function (root) {
    const [owners, h2h] = await Promise.all([DDD.getOwners(), DDD.getHeadToHead()]);
    const pairMap = {};
    h2h.forEach(p => { pairMap[`${p.ownerA}|${p.ownerB}`] = p; });

    function lookup(rowSlug, colSlug) {
        if (rowSlug === colSlug) return null;
        const key1 = `${rowSlug}|${colSlug}`, key2 = `${colSlug}|${rowSlug}`;
        if (pairMap[key1]) { const p = pairMap[key1]; return { w: p.aWins, l: p.bWins, t: p.ties }; }
        if (pairMap[key2]) { const p = pairMap[key2]; return { w: p.bWins, l: p.aWins, t: p.ties }; }
        return null;
    }

    function shortName(o) {
        const parts = o.displayName.split(" ");
        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : o.displayName;
    }

    const header = owners.map(o => `<th>${fmt.escapeHtml(shortName(o))}</th>`).join("");
    const rows = owners.map(rOwner => {
        const cells = owners.map(cOwner => {
            if (rOwner.slug === cOwner.slug) return `<td class="self">—</td>`;
            const rec = lookup(rOwner.slug, cOwner.slug);
            if (!rec) return `<td>—</td>`;
            return `<td><a href="#/teams/${rOwner.slug}" title="${fmt.escapeHtml(rOwner.displayName)} vs ${fmt.escapeHtml(cOwner.displayName)}">${rec.w}-${rec.l}${rec.t ? "-" + rec.t : ""}</a></td>`;
        }).join("");
        return `<tr><th class="left">${fmt.escapeHtml(shortName(rOwner))}</th>${cells}</tr>`;
    }).join("");

    const rivalryCards = RIVAL_PAIRS.map(([a, b]) => {
        const rec = rivalryLookup(h2h, a, b) || { aWins: 0, bWins: 0, ties: 0 };
        const oa = owners.find(o => o.slug === a), ob = owners.find(o => o.slug === b);
        return `<a class="owner-card" href="#/rivalry/${a}_vs_${b}">
            <div class="name" style="font-size:15px">${fmt.escapeHtml(oa?.displayName || a)}<br>vs<br>${fmt.escapeHtml(ob?.displayName || b)}</div>
            <div class="mini-record">${rec.aWins}-${rec.bWins}${rec.ties ? "-" + rec.ties : ""} all-time</div>
        </a>`;
    }).join("");

    root.innerHTML = `
        <div class="section-title">🔥 Rivalries</div>
        <div class="grid cols-3">${rivalryCards}</div>

        <div class="card">
            <h2>Head-to-Head (All-Time)</h2>
            <p style="color:var(--text-muted);font-size:13px">Row's record vs. Column, regular season matchups, all seasons combined.</p>
            <div class="table-scroll">
                <table class="data h2h-table">
                    <thead><tr><th></th>${header}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
};

// ---------------------------------------------------------------- Player profile (from search)
Views.player = async function (root, params) {
    const playerName = decodeURIComponent(params[0] || "");
    const [owners, playerIndex] = await Promise.all([DDD.getOwners(), DDD.getPlayerIndex()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const entry = playerIndex.find(p => p.player === playerName);
    if (!entry) {
        root.innerHTML = `<p class="empty-state">No data found for "${fmt.escapeHtml(playerName)}".</p>`;
        return;
    }

    const boxscoresBySeason = await Promise.all(entry.seasons.map(s => DDD.getBoxscores(s)));
    const rows = boxscoresBySeason.flat().filter(r => r.player === playerName).sort((a, b) => (b.season - a.season) || (a.week - b.week));

    const bySeason = {};
    rows.forEach(r => {
        if (!bySeason[r.season]) bySeason[r.season] = { points: 0, games: 0, owners: new Set() };
        bySeason[r.season].points += r.points;
        bySeason[r.season].games++;
        bySeason[r.season].owners.add(r.owner);
    });
    const seasonRows = Object.keys(bySeason).map(Number).sort((a, b) => b - a).map(s => ({
        season: s, points: bySeason[s].points, games: bySeason[s].games, owners: [...bySeason[s].owners]
    }));

    const bestGame = [...rows].sort((a, b) => b.points - a.points)[0];

    root.innerHTML = `
        <div class="card">
            <h1 style="margin:2px 0 10px">${fmt.escapeHtml(playerName)}</h1>
            <div style="color:var(--text-muted);font-size:13px">${fmt.escapeHtml(entry.position)} &middot; ${fmt.pts(entry.totalPoints)} career points across this league</div>
        </div>
        <div class="card">
            <h2>Season Breakdown</h2>
            <table class="data">
                <thead><tr><th class="left">Season</th><th class="left">Roster(s)</th><th>Games</th><th>Total Pts</th></tr></thead>
                <tbody>${seasonRows.map(s => `<tr>
                    <td class="left">${s.season}</td>
                    <td class="left">${s.owners.map(o => ownerLink(o, ownerMap[o]?.displayName || o)).join(", ")}</td>
                    <td>${s.games}</td>
                    <td><strong>${fmt.pts(s.points)}</strong></td>
                </tr>`).join("")}</tbody>
            </table>
        </div>
        ${bestGame ? `<div class="card">
            <h2>Best Game</h2>
            <div style="font-size:20px;font-weight:800">${fmt.pts(bestGame.points)} pts</div>
            <div style="color:var(--text-muted);font-size:13px">S${bestGame.season} W${bestGame.week}, playing for ${ownerLink(bestGame.owner, ownerMap[bestGame.owner]?.displayName || bestGame.owner)}</div>
        </div>` : ""}
    `;
};

// ---------------------------------------------------------------- Search bar
function initSiteSearch() {
    const input = document.getElementById("site-search");
    const results = document.getElementById("search-results");
    if (!input || !results) return;

    let owners = null, playerIndex = null;
    let debounceTimer = null;

    async function ensureData() {
        if (!owners) owners = await DDD.getOwners();
        if (!playerIndex) playerIndex = await DDD.getPlayerIndex();
    }

    function render(query) {
        const q = query.trim().toLowerCase();
        if (!q) { results.classList.remove("open"); results.innerHTML = ""; return; }

        const ownerMatches = owners.filter(o =>
            o.displayName.toLowerCase().includes(q) || (o.nickname || "").toLowerCase().includes(q)
        ).slice(0, 5);

        const playerMatches = playerIndex.filter(p => p.player.toLowerCase().includes(q))
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .slice(0, 8);

        if (!ownerMatches.length && !playerMatches.length) {
            results.innerHTML = `<div style="padding:10px 12px;font-size:13px;color:var(--text-muted)">No matches</div>`;
            results.classList.add("open");
            return;
        }

        let html = "";
        if (ownerMatches.length) {
            html += `<div class="group-label">Owners</div>`;
            html += ownerMatches.map(o => `<a href="#/teams/${o.slug}">${fmt.escapeHtml(o.displayName)}</a>`).join("");
        }
        if (playerMatches.length) {
            html += `<div class="group-label">Players</div>`;
            html += playerMatches.map(p => `<a href="#/player/${encodeURIComponent(p.player)}">${fmt.escapeHtml(p.player)} <span class="muted">(${fmt.escapeHtml(p.position)}, ${fmt.pts(p.totalPoints)} pts)</span></a>`).join("");
        }
        results.innerHTML = html;
        results.classList.add("open");
    }

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const q = input.value;
        debounceTimer = setTimeout(async () => {
            await ensureData();
            render(q);
        }, 120);
    });

    input.addEventListener("focus", async () => {
        await ensureData();
        if (input.value.trim()) render(input.value);
    });

    document.addEventListener("click", (e) => {
        if (!results.contains(e.target) && e.target !== input) {
            results.classList.remove("open");
        }
    });

    results.addEventListener("click", () => {
        results.classList.remove("open");
        input.value = "";
    });
}
