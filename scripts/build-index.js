#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { parseFragment } from "parse5";
import { buildSearch } from "./build-search.js";
import { renderMarkdown } from "./render-markdown.js";
import { renderSite } from "./render-site.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT_DIR = path.join(ROOT, "_site");
const BASE_URL = "https://swiftolddriver.github.io/iOS-Weekly/";
const TYPES = ["report", "post", "contributor"];
const POST_TITLES = {
    "老司机技术周报.md": "关于老司机技术周报",
    "老司机技术周报精品.md": "老司机技术周报精品内容汇总",
};

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});

async function main() {
    const { reports, drafts } = await collectReports();
    const items = [...reports, ...await collectPosts(), ...await collectContributors()];
    const stats = Object.fromEntries(TYPES.map((type) => [
        `${type}s`, items.filter((item) => item.type === type).length,
    ]));
    const legacy = Object.create(null);
    const canonicalHrefs = new Map();
    const hrefs = new Set();
    for (const item of items) {
        if (legacy[item.id] || hrefs.has(item.href)) throw new Error(`Duplicate site route: ${item.id} (${item.href})`);
        legacy[item.id] = item.href;
        hrefs.add(item.href);
        if (item.type !== "contributor") canonicalHrefs.set(item.path, item.href);
    }

    await assembleAssets(drafts);
    const rendered = new Map();
    for (let offset = 0; offset < items.length; offset += 4) {
        await Promise.all(items.slice(offset, offset + 4).map(async (item) => {
            const result = await renderMarkdown({ item, markdown: item.markdown, outDir: OUT_DIR, canonicalHrefs });
            rendered.set(item.id, result);
            item.body = plainHTML(result.html);
            if (!item.excerpt) item.excerpt = item.body.slice(0, 200).trim();
        }));
    }

    const dataDir = path.join(OUT_DIR, "data");
    await fsp.mkdir(dataDir, { recursive: true });
    await Promise.all([
        renderSite({ outDir: OUT_DIR, items, stats, rendered, baseUrl: BASE_URL }),
        buildSearch({ outDir: OUT_DIR, items }),
        fsp.writeFile(path.join(dataDir, "legacy.json"), JSON.stringify(legacy)),
        writeSitemap(items),
        fsp.writeFile(path.join(OUT_DIR, ".nojekyll"), ""),
    ]);
    console.log(`[build] ${stats.reports} reports, ${stats.posts} posts, ${stats.contributors} contributors → _site`);
    if (drafts.size) console.log(`[build] excluded drafts: ${[...drafts].map((issue) => `#${issue}`).join(", ")}`);
}

async function assembleAssets(drafts) {
    await fsp.rm(OUT_DIR, { recursive: true, force: true });
    await fsp.mkdir(OUT_DIR, { recursive: true });
    const assetsDir = path.join(ROOT, "assets");
    await fsp.cp(assetsDir, path.join(OUT_DIR, "assets"), {
        recursive: true,
        filter(src) {
            if (path.basename(src) === ".DS_Store") return false;
            const cover = path.relative(assetsDir, src).match(/^weekly-header[/\\](\d+)\.[^.]+$/);
            return !cover || !drafts.has(Number(cover[1]));
        },
    });
    const docsDir = path.join(ROOT, "docs");
    await fsp.cp(docsDir, OUT_DIR, {
        recursive: true,
        filter(src) {
            const rel = path.relative(docsDir, src);
            return !["index.html", "data"].includes(rel) && path.basename(src) !== ".DS_Store";
        },
    });
}

async function collectReports() {
    const reports = [];
    const drafts = new Set();
    const years = await fsp.readdir(path.join(ROOT, "Reports"), { withFileTypes: true });
    for (const { name: year } of years.filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))) {
        const dir = path.join(ROOT, "Reports", year);
        for (const file of await fsp.readdir(dir)) {
            if (!file.endsWith(".md")) continue;
            const m = file.match(/^#(\d+)(?:-(\d{4})\.(\d{2})\.(\d{2}))?\.md$/);
            if (!m) throw new Error(`Unexpected report filename: Reports/${year}/${file}`);
            const issue = Number(m[1]);
            const relPath = path.posix.join("Reports", year, file);
            const markdown = await fsp.readFile(path.join(dir, file), "utf8");
            if (markdown.split(/\r?\n/, 8).some((line) => line.trim() === "<!-- site: draft -->")) {
                drafts.add(issue);
                continue;
            }

            const heading = (markdown.match(/^#\s+(.+)$/m) || [])[1] || `老司机 iOS 周报 #${issue}`;
            // Keep date derivation compatible with the original IDs in old hash links.
            const dateMatch = markdown.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
            const date = m[2] ? `${m[2]}-${m[3]}-${m[4]}` : dateMatch?.slice(1).join("-") || "";
            const sections = extractReportSections(markdown);
            reports.push({
                id: `r-${String(issue).padStart(3, "0")}-${date || year}`,
                href: `reports/${issue}/`,
                type: "report",
                title: plainInline(heading),
                date,
                issue,
                year: Number(year),
                path: relPath,
                markdown,
                sections,
                excerpt: sections.slice(0, 3).map((section) => section.heading).join(" · "),
            });
        }
    }
    reports.sort((a, b) => b.issue - a.issue);
    return { reports, drafts };
}

function extractReportSections(markdown) {
    const sections = [];
    let group = "";
    for (const token of marked.lexer(markdown)) {
        if (token.type !== "heading") continue;
        if (token.depth === 2) group = plainInline(token.text);
        if (token.depth !== 3) continue;
        const heading = plainInline(token.text).replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "").trim();
        if (heading) sections.push({ section: group, heading });
    }
    return sections;
}

async function collectPosts() {
    const dir = path.join(ROOT, "Posts");
    const items = [];
    for (const file of (await fsp.readdir(dir)).filter((name) => name.endsWith(".md")).sort()) {
        const markdown = await fsp.readFile(path.join(dir, file), "utf8");
        const stem = file.slice(0, -3);
        const slug = slugify(stem);
        const heading = (markdown.match(/^#{1,2}\s+(.+)$/m) || [])[1] || stem;
        items.push({
            id: `p-${slug}`,
            href: `posts/${encodeURIComponent(slug)}/`,
            type: "post",
            title: POST_TITLES[file] || plainInline(heading) || stem,
            // These posts do not provide reliable publication dates in their source.
            date: "",
            path: path.posix.join("Posts", file),
            markdown,
        });
    }
    return items;
}

async function collectContributors() {
    const sourcePath = "Contributors/README.md";
    const markdown = await fsp.readFile(path.join(ROOT, sourcePath), "utf8");
    return markdown.split(/^### /m).slice(1).map((section, index) => {
        const [heading, ...lines] = section.split(/\r?\n/);
        const [name, aka] = heading.trim().split("/").map((s) => s.trim());
        const slug = slugify(aka || name || `contributor-${index + 1}`);
        const body = lines.join("\n").trim();
        const avatar = body.match(/<img[^>]+src=['"]([^'"]+)['"]/i)?.[1];
        return {
            id: `c-${slug}`,
            href: `contributors/${encodeURIComponent(slug)}/`,
            type: "contributor",
            title: heading.trim(),
            date: "",
            avatar: /^https:\/\//i.test(avatar || "") ? avatar : undefined,
            path: sourcePath,
            markdown: `### ${heading.trim()}\n\n${body}`,
        };
    });
}

function plainInline(markdown) {
    return plainHTML(marked.parseInline(markdown));
}

function plainHTML(html) {
    const blocks = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "pre", "tr", "td", "th", "blockquote"]);
    function text(node) {
        if (node.nodeName === "#text") return node.value;
        if (["script", "style"].includes(node.tagName)) return "";
        const value = (node.childNodes || []).map(text).join("");
        return blocks.has(node.tagName) ? ` ${value} ` : value;
    }
    return text(parseFragment(html)).replace(/\s+/g, " ").trim();
}

function slugify(text) {
    return String(text)
        .toLowerCase()
        .replace(/[\s/\\#?&_]+/g, "-")
        .replace(/[^\p{Letter}\p{Number}\-.]+/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "x";
}

async function writeSitemap(items) {
    const paths = ["", "reports/", "posts/", "contributors/", ...items.map((item) => item.href)];
    const urls = paths.map((href) => `  <url><loc>${new URL(href, BASE_URL).href}</loc></url>`).join("\n");
    await fsp.writeFile(path.join(OUT_DIR, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
