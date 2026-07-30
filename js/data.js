// Fetch + cache layer for the /data JSON files. Everything is loaded relative
// to this page, so it works the same on GitHub Pages or any static host.
const DDD = (function () {
    const cache = {};
    let buildVersion = null;

    async function getBuildVersion() {
        if (buildVersion) return buildVersion;
        // meta.json itself must always be fetched fresh (no cache) so we can
        // learn the current generatedAt timestamp, which then busts the
        // browser cache for every other data file on this page load.
        const res = await fetch(`data/meta.json`, { cache: "no-store" });
        const json = await res.json();
        buildVersion = encodeURIComponent(json.generatedAt);
        cache["meta.json"] = json;
        return buildVersion;
    }

    async function loadJSON(path) {
        if (cache[path]) return cache[path];
        const v = await getBuildVersion();
        if (cache[path]) return cache[path]; // meta.json gets populated as a side effect above
        const res = await fetch(`data/${path}?v=${v}`);
        if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
        const json = await res.json();
        cache[path] = json;
        return json;
    }

    const api = {
        getMeta: () => loadJSON("meta.json"),
        getOwners: () => loadJSON("owners.json"),
        getStandings: () => loadJSON("standings.json"),
        getProfiles: () => loadJSON("profiles.json"),
        getMatchups: () => loadJSON("matchups.json"),
        getLuck: () => loadJSON("luck.json"),
        getLineupEfficiency: () => loadJSON("lineup-efficiency.json"),
        getHeadToHead: () => loadJSON("head-to-head.json"),
        getFanFavorite: () => loadJSON("fan-favorite.json").catch(() => null),
        getBenchMistakes: () => loadJSON("bench-mistakes.json"),
        getTransactions: () => loadJSON("transactions.json"),
        getBoxscores: (season) => loadJSON(`boxscores/${season}.json`),

        // ---- convenience lookups, built lazily ----
        _ownerMap: null,
        async ownerMap() {
            if (!this._ownerMap) {
                const owners = await this.getOwners();
                this._ownerMap = {};
                owners.forEach(o => { this._ownerMap[o.slug] = o; });
            }
            return this._ownerMap;
        },
        async ownerName(slug) {
            const map = await this.ownerMap();
            return map[slug] ? map[slug].displayName : slug;
        },
        async ownerNickname(slug) {
            const map = await this.ownerMap();
            return map[slug] ? map[slug].nickname : "";
        }
    };

    return api;
})();

// ---- small formatting helpers shared across views ----
const fmt = {
    pts(n) {
        if (n === null || n === undefined) return "—";
        return Number(n).toFixed(2);
    },
    pct(n, digits = 1) {
        if (n === null || n === undefined) return "—";
        return (Number(n) * 100).toFixed(digits) + "%";
    },
    signed(n, digits = 2) {
        if (n === null || n === undefined) return "—";
        const v = Number(n);
        const s = v.toFixed(digits);
        return v > 0 ? `+${s}` : s;
    },
    record(w, l, t) {
        return t ? `${w}-${l}-${t}` : `${w}-${l}`;
    },
    dateTime(iso) {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            year: "numeric", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit"
        });
    },
    relativeTime(iso) {
        const d = new Date(iso).getTime();
        const now = Date.now();
        const diffMs = now - d;
        const mins = Math.round(diffMs / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
        const hours = Math.round(mins / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.round(hours / 24);
        return `${days} day${days === 1 ? "" : "s"} ago`;
    },
    escapeHtml(s) {
        if (s === null || s === undefined) return "";
        return String(s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
};

// Per-device trade exclusion toggles (Stats/Trades pages). Stored in this
// browser only -- not synced anywhere, so it's a personal "what if I ignore
// this one" filter, not an edit to the underlying data.
const TradeExclusions = {
    _key: "ddd_excluded_trades",
    _get() {
        try { return JSON.parse(localStorage.getItem(this._key)) || {}; }
        catch { return {}; }
    },
    isExcluded(id) { return !!this._get()[id]; },
    toggle(id) {
        const map = this._get();
        if (map[id]) delete map[id]; else map[id] = true;
        localStorage.setItem(this._key, JSON.stringify(map));
    },
    count() { return Object.keys(this._get()).length; },
    clearAll() { localStorage.removeItem(this._key); }
};
