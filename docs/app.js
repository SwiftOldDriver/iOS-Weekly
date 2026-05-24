/**
 * iOS Weekly site SPA
 * - hash-based router
 * - lazy-loaded full-text search via MiniSearch
 * - markdown rendering via marked
 * - reuses assets/page.css by wrapping content in <article id="nice">
 */

import { marked } from "./vendor/marked.esm.js";
import { tokenizeCJK } from "./vendor/tokenize.mjs";

const VIEW = document.getElementById("app-view");
const SEARCH_INPUT = document.getElementById("app-search-input");
const SEARCH_PANEL = document.getElementById("app-search-panel");
const NAV_LINKS = document.querySelectorAll(".app-nav a[data-route]");
const REPO_BASE = "https://github.com/SwiftOldDriver/iOS-Weekly/blob/master/";

marked.setOptions({ gfm: true, breaks: false });

/* page.css (designed for the "Nice" WeChat editor) styles `#nice hN .content`
 * for the colored accents. Wrap heading inner text so those rules light up. */
marked.use({
    renderer: {
        heading(text, level) {
            return `<h${level}><span class="content">${text}</span></h${level}>\n`;
        },
    },
});

const state = {
    index: null,        // full index.json
    byId: new Map(),    // id -> entry
    byType: { report: [], post: [], contributor: [] },
    yearGroups: [],     // [{ year, items: [] }]
    docCache: new Map(), // path -> rendered html
    miniSearch: null,
    searchLoading: null, // in-flight promise
};

const router = createRouter([
    { path: /^\/?$/, render: renderHome, name: "home" },
    { path: /^\/reports\/?$/, render: renderReports, name: "/reports" },
    { path: /^\/posts\/?$/, render: renderPosts, name: "/posts" },
    { path: /^\/contributors\/?$/, render: renderContributors, name: "/contributors" },
    { path: /^\/d\/(.+)$/, render: (m) => renderDetail(decodeURIComponent(m[1])) },
]);

bootstrap();

async function bootstrap() {
    try {
        const res = await fetch("data/index.json", { cache: "default" });
        if (!res.ok) throw new Error(`index.json HTTP ${res.status}`);
        const data = await res.json();
        ingest(data);
        window.addEventListener("hashchange", router.handle);
        router.handle();
        installSearchHandlers();
        installShortcuts();
    } catch (err) {
        VIEW.innerHTML = `<div class="app-empty">索引加载失败：${escapeHtml(err.message)}</div>`;
        console.error(err);
    }
}

function ingest(data) {
    state.index = data;
    for (const item of data.items) {
        state.byId.set(item.id, item);
        if (state.byType[item.type]) state.byType[item.type].push(item);
    }
    state.byType.report.sort((a, b) => (b.issue || 0) - (a.issue || 0));
    state.byType.post.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const years = new Map();
    for (const r of state.byType.report) {
        const y = r.year || "其他";
        if (!years.has(y)) years.set(y, []);
        years.get(y).push(r);
    }
    state.yearGroups = [...years.entries()]
        .map(([year, items]) => ({ year, items }))
        .sort((a, b) => (b.year || 0) - (a.year || 0));
}

/* =====================================================================
 * Router
 * ===================================================================== */
