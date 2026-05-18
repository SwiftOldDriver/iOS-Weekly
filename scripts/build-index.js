#!/usr/bin/env node
/**
 * Build metadata + full-text search index for the iOS-Weekly GitHub Pages site.
 *
 * Inputs (relative to repo root):
 *   Reports/<year>/#<issue>(-YYYY.MM.DD).md
 *   Posts/*.md
 *   Contributors/README.md   (one ### section per contributor)
 *
 * Outputs:
 *   docs/data/index.json   metadata for navigation, cards, summaries
 *   docs/data/search.json  serialized MiniSearch full-text index
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import { marked } from "marked";
import MiniSearch from "minisearch";
import { tokenizeCJK } from "../docs/vendor/tokenize.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "data");

const REPORTS_DIR = path.join(REPO_ROOT, "Reports");
const POSTS_DIR = path.join(REPO_ROOT, "Posts");
const CONTRIBUTORS_FILE = path.join(REPO_ROOT, "Contributors", "README.md");

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

async function main() {
    await fsp.mkdir(OUT_DIR, { recursive: true });

    const items = [];

    items.push(...(await collectReports()));
    items.push(...(await collectPosts()));
    items.push(...(await collectContributors()));

    items.sort((a, b) => itemSortKey(b).localeCompare(itemSortKey(a)));

    const stats = {
        reports: items.filter((i) => i.type === "report").length,
        posts: items.filter((i) => i.type === "post").length,
        contributors: items.filter((i) => i.type === "contributor").length,
        builtAt: new Date().toISOString(),
    };

    const meta = items.map(slimMetaItem);
    const indexJson = { stats, items: meta };

    const ms = new MiniSearch({
        idField: "id",
        fields: ["title", "sections", "body"],
        storeFields: ["id", "title", "type", "date"],
        tokenize: (str) => tokenizeCJK(str),
        searchOptions: {
            prefix: true,
            fuzzy: 0.15,
            boost: { title: 3, sections: 2 },
            combineWith: "AND",
        },
    });

    ms.addAll(
        items.map((it) => ({
            id: it.id,
            title: it.title,
            type: it.type,
            date: it.date || "",
            sections: (it.sections || [])
                .map((s) => `${s.heading || ""} ${s.recommender || ""} ${s.summary || ""}`)
                .join("\n"),
            body: it.body || it.excerpt || "",
        })),
    );

    await fsp.writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(indexJson));
    await fsp.writeFile(path.join(OUT_DIR, "search.json"), JSON.stringify(ms));

    console.log(
        `[build-index] wrote ${meta.length} items ` +
            `(reports=${stats.reports}, posts=${stats.posts}, contributors=${stats.contributors}) ` +
            `→ ${path.relative(REPO_ROOT, OUT_DIR)}`,
    );
}

/* =========================================================================
 * Reports
 * ========================================================================= */
