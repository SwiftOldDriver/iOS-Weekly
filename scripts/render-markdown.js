import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Marked } from 'marked';
import { defaultTreeAdapter as tree, parseFragment, serialize } from 'parse5';

const markdownParser = new Marked({ gfm: true });
const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const repoUrl = 'https://repo.invalid/project/';
const githubRepo = 'https://github.com/SwiftOldDriver/iOS-Weekly/blob/master/';
const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const allowedTags = new Set((
    'a b blockquote br code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img input kbd li ol p pre s samp small span strong sub summary sup table tbody td th thead tr ul'
).split(' '));
const dropContents = new Set(['embed', 'iframe', 'object', 'script', 'style', 'template']);
const imageInfo = new Map();
const coverVariants = new Map();
const coverWidths = [768, 1440];
const coverSizes = '(max-width: 840px) calc(100vw - 64px), 760px';

export async function renderMarkdown({ item, markdown, outDir, canonicalHrefs = new Map() }) {
    const tokens = markdownParser.lexer(markdown);
    const first = tokens.findIndex((token) => token.type !== 'space' && !/^<!--/.test(token.raw));
    const title = tokens[first];
    const titleLevels = { report: [1], post: [1, 2], contributor: [3] };
    if (title?.type === 'heading' && titleLevels[item.type]?.includes(title.depth)) {
        // The page template supplies the H1. Keep any source link from the original title.
        if (title.tokens.some((token) => token.type === 'link')) title.type = 'paragraph';
        else tokens.splice(first, 1);
    }

    const input = parseFragment(markdownParser.parser(tokens));
    const output = tree.createDocumentFragment();
    const toc = [];
    const aliases = new Map();
    const headings = new Map();
    const usedIds = new Set();

    function collectHeadings(node) {
        if ((node.namespaceURI && node.namespaceURI !== htmlNamespace) || dropContents.has(node.tagName)) return;
        if (/^h[1-6]$/.test(node.tagName)) {
            const label = textContent(node).replace(/\s+/g, ' ').trim();
            const slug = headingSlug(label) || 'section';
            let id = `section-${slug}`;
            for (let n = 1; usedIds.has(id); n++) id = `section-${slug}-${n}`;
            usedIds.add(id);
            const level = Math.max(2, Number(node.tagName.slice(1)));
            // Old Markdown links used GitHub-style IDs with a leading hyphen after emoji.
            const alias = label.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s/g, '-');
            const hasAlias = alias.startsWith('-') && !aliases.has(alias);
            if (hasAlias) aliases.set(alias, id);
            headings.set(node, { id, level, alias: hasAlias ? alias : null });
            toc.push({ id, label, level });
        }
        for (const child of node.childNodes || []) collectHeadings(child);
    }

    collectHeadings(input);
    const context = { item, outDir, canonicalHrefs, aliases, headings, usedIds, cover: null };
    for (const child of input.childNodes) await appendSafeNode(output, child, context);
    return { html: serialize(output), toc, cover: context.cover };
}

async function appendSafeNode(parent, node, context) {
    if (tree.isTextNode(node)) {
        tree.insertText(parent, node.value);
        return;
    }
    if (!tree.isElementNode(node) || node.namespaceURI !== htmlNamespace || dropContents.has(node.tagName)) return;
    if (!allowedTags.has(node.tagName)) {
        for (const child of node.childNodes || []) await appendSafeNode(parent, child, context);
        return;
    }

    const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    let tag = node.tagName;
    const safe = {};
    if (attrs.title) safe.title = attrs.title;

    if (tag === 'img') {
        await appendImage(parent, attrs, context);
        return;
    }
    if (tag === 'a') {
        const resolved = resolveUrl(attrs.href, context);
        if (resolved?.href) safe.href = resolved.href;
        if (resolved?.external && /^https?:/.test(resolved.href)) {
            safe.target = '_blank';
            safe.rel = 'noopener noreferrer';
        }
    }
    if (tag === 'input') {
        if (attrs.type !== 'checkbox') return;
        safe.type = 'checkbox';
        safe.disabled = '';
        if ('checked' in attrs) safe.checked = '';
    }
    if (tag === 'ol' && /^-?\d+$/.test(attrs.start)) safe.start = attrs.start;
    if (tag === 'code' && /^language-[\w+.-]+$/.test(attrs.class)) safe.class = attrs.class;
    if ((tag === 'th' || tag === 'td') && ['left', 'center', 'right'].includes(attrs.align)) safe.align = attrs.align;

    const heading = context.headings.get(node);
    if (heading) {
        tag = `h${heading.level}`;
        safe.id = heading.id;
        if (heading.alias) addElement(parent, 'span', { class: 'article-anchor', id: heading.alias, 'aria-hidden': 'true' });
    }
    if (tag === 'table') {
        parent = addElement(parent, 'div', {
            class: 'article-table-scroll', tabindex: '0', role: 'region', 'aria-label': '可横向滚动的表格',
        });
    }
    const element = addElement(parent, tag, safe);
    const container = heading ? addElement(element, 'span', { class: 'content' }) : element;
    for (const child of node.childNodes || []) await appendSafeNode(container, child, context);
}