function createRouter(routes) {
    function parseHash() {
        const h = location.hash || "#/";
        return h.replace(/^#/, "");
    }
    async function handle() {
        const path = parseHash();
        for (const r of routes) {
            const m = path.match(r.path);
            if (m) {
                highlightNav(r.name);
                VIEW.innerHTML = `<div class="app-loading" aria-live="polite">载入中…</div>`;
                try {
                    await r.render(m);
                    VIEW.scrollTop = 0;
                    document.getElementById("main").focus({ preventScroll: true });
                    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
                } catch (err) {
                    console.error(err);
                    VIEW.innerHTML = `<div class="app-empty">加载失败：${escapeHtml(err.message)}</div>`;
                }
                return;
            }
        }
        VIEW.innerHTML = `<div class="app-empty">页面不存在 — <a href="#/">回到首页</a></div>`;
    }
    return { handle };
}

function highlightNav(name) {
    NAV_LINKS.forEach((a) => {
        a.classList.toggle("is-active", a.dataset.route === name);
    });
}

/* =====================================================================
 * Views
 * ===================================================================== */
function renderHome() {
    const reports = state.byType.report.slice(0, 8);
    const posts = state.byType.post;
    const contributors = state.byType.contributor.slice(0, 8);
    const stats = state.index.stats || {};

    const html = `
        <section class="app-hero">
            <h1 class="app-hero__title">iOS 开发者的精品周报检索站</h1>
            <p class="app-hero__sub">收录 ${stats.reports || 0} 期老司机 iOS 周报、${stats.posts || 0} 篇精品文章与 ${stats.contributors || 0} 位贡献者，支持全文搜索（按 <kbd>/</kbd> 快速聚焦）。</p>
            <div class="app-hero__stats">
                <div><strong>${stats.reports || 0}</strong> Reports</div>
                <div><strong>${stats.posts || 0}</strong> Posts</div>
                <div><strong>${stats.contributors || 0}</strong> Contributors</div>
                ${stats.builtAt ? `<div><strong>${stats.builtAt.slice(0, 10)}</strong> 索引更新</div>` : ""}
            </div>
        </section>

        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">最近周报</h2>
                <a class="app-section__more" href="#/reports">全部 Reports →</a>
            </div>
            <div class="app-grid">
                ${reports.map(cardReport).join("")}
            </div>
        </section>

        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">WWDC 内参</h2>
                <a class="app-section__more" href="https://swiftolddriver.github.io/WWDC-InternalReference/" target="_blank" rel="noopener">查看 WWDC 内参 →</a>
            </div>
            <article class="app-feature">
                <p class="app-feature__lede"><strong>WWDC 内参</strong> 系列是由「老司机技术」牵头组织的精品原创内容系列。已经做了几年了，口碑一直不错。得益于组建的审核团队和不断优化的创作流程，大家创作的内容都已经超越了视频本身的内容，非常有学习和参考意义。</p>
                <blockquote class="app-feature__quote">双审核机制：一位审核从专业性角度看内容是否正确，另外一位审核从读者角度看知识是否正确引导。</blockquote>
                <p class="app-feature__meta">仓库已脱敏开源，覆盖 WWDC 21 – 24 历年内参。</p>
                <div class="app-feature__actions">
                    <a class="app-btn app-btn--primary" href="https://swiftolddriver.github.io/WWDC-InternalReference/" target="_blank" rel="noopener">在线阅读 →</a>
                    <a class="app-btn" href="https://github.com/SwiftOldDriver/WWDC-InternalReference" target="_blank" rel="noopener">开源仓库 ↗</a>
                </div>
            </article>
        </section>

        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">精品文章</h2>
                <a class="app-section__more" href="#/posts">全部 Posts →</a>
            </div>
            <div class="app-grid">
                ${posts.map(cardPost).join("")}
            </div>
        </section>

        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">部分贡献者</h2>
                <a class="app-section__more" href="#/contributors">全部 Contributors →</a>
            </div>
            <div class="app-contributors">
                ${contributors.map(cardContributor).join("")}
            </div>
        </section>
    `;
    VIEW.innerHTML = html;
}

function renderReports() {
    const html = `
        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">Reports（${state.byType.report.length} 期）</h2>
            </div>
            ${state.yearGroups.map(renderYearGroup).join("")}
        </section>
    `;
    VIEW.innerHTML = html;

    VIEW.querySelectorAll(".app-year__head").forEach((btn) => {
        btn.addEventListener("click", () => {
            const yr = btn.closest(".app-year");
            yr.dataset.collapsed = yr.dataset.collapsed === "true" ? "false" : "true";
        });
    });
}

function renderYearGroup(group) {
    const collapsed = group.year < (state.yearGroups[0]?.year || 0) - 1;
    return `
        <section class="app-year" data-collapsed="${collapsed}">
            <button class="app-year__head" type="button">
                <span>${escapeHtml(String(group.year))}</span>
                <span class="app-year__count">${group.items.length} 期</span>
            </button>
            <ul class="app-year__body">
                ${group.items.map((it) => `
                    <li>
                        <a class="app-row" href="#/d/${encodeURIComponent(it.id)}" title="${escapeHtml(it.title)}">
                            <span class="app-row__issue">#${it.issue ?? "—"}</span>
                            <span class="app-row__title">${escapeHtml(reportShortTitle(it))}</span>
                            <span class="app-row__date">${escapeHtml(it.date || "")}</span>
                        </a>
                    </li>`).join("")}
            </ul>
        </section>
    `;
}

function renderPosts() {
    const html = `
        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">Posts（${state.byType.post.length} 篇）</h2>
            </div>
            <div class="app-grid">
                ${state.byType.post.map(cardPost).join("")}
            </div>
        </section>
    `;
    VIEW.innerHTML = html;
}

function renderContributors() {
    const html = `
        <section class="app-section">
            <div class="app-section__head">
                <h2 class="app-section__title">Contributors（${state.byType.contributor.length} 位）</h2>
            </div>
            <div class="app-contributors">
                ${state.byType.contributor.map(cardContributor).join("")}
            </div>
        </section>
    `;
    VIEW.innerHTML = html;
}

async function renderDetail(id) {
    const item = state.byId.get(id);
    if (!item) {
        VIEW.innerHTML = `<div class="app-empty">未找到内容 — <a href="#/">回到首页</a></div>`;
        return;
    }

    const head = `
        <article class="app-detail">
            <a class="app-detail__back" href="${backHref(item)}">返回${typeLabel(item.type)}列表</a>
            <div class="app-detail__meta">
                <span class="app-badge app-badge--${item.type}">${typeLabel(item.type)}</span>
                ${item.date ? `<span>${escapeHtml(item.date)}</span>` : ""}
                ${item.path ? `<a href="${REPO_BASE}${encodePath(item.path)}" target="_blank" rel="noopener">在 GitHub 查看源文件 ↗</a>` : ""}
            </div>
            <div id="app-detail-body">${renderDetailBody(item)}</div>
        </article>
    `;
    VIEW.innerHTML = head;

    const body = document.getElementById("app-detail-body");
    try {
        const html = await fetchAndRender(item);
        body.innerHTML = `<div id="nice">${html}</div>`;
        applyExternalLinks(body);
        applyInternalAnchors(body);
    } catch (err) {
        body.innerHTML = `<div class="app-empty">内容加载失败：${escapeHtml(err.message)}</div>`;
    }
}

function renderDetailBody(item) {
    if (item.type === "contributor" && item.body) {
        try {
            return `<div id="nice">${marked.parse(item.body)}</div>`;
        } catch {
            // fall through to fetch path
        }
    }
    return `<div class="app-loading">载入正文…</div>`;
}

async function fetchAndRender(item) {
    if (state.docCache.has(item.id)) return state.docCache.get(item.id);

    if (item.type === "contributor" && item.body) {
        const html = marked.parse(item.body);
        state.docCache.set(item.id, html);
        return html;
    }

    const url = item.url || encodePath(item.path);
    const res = await fetch(url, { cache: "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    const html = marked.parse(md);
    state.docCache.set(item.id, html);
    if (state.docCache.size > 12) {
        const firstKey = state.docCache.keys().next().value;
        state.docCache.delete(firstKey);
    }
    return html;
}

/* =====================================================================
 * Cards
 * ===================================================================== */
function cardReport(it) {
    return `
        <a class="app-card" href="#/d/${encodeURIComponent(it.id)}">
            <div class="app-card__meta">
                <span class="app-badge app-badge--report">周报</span>
                <span>#${it.issue ?? "—"}</span>
                <span>·</span>
                <span>${escapeHtml(it.date || "")}</span>
            </div>
            <h3 class="app-card__title">${escapeHtml(reportShortTitle(it))}</h3>
            <p class="app-card__excerpt">${escapeHtml(it.excerpt || "")}</p>
        </a>
    `;
}

function cardPost(it) {
    return `
        <a class="app-card" href="#/d/${encodeURIComponent(it.id)}">
            <div class="app-card__meta">
                <span class="app-badge app-badge--post">文章</span>
                ${it.date ? `<span>${escapeHtml(it.date)}</span>` : ""}
            </div>
            <h3 class="app-card__title">${escapeHtml(it.title)}</h3>
            <p class="app-card__excerpt">${escapeHtml(it.excerpt || "")}</p>
        </a>
    `;
}

function cardContributor(it) {
    const avatar = it.avatar || "assets/ios-weekly-avatar-new.png";
    return `
        <a class="app-contributor" href="#/d/${encodeURIComponent(it.id)}">
            <img class="app-contributor__avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
            <h3 class="app-contributor__name">${escapeHtml(it.title)}</h3>
            <p class="app-contributor__bio">${escapeHtml(it.excerpt || "")}</p>
        </a>
    `;
}

/* =====================================================================
 * Search
 * ===================================================================== */
function installSearchHandlers() {
    let activeIdx = -1;
    let lastResults = [];
    const debounced = debounce(runSearch, 120);

    SEARCH_INPUT.addEventListener("focus", () => {
        ensureSearchLoaded();
        if (SEARCH_INPUT.value.trim()) showPanel();
    });
    SEARCH_INPUT.addEventListener("input", () => {
        debounced(SEARCH_INPUT.value);
    });
    SEARCH_INPUT.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            SEARCH_INPUT.blur();
            hidePanel();
            return;
        }
        if (!lastResults.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIdx = (activeIdx + 1) % lastResults.length;
            updateActive();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIdx = (activeIdx - 1 + lastResults.length) % lastResults.length;
            updateActive();
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = lastResults[Math.max(0, activeIdx)];
            if (pick) {
                location.hash = `#/d/${encodeURIComponent(pick.id)}`;
                SEARCH_INPUT.value = "";
                hidePanel();
                SEARCH_INPUT.blur();
            }
        }
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".app-search")) hidePanel();
    });

    function updateActive() {
        SEARCH_PANEL.querySelectorAll(".app-search__result").forEach((el, i) => {
            el.classList.toggle("is-active", i === activeIdx);
            if (i === activeIdx) el.scrollIntoView({ block: "nearest" });
        });
    }

    async function runSearch(query) {
        const q = query.trim();
        if (!q) {
            lastResults = [];
            activeIdx = -1;
            hidePanel();
            return;
        }
        showPanel(`<div class="app-search__hint">搜索中…</div>`);
        const results = await search(q);
        lastResults = results;
        activeIdx = results.length ? 0 : -1;
        if (!results.length) {
            showPanel(`<div class="app-search__hint">没有匹配结果。</div>`);
            return;
        }
        showPanel(results.map((r, i) => renderResult(r, i === 0, q)).join(""));
    }

    function showPanel(content) {
        if (typeof content === "string") SEARCH_PANEL.innerHTML = content;
        SEARCH_PANEL.hidden = false;
        SEARCH_INPUT.setAttribute("aria-expanded", "true");
    }
    function hidePanel() {
        SEARCH_PANEL.hidden = true;
        SEARCH_INPUT.setAttribute("aria-expanded", "false");
    }
}

