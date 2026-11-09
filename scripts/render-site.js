import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TEMPLATE = new URL("../docs/index.html", import.meta.url);
const REPO = "https://github.com/SwiftOldDriver/iOS-Weekly";
const RSS = REPO + "/releases.atom";
const SITE_NAME = "老司机 iOS 周报";
const SITE_DESCRIPTION = "为 iOS 开发者精选的技术文章、资讯和工具。阅读本期周报、浏览往期归档或全文搜索。";
const DEFAULT_COVER = "assets/ios-weekly-avatar-new.png";
const NAV = [
    { href: "reports/", label: "往期" },
    { href: "posts/", label: "文章" },
    { href: "contributors/", label: "贡献者" },
];

export async function renderSite({ outDir, items, stats, rendered, baseUrl }) {
    const template = await readFile(TEMPLATE, "utf8");
    const reports = items.filter(({ type }) => type === "report").sort((a, b) => b.issue - a.issue);
    const posts = items.filter(({ type }) => type === "post");
    const contributors = items.filter(({ type }) => type === "contributor");
    const reportNeighbors = new Map(reports.map((item, i) => [item.id, {
        older: reports[i + 1],
        newer: reports[i - 1],
    }]));

    async function page(href, options) {
        const parts = href.split("/").filter(Boolean);
        const root = "../".repeat(parts.length) || "./";
        const dir = path.join(outDir, ...parts.map(decodeURIComponent));
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "index.html"), layout({ template, href, root, baseUrl, ...options }));
    }

    await page("", { page: "home", content: home({ reports, posts, contributors, stats }) });
    await page("reports/", {
        page: "archive", title: "往期周报", description: "按年份浏览老司机 iOS 周报的全部往期。",
        content: reportArchive(reports),
    });
    await page("posts/", {
        page: "posts", title: "精品文章", description: "老司机 iOS 周报编辑团队的精品技术文章。",
        content: postArchive(posts),
    });
    await page("contributors/", {
        page: "contributors", title: "贡献者", description: "认识老司机 iOS 周报的编辑和贡献者。",
        content: contributorArchive(contributors),
    });
    await page("search/", { page: "search", title: "搜索", content: searchPage(), noIndex: true });
    for (const item of items) {
        const article = rendered.get(item.id);
        if (!article) throw new Error("Missing rendered article: " + item.id);
        await page(item.href, {
            page: "detail",
            title: item.type === "report" ? issueLabel(item) : item.title,
            description: item.excerpt || undefined,
            cover: article.cover,
            content: detailPage(item, article, reportNeighbors.get(item.id)),
        });
    }
}

function layout({ template, href, root, baseUrl, page, title, description = SITE_DESCRIPTION, cover, content, noIndex }) {
    const canonical = new URL(href, baseUrl).href;
    const siteTitle = title ? title + " · " + SITE_NAME : SITE_NAME;
    const descriptionText = escapeHtml(description);
    const titleText = escapeHtml(siteTitle);
    const image = escapeHtml(new URL(cover?.href || DEFAULT_COVER, baseUrl).href);
    const pageMeta = noIndex
        ? '<meta name="robots" content="noindex" />'
        : `<link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:type" content="${page === "detail" ? "article" : "website"}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${titleText}" />
    <meta property="og:description" content="${descriptionText}" />
    <meta property="og:image" content="${image}" />${cover?.width && cover?.height ? `
    <meta property="og:image:width" content="${escapeHtml(cover.width)}" />
    <meta property="og:image:height" content="${escapeHtml(cover.height)}" />` : ""}
    <meta name="twitter:card" content="${cover ? "summary_large_image" : "summary"}" />`;
    const values = {
        ARTICLE_CSS: page === "detail" ? `<link rel="stylesheet" href="${root}assets/page.css" />` : "",
        CONTENT: content,
        DESCRIPTION: descriptionText,
        NAVIGATION: NAV.map((link) => {
            const current = link.href === href ? ' aria-current="page"' : "";
            return `<a href="${root}${link.href}"${current}>${link.label}</a>`;
        }).join("\n                "),
        NAVIGATION_SCRIPT: page === "home" || page === "archive"
            ? `<script type="module" src="${root}navigation.js"></script>` : "",
        PAGE: page,
        PAGE_META: pageMeta,
        ROOT: root,
        TITLE: titleText,
    };
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key]);
}