function resolveUrl(value, context, image = false) {
    if (!value) return null;
    let href = value.trim().replace(/^~(https?:\/\/.+)~$/i, '$1');
    if (!href || /[\\\u0000-\u001f\u007f]/.test(href)) return null;

    if (href.startsWith('#')) {
        if (image) return null;
        const fragment = decode(href.slice(1));
        const id = context.aliases.get(fragment) || `section-${headingSlug(fragment)}`;
        const target = context.usedIds.has(fragment) ? fragment : id;
        if (!context.usedIds.has(target)) throw new Error(`${context.item.path}: unknown heading ${href}`);
        return { href: `#${encodeURIComponent(target)}` };
    }

    if (href === 'zhagnferry.com') href = 'zhangferry.com';
    if (/^(?:[a-z\d-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(href)
        && !/\.(?:md|html?|png|jpe?g|gif|svg|webp|pdf)(?:[?#]|$)/i.test(href)) {
        href = `https://${href}`;
    }
    if (href.startsWith('//')) href = `https:${href}`;
    if (/^[a-z][\w+.-]*:/i.test(href)) {
        let url;
        try { url = new URL(href); } catch { return null; }
        if (!['https:', 'http:'].includes(url.protocol)) {
            return !image && ['mailto:', 'tel:'].includes(url.protocol) ? { href: url.href } : null;
        }
        const asset = image && githubAsset(url);
        if (asset) return assetUrl(asset, context.item, url);
        return { href: url.href, external: true };
    }

    // Historical reports originally lived a directory higher. Treat their assets as repo-relative.
    if (/^(?:(?:\.\.?\/)+|\/)?assets\//.test(href)) href = href.replace(/^.*?(?=assets\/)/, '');
    const fromRoot = /^(?:assets|Reports|Posts|Contributors)\//.test(href) || href.startsWith('/');
    const base = fromRoot ? repoUrl : new URL(encodePath(context.item.path), repoUrl);
    const url = new URL(href.replace(/^\//, ''), base);
    if (!url.href.startsWith(repoUrl)) return null;
    const repoPath = path.posix.normalize(decode(url.pathname.slice(new URL(repoUrl).pathname.length)));
    if (repoPath.startsWith('assets/')) return assetUrl(repoPath, context.item, url);
    const page = context.canonicalHrefs.get(repoPath);
    if (page && !image) {
        const anchor = url.hash ? `#section-${encodeURIComponent(headingSlug(decode(url.hash.slice(1))))}` : '';
        return { href: `${relativeHref(context.item.href, page)}${url.search}${anchor}` };
    }
    throw new Error(`${context.item.path}: unknown local ${image ? 'image' : 'link'} ${value}`);
}

function githubAsset(url) {
    const pathname = decode(url.pathname);
    const match = url.hostname === 'github.com'
        ? /^\/SwiftOldDriver\/iOS-Weekly\/(?:blob|raw)\/(?:master|main)\/(assets\/.+)$/i.exec(pathname)
        : url.hostname === 'raw.githubusercontent.com'
            && /^\/SwiftOldDriver\/iOS-Weekly\/(?:master|main)\/(assets\/.+)$/i.exec(pathname);
    if (!match) return null;
    const repoPath = path.posix.normalize(match[1]);
    return repoPath.startsWith('assets/') ? repoPath : null;
}

function assetUrl(repoPath, item, url) {
    url.searchParams.delete('raw');
    return { href: `${relativeHref(item.href, encodePath(repoPath))}${url.search}${url.hash}`, repoPath };
}

async function appendImage(parent, attrs, context) {
    const resolved = resolveUrl(attrs.src, context, true);
    if (!resolved) return;
    const { href, repoPath } = resolved;
    const alt = attrs.alt || (repoPath === 'assets/qrcode_for_wechat.jpg' ? '老司机技术周报微信公众号二维码' : '');
    if (repoPath === 'assets/payment.jpeg') {
        tree.insertText(parent, `图片已不可用${alt ? `（${alt}）` : ''}`);
        return;
    }

    const size = repoPath ? await getImageInfo(repoPath) : null;
    const safe = { src: href, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' };
    if (attrs.title) safe.title = attrs.title;
    if (size) {
        safe.width = String(size.width);
        safe.height = String(size.height);
    } else {
        if (/^[1-9]\d{0,4}$/.test(attrs.width)) safe.width = attrs.width;
        if (/^[1-9]\d{0,4}$/.test(attrs.height)) safe.height = attrs.height;
    }
    if (context.item.type === 'contributor') {
        safe.class = 'contributor-portrait';
        if (safe.width && !safe.height) safe.height = safe.width;
    }

    if (context.item.type === 'report' && !context.cover && size
        && (repoPath === 'assets/ios-weekly.png' || repoPath.startsWith('assets/weekly-header/'))) {
        const variants = await getCoverVariants(repoPath, size.width, context.outDir);
        context.cover = { href: encodePath(repoPath), ...size };
        safe.alt = alt === 'ios-weekly' ? '' : alt;
        safe.loading = 'eager';
        safe.fetchpriority = 'high';
        const picture = addElement(parent, 'picture', {});
        addElement(picture, 'source', {
            type: 'image/webp', sizes: coverSizes,
            srcset: variants.map(({ asset, width }) => `${relativeHref(context.item.href, asset)} ${width}w`).join(', '),
        });
        addElement(picture, 'img', safe);
    } else {
        addElement(parent, 'img', safe);
    }
}

function getImageInfo(repoPath) {
    if (!imageInfo.has(repoPath)) {
        imageInfo.set(repoPath, fs.readFile(path.join(repoRoot, repoPath)).then(readImageSize));
    }
    return imageInfo.get(repoPath);
}

function readImageSize(buffer) {
    if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length < 2 || buffer.readUInt16BE(0) !== 0xffd8) return null;
    for (let offset = 2; offset + 8 < buffer.length;) {
        if (buffer[offset++] !== 0xff) break;
        while (buffer[offset] === 0xff) offset++;
        const marker = buffer[offset++];
        if (marker === 0xd9 || marker === 0xda || offset + 7 > buffer.length) break;
        const length = buffer.readUInt16BE(offset);
        if (length < 2) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
            return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
        }
        offset += length;
    }
    return null;
}

function getCoverVariants(repoPath, sourceWidth, outDir) {
    const key = path.join(outDir, repoPath);
    if (!coverVariants.has(key)) {
        coverVariants.set(key, (async () => {
            const directory = 'assets/weekly-cover-webp';
            await fs.mkdir(path.join(outDir, directory), { recursive: true });
            const widths = [...new Set(coverWidths.map((width) => Math.min(width, sourceWidth)))];
            return Promise.all(widths.map(async (width) => {
                const asset = `${directory}/${path.basename(repoPath)}-${width}.webp`;
                try {
                    await run('cwebp', ['-quiet', '-q', '85', '-m', '3', '-resize', String(width), '0',
                        path.join(repoRoot, repoPath), '-o', path.join(outDir, asset)]);
                } catch (error) {
                    if (error.code === 'ENOENT') throw new Error('cwebp is required to build weekly covers. Install the webp package.');
                    throw error;
                }
                return { asset: encodePath(asset), width };
            }));
        })());
    }
    return coverVariants.get(key);
}

function addElement(parent, tag, attrs) {
    const element = tree.createElement(tag, htmlNamespace, Object.entries(attrs).map(([name, value]) => ({ name, value })));
    tree.appendChild(parent, element);
    return element;
}

function textContent(node) {
    if (tree.isTextNode(node)) return node.value;
    if (dropContents.has(node.tagName)) return '';
    return (node.childNodes || []).map(textContent).join('');
}

function headingSlug(text) {
    return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '-').replace(/^-|-$/g, '');
}

function relativeHref(from, to) {
    const relative = path.posix.relative(from, to) || '.';
    return to.endsWith('/') ? `${relative}/` : relative;
}

function encodePath(p) {
    return p.split('/').map(encodeURIComponent).join('/');
}

function decode(text) {
    try { return decodeURIComponent(text); } catch { return text; }
}