async function collectReports() {
    const items = [];
    const years = (await fsp.readdir(REPORTS_DIR, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    for (const year of years) {
        const dir = path.join(REPORTS_DIR, year);
        const files = (await fsp.readdir(dir)).filter((f) => f.endsWith(".md"));
        for (const file of files) {
            const abs = path.join(dir, file);
            const md = await fsp.readFile(abs, "utf8");
            items.push(parseReport({ year: Number(year), file, md, relPath: path.posix.join("Reports", year, file) }));
        }
    }
    return items;
}

function parseReport({ year, file, md, relPath }) {
    const m = file.match(/^#(\d+)(?:-(\d{4})\.(\d{2})\.(\d{2}))?\.md$/);
    const issue = m ? Number(m[1]) : null;
    const date = m && m[2] ? `${m[2]}-${m[3]}-${m[4]}` : extractDateFromTitle(md);

    const titleLine = (md.match(/^#\s+(.+)$/m) || [])[1] || `老司机 iOS 周报 #${issue ?? "?"}`;
    const title = titleLine.trim();

    const sections = extractReportSections(md);
    const body = mdToPlainText(md);
    const excerpt = makeExcerpt(sections, body);

    return {
        id: `r-${(issue ?? "x").toString().padStart(3, "0")}-${date || year}`,
        type: "report",
        title,
        issue,
        date,
        year,
        path: relPath,
        url: encodePosixPath(relPath),
        sections,
        excerpt,
        body,
    };
}

function extractReportSections(md) {
    const out = [];
    const lines = md.split(/\r?\n/);
    let h2 = "";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const h2m = line.match(/^##\s+(.+)$/);
        if (h2m) {
            h2 = h2m[1].trim();
            continue;
        }
        const h3m = line.match(/^###\s+(.+)$/);
        if (h3m) {
            const headingRaw = h3m[1].trim();
            const link = headingRaw.match(/\[([^\]]+)\]\(([^)]+)\)/);
            const heading = (link ? link[1] : headingRaw)
                .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s🌟🚧]+/u, "")
                .trim();
            const url = link ? link[2] : null;

            // Look ahead for first non-empty paragraph (recommender + summary).
            let para = "";
            for (let j = i + 1; j < lines.length && j < i + 25; j++) {
                const l = lines[j];
                if (/^#{1,6}\s/.test(l)) break;
                if (!l.trim()) {
                    if (para) break;
                    continue;
                }
                para += (para ? " " : "") + l.trim();
            }
            let recommender = "";
            let summary = para;
            const linkRecM = para.match(/^\[@?([^\]]+)\]\([^)]+\)\s*[:：]\s*([\s\S]+)$/);
            if (linkRecM) {
                recommender = linkRecM[1].trim();
                summary = linkRecM[2];
            } else {
                const plainM = para.match(/^@?([^\s:：]{1,40})\s*[:：]\s*([\s\S]+)$/);
                if (plainM) {
                    recommender = plainM[1].trim();
                    summary = plainM[2];
                }
            }

            out.push({
                section: h2,
                heading,
                url,
                recommender,
                summary: stripMd(summary).slice(0, 140),
            });
        }
    }
    return out;
}

/* =========================================================================
 * Posts
 * ========================================================================= */
async function collectPosts() {
    const out = [];
    const files = (await fsp.readdir(POSTS_DIR)).filter((f) => f.endsWith(".md")).sort();
    const stats = await Promise.all(files.map((f) => fsp.stat(path.join(POSTS_DIR, f))));
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const md = await fsp.readFile(path.join(POSTS_DIR, file), "utf8");
        const relPath = path.posix.join("Posts", file);
        const titleLine = (md.match(/^#{1,2}\s+(.+)$/m) || [])[1] || file.replace(/\.md$/, "");
        const title = stripMd(titleLine).trim() || file.replace(/\.md$/, "");
        const date = stats[i].mtime.toISOString().slice(0, 10);
        const body = mdToPlainText(md);
        const excerpt = body.slice(0, 200).trim();
        out.push({
            id: "p-" + slugify(file.replace(/\.md$/, "")),
            type: "post",
            title,
            date,
            path: relPath,
            url: encodePosixPath(relPath),
            excerpt,
            body,
            sections: [],
        });
    }
    return out;
}

/* =========================================================================
 * Contributors
 * ========================================================================= */
async function collectContributors() {
    const md = await fsp.readFile(CONTRIBUTORS_FILE, "utf8");
    const out = [];
    const sections = md.split(/^### /m).slice(1); // drop preamble
    for (const sec of sections) {
        const lines = sec.split(/\r?\n/);
        const headerLine = lines.shift().trim();
        const rest = lines.join("\n").trim();

        const name = headerLine.split("/")[0].trim();
        const aka = (headerLine.split("/")[1] || "").trim();

        const avatarMatch = rest.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
        const avatar = avatarMatch ? avatarMatch[1] : null;

        const bio = rest
            .replace(/<img[^>]*>/gi, "")
            .replace(/<\/?[^>]+>/g, "")
            .trim();

        const body = `### ${headerLine}\n\n${rest}`;
        const id = "c-" + slugify(aka || name || `contributor-${out.length + 1}`);

        out.push({
            id,
            type: "contributor",
            title: headerLine || name,
            date: "",
            avatar,
            path: "Contributors/README.md",
            url: encodePosixPath("Contributors/README.md"),
            sections: [],
            excerpt: bio.replace(/\s+/g, " ").slice(0, 200),
            body,
        });
    }
    return out;
}

/* =========================================================================
 * Helpers
 * ========================================================================= */
function itemSortKey(it) {
    if (it.type === "report") return `0-${(it.issue ?? 0).toString().padStart(6, "0")}`;
    if (it.type === "post") return `1-${it.date || ""}-${it.title}`;
    return `2-${it.title}`;
}

function slimMetaItem(it) {
    const { body, sections, ...rest } = it;
    if (sections && sections.length) {
        rest.sections = sections.map((s) => ({
            heading: s.heading,
            url: s.url,
            recommender: s.recommender || undefined,
        }));
    }
    // contributor entries: keep body inline so the detail page renders
    // only that person's section instead of fetching the entire README.
    if (it.type === "contributor" && body) rest.body = body;
    return rest;
}

function makeExcerpt(sections, body) {
    if (sections && sections.length) {
        const lines = sections
            .slice(0, 3)
            .map((s) => `${s.heading}${s.summary ? "：" + s.summary : ""}`);
        return lines.join("；").slice(0, 220);
    }
    return body.slice(0, 220);
}

function extractDateFromTitle(md) {
    const m = md.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function mdToPlainText(md) {
    let text = md;
    text = text.replace(/```[\s\S]*?```/g, " ");
    text = text.replace(/`[^`]*`/g, " ");
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/^[#>*\-+]+\s*/gm, "");
    text = text.replace(/\*+([^*]+)\*+/g, "$1");
    text = text.replace(/_+([^_]+)_+/g, "$1");
    text = text.replace(/[\r\n]+/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    return text;
}

function stripMd(s) {
    return mdToPlainText(s);
}

function encodePosixPath(p) {
    return p.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

function slugify(s) {
    return String(s)
        .toLowerCase()
        .replace(/[\s/\\#?&_]+/g, "-")
        .replace(/[^\p{Letter}\p{Number}\-.]+/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "x";
}

// Marked options for parity with runtime SPA (not directly used here but kept
// so any future direct rendering produces the same output).
marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
