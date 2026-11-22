import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { renderMarkdown } from './render-markdown.js';

test('static Markdown keeps safe images, links, tables, and code while stripping active HTML', async () => {
    const { html, toc } = await renderMarkdown({
        item: { path: 'Posts/Test.md', type: 'post', href: 'posts/test/' },
        markdown: `# Test\n\n## Duplicate\n\n## Duplicate

<img src="https://example.com/avatar.png" srcset="other.png 2x" onerror="alert(1)" alt="avatar">

<a href="jav&#97;script:alert(1)">unsafe link</a>

<script>alert(1)</script>

<iframe srcdoc="<script>alert(1)</script>"></iframe>

| A | B |
| - | - |
| X | Y |

- [x] done

\`let x = 1\`

[bare host](zhangferry.com)
`,
    });
    assert.doesNotMatch(html, /javascript|onerror|iframe|script|srcset|alert\(1\)/);
    assert.match(html, /<img src="https:\/\/example.com\/avatar.png" alt="avatar" loading="lazy"/);
    assert.match(html, /<div class="article-table-scroll"[^>]*><table>/);
    assert.match(html, /<input type="checkbox" disabled="" checked="">/);
    assert.match(html, /<code>let x = 1<\/code>/);
    assert.match(html, /href="https:\/\/zhangferry.com\/"/);
    assert.deepEqual(toc.map((heading) => heading.id), ['section-duplicate', 'section-duplicate-1']);
});

test('archive fragments still point to the corresponding article headings', async (t) => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'ios-weekly-markdown-test-'));
    t.after(() => rm(outDir, { recursive: true, force: true }));
    const filename = 'Reports/2018/#17-2018.05.02.md';
    const { html } = await renderMarkdown({
        item: { path: filename, type: 'report', href: 'reports/17/' },
        markdown: await readFile(new URL(`../${filename.replace('#', '%23')}`, import.meta.url), 'utf8'),
        outDir,
    });
    assert.match(html, /href="#section-app-builders-2018"/);
    assert.match(html, /id="-app-builders-2018"/);
    assert.match(html, /id="section-app-builders-2018"/);
    assert.match(html, /href="#section-a-better-mvc"/);
    assert.match(html, /id="section-a-better-mvc"/);
    assert.doesNotMatch(html, /<h1/);
});

test('report covers serve smaller WebP variants and reserve space before loading', async (t) => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'ios-weekly-markdown-test-'));
    t.after(() => rm(outDir, { recursive: true, force: true }));
    const filename = 'Reports/2026/#383-2026.11.09.md';
    const { html, cover } = await renderMarkdown({
        item: { path: filename, type: 'report', href: 'reports/383/' },
        markdown: await readFile(new URL(`../${filename.replace('#', '%23')}`, import.meta.url), 'utf8'),
        outDir,
    });
    assert.deepEqual(cover, { href: 'assets/weekly-header/383.png', width: 3750, height: 1596 });
    assert.match(html, /383\.png-768\.webp 768w.+383\.png-1440\.webp 1440w/);
    assert.match(html, /src="\.\.\/\.\.\/assets\/weekly-header\/383\.png" alt="" loading="eager".*width="3750" height="1596" fetchpriority="high"/);
    assert.match(html, /src="\.\.\/\.\.\/assets\/qrcode_for_wechat\.jpg".*loading="lazy"/);
    for (const width of [768, 1440]) {
        const variant = await stat(path.join(outDir, `assets/weekly-cover-webp/383.png-${width}.webp`));
        assert.ok(variant.size > 0 && variant.size < 32 * 1024);
    }
});