function renderResult(r, active, query) {
    const item = state.byId.get(r.id);
    if (!item) return "";
    const snippet = makeSnippet(item, query);
    return `
        <a class="app-search__result ${active ? "is-active" : ""}"
           href="#/d/${encodeURIComponent(r.id)}"
           role="option">
            <div class="app-search__result-head">
                <span class="app-badge app-badge--${item.type}">${typeLabel(item.type)}</span>
                <span>${escapeHtml(item.title)}</span>
                ${item.date ? `<span style="color:var(--c-text-muted);font-weight:400;font-size:12px">· ${escapeHtml(item.date)}</span>` : ""}
            </div>
            <div class="app-search__result-snippet">${snippet}</div>
        </a>
    `;
}

function makeSnippet(item, query) {
    const haystack = [item.excerpt || "", item.body || "", (item.sections || []).map((s) => `${s.heading || ""} ${s.summary || ""}`).join(" ")].join(" ");
    const tokens = query.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
    if (!haystack || !tokens.length) return escapeHtml((item.excerpt || "").slice(0, 120));
    const lower = haystack.toLowerCase();
    let pos = -1;
    for (const t of tokens) {
        const p = lower.indexOf(t);
        if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) return escapeHtml(haystack.slice(0, 120));
    const start = Math.max(0, pos - 30);
    const end = Math.min(haystack.length, pos + 100);
    let frag = haystack.slice(start, end);
    if (start > 0) frag = "…" + frag;
    if (end < haystack.length) frag += "…";
    let html = escapeHtml(frag);
    for (const t of tokens) {
        const re = new RegExp(escapeRegex(t), "gi");
        html = html.replace(re, (m) => `<mark>${m}</mark>`);
    }
    return html;
}

