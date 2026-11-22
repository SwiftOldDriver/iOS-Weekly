import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "parse5";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = path.join(ROOT, "_site");
const BASE = new URL("https://preview.test/iOS-Weekly/");
const CANONICAL = "https://swiftolddriver.github.io/iOS-Weekly/";

function* elements(node) {
    if (node.tagName) yield node;
    for (const child of node.childNodes || []) yield* elements(child);
}

function attr(element, name) {
    return element.attrs.find((a) => a.name === name)?.value;
}

async function* files(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* files(file);
        else yield file;
    }
}

function publicPath(file) {
    return path.relative(OUT, file).split(path.sep).map(encodeURIComponent).join("/").replace(/(?:^|\/)index\.html$/, (name) => name.startsWith("/") ? "/" : "");
}

test("generated Pages routes, static assets, and anchors resolve under the project prefix", async () => {
    const byPath = new Map();
    const checkedFiles = new Set();
    for await (const file of files(OUT)) {
        const relative = path.relative(OUT, file);
        checkedFiles.add(relative);
        if (!file.endsWith(".html")) continue;
        const nodes = [...elements(parse(await fsp.readFile(file, "utf8")))];
        const ids = nodes.map((node) => attr(node, "id")).filter(Boolean);
        assert.equal(new Set(ids).size, ids.length, `Duplicate IDs in ${relative}`);
        const article = nodes.find((node) => attr(node, "id") === "nice");
        if (article) for (const node of elements(article)) {
            assert.ok(!["script", "iframe", "object", "embed"].includes(node.tagName), `Unexpected ${node.tagName} in ${relative}`);
            assert.ok(!node.attrs.some(({ name, value }) => /^on/i.test(name) ||
                (["href", "src"].includes(name) && /^javascript:/i.test(value))), `Unsafe article markup in ${relative}`);
        }
        byPath.set(relative, { ids: new Set(ids), nodes });
    }

    const errors = [];
    for (const [relative, { nodes }] of byPath) {
        const current = new URL(publicPath(path.join(OUT, relative)), BASE);
        for (const node of nodes) {
            const refs = ["href", "src", "action"].map((key) => attr(node, key)).filter(Boolean);
            refs.push(...(attr(node, "srcset") || "").split(",").map((value) => value.trim().split(/\s+/)[0]).filter(Boolean));
            for (const ref of refs) {
                const resolved = new URL(ref.startsWith(CANONICAL) ? ref.slice(CANONICAL.length) : ref, ref.startsWith(CANONICAL) ? BASE : current);
                if (resolved.origin !== BASE.origin) continue;
                if (!resolved.pathname.startsWith(BASE.pathname)) {
                    errors.push(`${relative}: ${ref} leaves the project prefix`);
                    continue;
                }
                const target = decodeURIComponent(resolved.pathname.slice(BASE.pathname.length));
                const file = target.endsWith("/") || !target ? `${target}index.html` : target;
                if (!checkedFiles.has(file)) {
                    errors.push(`${relative}: missing ${ref}`);
                } else if (resolved.hash && byPath.has(file) && !byPath.get(file).ids.has(decodeURIComponent(resolved.hash.slice(1)))) {
                    errors.push(`${relative}: missing anchor ${ref}`);
                }
            }
        }
    }
    assert.deepEqual(errors, []);
});

test("published reports have static, canonical detail pages and old links map to them", async () => {
    const legacy = JSON.parse(await fsp.readFile(path.join(OUT, "data/legacy.json"), "utf8"));
    const sitemap = await fsp.readFile(path.join(OUT, "sitemap.xml"), "utf8");
    for (const name of ["search-preview.json", "search-corpus.json"]) {
        const index = JSON.parse(await fsp.readFile(path.join(OUT, "data", name), "utf8"));
        assert.deepEqual(Object.fromEntries(index.map(({ id, href }) => [id, href])), legacy, `${name} disagrees with public routes`);
    }
    const issues = [];
    for await (const filename of files(path.join(ROOT, "Reports"))) {
        const issue = Number(path.basename(filename).match(/^#(\d+)/)?.[1]);
        if (!issue || !filename.endsWith(".md")) continue;
        const markdown = await fsp.readFile(filename, "utf8");
        const draft = markdown.split(/\r?\n/, 8).some((line) => line.trim() === "<!-- site: draft -->");
        const href = `reports/${issue}/`;
        const htmlPath = path.join(OUT, href, "index.html");
        const idPrefix = `r-${String(issue).padStart(3, "0")}-`;
        const oldId = Object.keys(legacy).find((key) => key.startsWith(idPrefix));
        if (draft) {
            assert.equal(oldId, undefined, `Draft #${issue} has a legacy route`);
            assert.ok(!sitemap.includes(CANONICAL + href), `Draft #${issue} is in sitemap`);
            await assert.rejects(fsp.access(htmlPath), { code: "ENOENT" });
            continue;
        }

        assert.ok(oldId, `Missing legacy link for #${issue}`);
        assert.equal(legacy[oldId], href);
        assert.ok(sitemap.includes(CANONICAL + href));
        const nodes = [...elements(parse(await fsp.readFile(htmlPath, "utf8")))];
        assert.equal(nodes.filter((node) => node.tagName === "h1").length, 1, `#${issue} should have one title`);
        assert.ok(nodes.some((node) => node.tagName === "article"), `#${issue} has no static article`);
        assert.ok(nodes.some((node) => node.tagName === "link" && attr(node, "rel") === "canonical" && attr(node, "href") === CANONICAL + href));
        issues.push(issue);
    }
    const homepage = await fsp.readFile(path.join(OUT, "index.html"), "utf8");
    assert.match(homepage, new RegExp(`href="(?:\\./)?reports/${Math.max(...issues)}/"`));
    assert.doesNotMatch(homepage, /(?:rel="preload"[^>]*(?:index|search).*\.json|载入中…)/);
});
