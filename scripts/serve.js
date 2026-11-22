#!/usr/bin/env node

import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = fileURLToPath(new URL("../_site/", import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const PREFIX = process.env.SITE_PREFIX || "/";
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
};

if (!/^\/(?:[\w-]+\/)*$/.test(PREFIX)) throw new Error("SITE_PREFIX must begin and end with /");
await fsp.access(path.join(SITE_DIR, "index.html")).catch(() => {
    throw new Error("Run npm run build --prefix scripts before starting the preview.");
});

http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://localhost");
        const pathname = decodeURIComponent(url.pathname);
        if (!pathname.startsWith(PREFIX)) return notFound(res);
        const relative = pathname.slice(PREFIX.length);
        let file = path.resolve(SITE_DIR, relative);
        const within = path.relative(SITE_DIR, file);
        if (within === ".." || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) return notFound(res);

        const stat = await fsp.stat(file).catch(() => null);
        if (!stat) return notFound(res);
        if (stat.isDirectory()) {
            if (!url.pathname.endsWith("/")) {
                res.writeHead(308, { location: url.pathname + "/" + url.search }).end();
                return;
            }
            file = path.join(file, "index.html");
        }
        const data = await fsp.readFile(file).catch(() => null);
        if (!data) return notFound(res);
        res.writeHead(200, {
            "content-type": MIME[path.extname(file)] || "application/octet-stream",
            "cache-control": "no-cache",
        }).end(req.method === "HEAD" ? undefined : data);
    } catch {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    }
}).listen(PORT, "127.0.0.1", () => console.log(`[serve] http://localhost:${PORT}${PREFIX}`));

function notFound(res) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
}