async function ensureSearchLoaded() {
    if (state.miniSearch) return state.miniSearch;
    if (state.searchLoading) return state.searchLoading;
    state.searchLoading = (async () => {
        const [{ default: MiniSearch }, raw] = await Promise.all([
            import("./vendor/minisearch.esm.js"),
            fetch("data/search.json", { cache: "default" }).then((r) => {
                if (!r.ok) throw new Error(`search.json HTTP ${r.status}`);
                return r.json();
            }),
        ]);
        state.miniSearch = MiniSearch.loadJS(raw, {
            idField: "id",
            fields: ["title", "sections", "body"],
            storeFields: ["id", "title", "type", "date"],
            tokenize: tokenizeCJK,
            searchOptions: {
                prefix: true,
                fuzzy: 0.15,
                boost: { title: 3, sections: 2 },
                combineWith: "AND",
            },
        });
        return state.miniSearch;
    })().catch((err) => {
        console.error("search load failed", err);
        state.searchLoading = null;
        throw err;
    });
    return state.searchLoading;
}

async function search(query) {
    try {
        const ms = await ensureSearchLoaded();
        return ms.search(query).slice(0, 30);
    } catch {
        return fallbackSearch(query);
    }
}

function fallbackSearch(query) {
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return state.index.items
        .map((it) => {
            const hay = `${it.title}\n${it.excerpt || ""}\n${(it.sections || []).map((s) => s.heading || "").join("\n")}`.toLowerCase();
            const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
            return { id: it.id, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
}

function installShortcuts() {
    document.addEventListener("keydown", (e) => {
        if (e.key === "/" && !isTypingTarget(e.target)) {
            e.preventDefault();
            SEARCH_INPUT.focus();
            SEARCH_INPUT.select();
        }
    });
}

/* =====================================================================
 * Helpers
 * ===================================================================== */
function reportShortTitle(it) {
    const t = it.title || "";
    return t.replace(/^老司机[^#]*#\d+\s*\|?\s*/, "").trim() || t;
}

function typeLabel(type) {
    return { report: "周报", post: "文章", contributor: "贡献者" }[type] || type;
}

function backHref(item) {
    return { report: "#/reports", post: "#/posts", contributor: "#/contributors" }[item.type] || "#/";
}

function encodePath(p) {
    return p.split("/").map((s) => encodeURIComponent(s)).join("/");
}

function applyExternalLinks(root) {
    root.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) {
            a.target = "_blank";
            a.rel = "noopener noreferrer";
        }
    });
}

function applyInternalAnchors(root) {
    /* Collapse first H1 in body since we already show the title in meta? Keep H1 for visual continuity. */
    root.querySelectorAll("img[src]").forEach((img) => {
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
    });
}

function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

function isTypingTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
