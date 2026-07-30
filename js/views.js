// All page render functions. Each takes the #app container element and an
// array of route params (from the hash path) and fills in the container.

const Views = {};

function ownerLink(slug, name) {
    return `<a href="#/teams/${slug}">${fmt.escapeHtml(name)}</a>`;
}

function resultPill(result) {
    if (result === "W") return `<span class="pill win">W</span>`;
    if (result === "L") return `<span class="pill loss">L</span>`;
    return `<span class="pill tie">T</span>`;
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
    const [meta, standings, matchups, owners, luck] = await Promise.all([
        DDD.getMeta(), DDD.getStandings(), DDD.getMatchups(), DDD.getOwners(), DDD.getLuck()
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
        matchupsHtml = thisWeekGames.map(m => matchupCard(m, ownerMap)).join("");
    } else {
        matchupsHtml = `<p class="empty-state">No games yet this week.</p>`;
    }

    // trophy teaser: most recent champion + onion bowl
    const champs = owners.filter(o => o.accolades.some(a => /champion$/i.test(a) && !/co-/i.test(a)));
    const trophyHtml = champs.map(o => {
        const champLine = o.accolades.find(a => /champion$/i.test(a));
        return `<div class="stat-tile" style="text-align:left">
            <div style="font-size:12px;color:var(--text-muted)">${fmt.escapeHtml(champLine)}</div>
            <div style="font-weight:700">${ownerLink(o.slug, o.displayName)}</div>
        </div>`;
    }).join("");

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

function matchupCard(m, ownerMap, opts) {
    opts = opts || {};
    const awayWin = m.winner === "AWAY", homeWin = m.winner === "HOME";
    const ao = ownerMap[m.awayOwner] || {}, ho = ownerMap[m.homeOwner] || {};
    const id = `mu-${m.season}-${m.week}-${m.game}`;
    return `<div class="card" style="padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer" onclick="Views._toggleBox('${id}', ${m.season}, ${m.week}, '${m.awayOwner}', '${m.homeOwner}')">
            <div style="flex:1">
                <div style="font-weight:${awayWin ? 700 : 400}">${fmt.escapeHtml(m.awayTeam)} <span style="color:var(--text-muted);font-weight:400">(${ownerLinkText(ao)})</span></div>
                <div style="font-weight:${homeWin ? 700 : 400}">${fmt.escapeHtml(m.homeTeam)} <span style="color:var(--text-muted);font-weight:400">(${ownerLinkText(ho)})</span></div>
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
    const [owners, profiles, standings] = await Promise.all([DDD.getOwners(), DDD.getProfiles(), DDD.getStandings()]);
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
        <thead><tr><th class="left">Position</th><th>All-Time Points</th><th class="left">Best Season</th><th>Season</th><th>Points</th></tr></thead>
        <tbody>${posRows.map(p => `<tr>
            <td class="left">${fmt.escapeHtml(p.position)}</td>
            <td>${fmt.pts(p.totalHistoricalPoints)}</td>
            <td class="left">${fmt.escapeHtml(p.topPerformer)}</td>
            <td>${p.topPerformerSeason}</td>
            <td>${fmt.pts(p.topPerformerPoints)}</td>
        </tr>`).join("")}</tbody>
    </table>`;

    root.innerHTML = `
        <div class="card">
            <h1 style="margin:2px 0 10px">${fmt.escapeHtml(owner.displayName)}</h1>
            <div class="trophy-row">${trophyBadges(owner.accolades)}</div>
        </div>
        <div class="card"><h2>Season Records</h2><div class="table-scroll">${seasonTable}</div></div>
        <div class="card"><h2>Career Highlights</h2>${highlightsHtml}</div>
        <div class="card"><h2>Positional Leaders</h2><div class="table-scroll">${posTable}</div></div>
        <p><a href="#/teams">← All teams</a></p>
    `;
};

// ---------------------------------------------------------------- Matchups
Views.matchups = async function (root, params) {
    const [meta, matchups, owners] = await Promise.all([DDD.getMeta(), DDD.getMatchups(), DDD.getOwners()]);
    const ownerMap = {}; owners.forEach(o => ownerMap[o.slug] = o);

    const seasonOptions = [...meta.seasons].sort((a, b) => b - a);
    let season = Number(params[0]) || (matchups.some(m => m.season === meta.currentSeason) ? meta.currentSeason : seasonOptions[0]);
    const weeksForSeason = [...new Set(matchups.filter(m => m.season === season).map(m => m.week))].sort((a, b) => a - b);
    let week = Number(params[1]) || (weeksForSeason.includes(meta.currentWeek) ? meta.currentWeek : weeksForSeason[weeksForSeason.length - 1]);

    const games = matchups.filter(m => m.season === season && m.week === week)
        .sort((a, b) => a.game - b.game);

    root.innerHTML = `
        <div class="card">
            <h2>Matchups</h2>
            <div class="toolbar">
                <select id="season-select">${seasonOptions.map(s => `<option value="${s}" ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select>
                <select id="week-select">${weeksForSeason.map(w => `<option value="${w}" ${w === week ? "selected" : ""}>Week ${w}</option>`).join("")}</select>
            </div>
        </div>
        <div id="matchup-list">
            ${games.length ? games.map(m => matchupCard(m, ownerMap)).join("") : `<p class="empty-state">No games this week.</p>`}
        </div>
    `;

    document.getElementById("season-select").addEventListener("change", (e) => {
        location.hash = `#/matchups/${e.target.value}`;
    });
    document.getElementById("week-select").addEventListener("change", (e) => {
        location.hash = `#/matchups/${season}/${e.target.value}`;
    });
};

// ---------------------------------------------------------------- Stats
Views.stats = async function (root, params) {
    const tab = params[0] || "luck";
    const tabs = [
        ["luck", "Luck"],
        ["efficiency", "Lineup Efficiency"],
        ["bench", "Bench"],
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
    if (tab === "luck") await Views._statsLuck(body, params.slice(1));
    else if (tab === "efficiency") await Views._statsEfficiency(body, params.slice(1));
    else if (tab === "bench") await Views._statsBench(body, params.slice(1));
    else await Views._statsPositions(body, params.slice(1));
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

    root.innerHTML = `
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