function home({ reports, posts, contributors, stats }) {
    const [latest, ...recent] = reports;
    return `<section class="app-hero" aria-labelledby="home-title">
        <div>
            <p class="app-hero__eyebrow">为 iOS 开发者精选</p>
            <h1 id="home-title">${SITE_NAME}</h1>
            <p class="app-hero__sub">每期精选值得读的技术文章、资讯和工具。</p>
        </div>
        ${latest ? `<div class="app-hero__issue">
            <div class="app-card__meta"><span class="app-badge app-badge--report">最新周报</span>${dateTag(latest.date)}</div>
            <h2 class="app-hero__issue-title"><a href="${escapeHtml(latest.href)}">${issueLabel(latest)}</a></h2>
            ${topics(latest, 3)}
            <div class="app-feature__actions">
                <a class="app-btn app-btn--primary" href="${escapeHtml(latest.href)}">阅读本期 →</a>
                <a class="app-btn" href="reports/">浏览往期</a>
            </div>
        </div>` : ""}
    </section>
    ${recent.length ? `<section class="app-section" aria-labelledby="recent-reports">
        <div class="app-section__head">
            <h2 class="app-section__title" id="recent-reports">最近周报</h2>
            <a class="app-section__more" href="reports/">全部 ${stats.reports} 期 →</a>
        </div>
        <div class="app-grid">${recent.slice(0, 6).map((item) => reportCard(item, "")).join("")}</div>
    </section>` : ""}
    <section class="app-section" aria-labelledby="wwdc">
        <div class="app-section__head"><h2 class="app-section__title" id="wwdc">WWDC 内参</h2></div>
        <div class="app-feature">
            <p class="app-feature__lede">「老司机技术」团队撰写的 WWDC 视频解读，经过技术和读者视角的双重审核。</p>
            <div class="app-feature__actions">
                <a class="app-btn app-btn--primary" href="https://swiftolddriver.github.io/WWDC-InternalReference/">在线阅读 →</a>
                <a class="app-btn" href="https://github.com/SwiftOldDriver/WWDC-InternalReference">开源仓库 ↗</a>
            </div>
        </div>
    </section>
    ${posts.length ? `<section class="app-section" aria-labelledby="featured-posts">
        <div class="app-section__head">
            <h2 class="app-section__title" id="featured-posts">精品文章</h2>
            <a class="app-section__more" href="posts/">全部文章 →</a>
        </div>
        <div class="app-grid">${posts.map((item) => postCard(item, "")).join("")}</div>
    </section>` : ""}
    ${contributors.length ? `<section class="app-section" aria-labelledby="featured-contributors">
        <div class="app-section__head">
            <h2 class="app-section__title" id="featured-contributors">认识贡献者</h2>
            <a class="app-section__more" href="contributors/">全部贡献者 →</a>
        </div>
        <div class="app-contributors">${contributors.slice(0, 4).map((item) => contributorCard(item, "")).join("")}</div>
    </section>` : ""}`;
}

function reportArchive(reports) {
    const years = new Map();
    for (const item of reports) {
        const year = item.year || "other";
        if (!years.has(year)) years.set(year, []);
        years.get(year).push(item);
    }
    const groups = [...years.entries()];
    return `<section class="app-section" id="app-archive">
        <h1 class="app-page-title">往期周报</h1>
        <p class="app-page-description">按年份浏览全部 ${reports.length} 期周报。<a href="${RSS}">RSS 订阅</a></p>
        ${groups.length ? `<nav class="app-year-nav" aria-label="按年份跳转">
            ${groups.map(([year]) => `<a href="#year-${year}">${year === "other" ? "其他" : year}</a>`).join("")}
        </nav>` : ""}
        ${groups.map(([year, issues], i) => `<details class="app-year" id="year-${year}"${i === 0 ? " open" : ""}>
            <summary class="app-year__head">${year === "other" ? "其他" : year} <span class="app-year__count">${issues.length} 期</span></summary>
            <ul class="app-year__body">${issues.map((item) => `<li>
                <a class="app-row" href="../${escapeHtml(item.href)}">
                    <div class="app-row__meta"><strong>${issueLabel(item)}</strong>${dateTag(item.date)}</div>
                    ${topics(item, 2)}
                </a>
            </li>`).join("")}</ul>
        </details>`).join("")}
    </section>`;
}

function postArchive(posts) {
    return `<section class="app-section">
        <h1 class="app-page-title">精品文章</h1>
        <p class="app-page-description">周报团队撰写与整理的 ${posts.length} 篇文章。</p>
        <div class="app-grid">${posts.map((item) => postCard(item, "../", "h2")).join("")}</div>
    </section>`;
}

function contributorArchive(contributors) {
    return `<section class="app-section">
        <h1 class="app-page-title">贡献者</h1>
        <p class="app-page-description">感谢 ${contributors.length} 位贡献者为周报提供的内容与支持。</p>
        <div class="app-contributors">${contributors.map((item) => contributorCard(item, "../", "h2")).join("")}</div>
    </section>`;
}

function reportCard(item, root) {
    return `<a class="app-card" href="${root}${escapeHtml(item.href)}">
        <div class="app-card__meta"><span class="app-badge app-badge--report">周报</span>${dateTag(item.date)}</div>
        <h3 class="app-card__title">${issueLabel(item)}</h3>
        ${topics(item, 2)}
    </a>`;
}

