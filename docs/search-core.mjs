import { searchWords, tokenizeCJK } from "./vendor/tokenize.mjs";

const LATIN_WORD = /^[a-z0-9_]+$/;

export async function buildFullSearch(items, MiniSearch) {
    const index = new MiniSearch({
        fields: ["title", "headings", "body"],
        tokenize: tokenizeCJK,
        searchOptions: {
            prefix: (term) => term.length > 1 && (LATIN_WORD.test(term) || term === "c++" || term === "c#"),
            fuzzy: (term) => term.length >= 5 && LATIN_WORD.test(term) ? 0.15 : false,
            boost: { title: 3, headings: 2 },
            combineWith: "AND",
        },
    });
    // Yield inside the Worker so newer queries can replace queued searches
    // while the first request is preparing the index.
    await index.addAllAsync(items, { chunkSize: 24 });
    const byId = new Map(items.map((item) => [item.id, item]));

    return (query, limit) => {
        const matches = index.search(query);
        return {
            total: matches.length,
            results: matches.slice(0, limit).map((match) => {
                return searchResult(byId.get(match.id), query, match.terms);
            }),
        };
    };
}

export function buildPreviewSearch(items) {
    const documents = items.map((item) => ({
        item,
        title: item.title.normalize("NFKC").toLowerCase(),
        headings: item.headings.normalize("NFKC").toLowerCase(),
    }));

    return (query, limit) => {
        const words = [...new Set(searchWords(query))];
        if (!words.length) return { total: 0, results: [] };
        const matches = [];
        for (const { item, title, headings } of documents) {
            let score = 0;
            for (const word of words) {
                if (title.includes(word)) score += 3;
                else if (headings.includes(word)) score += 1;
                else {
                    score = 0;
                    break;
                }
            }
            if (score) matches.push({ item, score });
        }
        matches.sort((a, b) => b.score - a.score || (b.item.date || "").localeCompare(a.item.date || ""));
        return {
            total: matches.length,
            results: matches.slice(0, limit).map(({ item }) => searchResult(item, query)),
        };
    };
}

function searchResult(item, query, matchedTerms = []) {
    const { id, title, type, date, href, headings, body } = item;
    const match = highlightPattern(query, matchedTerms);
    for (const source of [headings, body]) {
        if (!source || !match) continue;
        const hit = source.match(match);
        if (hit) {
            const start = Math.max(0, hit.index - 28);
            const end = Math.min(source.length, hit.index + hit[0].length + 92);
            const snippet = `${start ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
            return { id, title, type, date, href, snippet, matchedTerms };
        }
    }
    const snippet = headings.split("\n")[0] || body?.slice(0, 120) || "";
    return { id, title, type, date, href, snippet, matchedTerms };
}

export function highlightPattern(query, matchedTerms = [], flags = "iu") {
    const words = new Set(searchWords(query));
    for (const term of matchedTerms) {
        // Prefer a whole query word to the individual CJK bigrams used by the
        // index. Keep other matched terms to show prefixes and spelling variants.
        if (![...words].some((word) => word.includes(term))) words.add(term);
    }
    if (!words.size) return null;
    const alternatives = [...words].sort((a, b) => b.length - a.length)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(alternatives.join("|"), flags);
}
