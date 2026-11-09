import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function buildSearch({ outDir, items }) {
    const dataDir = path.join(outDir, "data");
    await mkdir(dataDir, { recursive: true });

    const preview = items.map(({ id, title, type, date, href, sections }) => ({
        id, title, type, date, href,
        headings: (sections || []).map(({ heading }) => heading).filter(Boolean).join("\n"),
    }));
    const corpus = preview.map((item, index) => ({
        ...item,
        body: items[index].body || items[index].excerpt || "",
    }));

    await Promise.all([
        writeFile(path.join(dataDir, "search-preview.json"), JSON.stringify(preview)),
        writeFile(path.join(dataDir, "search-corpus.json"), JSON.stringify(corpus)),
    ]);
}