function postCard(item, root, heading = "h3") {
    return `<a class="app-card" href="${root}${escapeHtml(item.href)}">
        <div class="app-card__meta"><span class="app-badge app-badge--post">文章</span>${dateTag(item.date)}</div>
        <${heading} class="app-card__title">${escapeHtml(item.title)}</${heading}>
        ${item.excerpt ? `<p class="app-card__excerpt">${escapeHtml(item.excerpt)}</p>` : ""}
    </a>`;
}

function contributorCard(item, root, heading = "h3") {
    const local = item.avatar?.startsWith("assets/");
    const avatar = local ? root + item.avatar : /^https:\/\//i.test(item.avatar || "") ? item.avatar : root + DEFAULT_COVER;
    return `<a class="app-contributor" href="${root}${escapeHtml(item.href)}">
        <img class="app-contributor__avatar" src="${escapeHtml(avatar)}" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        <${heading} class="app-contributor__name">${escapeHtml(item.title)}</${heading}>
        ${item.excerpt ? `<p class="app-contributor__bio">${escapeHtml(item.excerpt)}</p>` : ""}
    </a>`;
}

function detailPage(item, article, neighbors) {
    const root = "../".repeat(item.href.split("/").filter(Boolean).length);
    const type = { report: ["周报", "往期周报", "reports/"], post: ["文章", "精品文章", "posts/"], contributor: ["贡献者", "贡献者列表", "contributors/"] }[item.type];
    const report = item.type === "report";
    const back = root + type[2] + (report ? `?resume=1#year-${item.year || "other"}` : "");
    const title = report ? `${SITE_NAME} · ${issueLabel(item)}` : escapeHtml(item.title);
    const source = item.path?.split("/").map(encodeURIComponent).join("/");
    return `<article class="app-detail">
        <header class="app-detail__header">
            <a class="app-detail__back" href="${escapeHtml(back)}">返回${type[1]}</a>
            <h1 class="app-page-title">${title}</h1>
            <div class="app-detail__meta">
                <span class="app-badge app-badge--${item.type}">${type[0]}</span>
                ${dateTag(item.date)}
                ${source ? `<a href="${REPO}/blob/master/${source}">在 GitHub 查看源文件 ↗</a>` : ""}
            </div>
        </header>
        ${tableOfContents(article.toc, report)}
        <div id="nice">${article.html}</div>
        ${neighbors ? issueNavigation(neighbors, root) : ""}
    </article>`;
}

function tableOfContents(headings, report) {
    if (!headings?.length) return "";
    const topLevel = Math.min(...headings.map(({ level }) => level));
    const sections = headings.filter(({ level }) => report ? level === topLevel : level <= topLevel + 1);
    if (sections.length < 2) return "";
    return `<details class="app-toc">
        <summary>${report ? "本期目录" : "文章目录"}</summary>
        <nav aria-label="文章目录">
            <ul>${sections.map(({ id, label }) => `<li><a href="#${encodeURIComponent(id)}">${escapeHtml(label)}</a></li>`).join("")}</ul>
        </nav>
    </details>`;
}

function issueNavigation({ older, newer }, root) {
    if (!older && !newer) return "";
    return `<nav class="app-issue-nav" aria-label="相邻周报">
        ${older ? `<a href="${root}${escapeHtml(older.href)}"><span>← 上一期</span> <strong>${issueLabel(older)}</strong></a>` : ""}
        ${newer ? `<a href="${root}${escapeHtml(newer.href)}"><span>下一期 →</span> <strong>${issueLabel(newer)}</strong></a>` : ""}
    </nav>`;
}

function searchPage() {
    return `<section class="app-section app-search-page">
        <h1 class="app-page-title">搜索周报</h1>
        <p id="app-search-results-status" class="app-page-description" role="status">在上方输入关键词，搜索周报正文、文章或贡献者。</p>
        <ol id="app-search-results" class="app-search-page__results"></ol>
        <noscript><p>全文搜索需要 JavaScript。你也可以<a href="../reports/">浏览往期周报</a>。</p></noscript>
    </section>`;
}

function topics(item, limit) {
    const labels = [...new Set((item.sections || []).map(({ heading }) => heading?.trim()).filter(Boolean))].slice(0, limit);
    return labels.length
        ? `<ul class="app-topics">${labels.map((label) => `<li><span>${escapeHtml(label)}</span></li>`).join("")}</ul>`
        : "";
}

function issueLabel(item) {
    return `第 ${escapeHtml(item.issue)} 期`;
}

function dateTag(date) {
    if (!date) return "";
    const escaped = escapeHtml(date);
    return `<time datetime="${escaped}">${escaped}</time>`;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
}
