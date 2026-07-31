// Router + shell chrome (nav highlighting, last-updated banner, theme).

const routes = {
    "": Views.home,
    "standings": Views.standings,
    "teams": Views.teams,
    "matchups": Views.matchups,
    "transactions": Views.transactions,
    "stats": Views.stats,
    "h2h": Views.h2h,
    "player": Views.player
};

function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const segments = raw.split("/").filter(Boolean);
    const routeKey = segments[0] || "";
    return { routeKey, params: segments.slice(1) };
}

async function render() {
    const app = document.getElementById("app");
    const { routeKey, params } = parseHash();

    // teams/:slug is the one route with a sub-page under a top-level tab
    let view = routes[routeKey];
    let effectiveParams = params;
    if (routeKey === "teams" && params.length) {
        view = Views.teamProfile;
    }

    document.querySelectorAll("nav.tabs a").forEach(a => {
        const r = a.getAttribute("data-route").replace(/^\//, "");
        a.classList.toggle("active", r === routeKey);
    });

    if (!view) {
        app.innerHTML = `<p class="empty-state">Page not found. <a href="#/">Go home</a></p>`;
        return;
    }

    app.innerHTML = `<div class="spinner-text">Loading...</div>`;
    try {
        await view(app, effectiveParams);
    } catch (err) {
        console.error(err);
        app.innerHTML = `<p class="empty-state">Something went wrong loading this page.<br><span style="font-size:12px">${fmt.escapeHtml(err.message)}</span></p>`;
    }
    window.scrollTo({ top: 0 });
}

async function initBanner() {
    try {
        const meta = await DDD.getMeta();
        document.getElementById("league-full-name").textContent = meta.leagueName;
        document.title = `${meta.leagueShortName} Fantasy Football`;

        function paint() {
            const el = document.getElementById("updated-banner-content");
            el.innerHTML = `<span class="dot"></span>Data last updated <strong>${fmt.dateTime(meta.generatedAt)}</strong> (${fmt.relativeTime(meta.generatedAt)}) &middot; ${meta.currentSeason} Week ${meta.currentWeek}`;
        }
        paint();
        setInterval(paint, 30000);
    } catch (err) {
        document.getElementById("updated-banner-content").textContent = "Could not load league data.";
        console.error(err);
    }
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
    initBanner();
    initSiteSearch();
    render();
});
