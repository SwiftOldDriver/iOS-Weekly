#!/usr/bin/env node
/**
 * Local development helper: assemble the deployable site into `_site/` and
 * serve it on http://localhost:8080. Mirrors the production GitHub Pages
 * layout so paths like /assets/page.css and /Reports/... resolve identically.
 *
 *   node scripts/serve.js          # assemble + serve
 *   node scripts/serve.js --once   # just assemble, no server
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(REPO_ROOT, "_site");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

async function main() {
    await assemble();
    if (process.argv.includes("--once")) return;
    serve();
}

async function assemble() {
    await fsp.rm(SITE_DIR, { recursive: true, force: true });
    await fsp.mkdir(SITE_DIR, { recursive: true });

    await copyDir(path.join(REPO_ROOT, "docs"), SITE_DIR);
    await copyDir(path.join(REPO_ROOT, "assets"), path.join(SITE_DIR, "assets"));
    await copyDir(path.join(REPO_ROOT, "Reports"), path.join(SITE_DIR, "Reports"));
    await copyDir(path.join(REPO_ROOT, "Posts"), path.join(SITE_DIR, "Posts"));
    await copyDir(path.join(REPO_ROOT, "Contributors"), path.join(SITE_DIR, "Contributors"));
    await fsp.writeFile(path.join(SITE_DIR, ".nojekyll"), "");

    console.log(`[serve] assembled → ${path.relative(REPO_ROOT, SITE_DIR)}`);
}

async function copyDir(src, dst) {
    if (!fs.existsSync(src)) return;
    await fsp.cp(src, dst, { recursive: true });
}

function serve() {
    const server = http.createServer(async (req, res) => {
        try {
            let pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
            if (pathname.endsWith("/")) pathname += "index.html";
            const safe = path.normalize(path.join(SITE_DIR, pathname));
            if (!safe.startsWith(SITE_DIR)) {
                res.writeHead(403).end("forbidden");
                return;
            }
            const stat = await fsp.stat(safe).catch(() => null);
            if (!stat) {
                res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found: " + pathname);
                return;
            }
            const final = stat.isDirectory() ? path.join(safe, "index.html") : safe;
            
            res.writeHead(200, {
                "content-type": MIME[path.extname(final).toLowerCase()] || "application/octet-stream",
                "cache-control": "no-cache",
            });
            
            const stream = fs.createReadStream(final);
            stream.pipe(res);
            stream.on('error', (err) => {
                if (!res.writableEnded) {
                    res.destroy();
                }
            });
        } catch (err) {
            res.writeHead(500, { "content-type": "text/plain" }).end(String(err));
        }
    });
    server.listen(PORT, () => {
        console.log(`[serve] http://localhost:${PORT}/`);
    });
}
