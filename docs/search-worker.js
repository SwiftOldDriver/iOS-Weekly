import MiniSearch from "./vendor/minisearch.esm.js";
import { buildFullSearch } from "./search-core.mjs";

let searchPromise;
const latest = new Map();

function loadSearch() {
    searchPromise ??= fetch(new URL("./data/search-corpus.json", import.meta.url))
        .then((response) => {
            if (!response.ok) throw new Error(`Search corpus: ${response.status}`);
            return response.json();
        })
        .then((items) => buildFullSearch(items, MiniSearch))
        .catch((error) => {
            searchPromise = undefined;
            throw error;
        });
    return searchPromise;
}

self.addEventListener("message", async ({ data: { scope, id, query, limit } }) => {
    latest.set(scope, id);
    if (!query) return;
    try {
        const search = await loadSearch();
        if (latest.get(scope) === id) {
            self.postMessage({ scope, id, ...search(query, limit) });
        }
    } catch {
        if (latest.get(scope) === id) self.postMessage({ scope, id, failed: true });
    }
});
