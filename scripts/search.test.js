import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import MiniSearch from "minisearch";
import { buildFullSearch, buildPreviewSearch, highlightPattern } from "../docs/search-core.mjs";
import { tokenizeCJK } from "../docs/vendor/tokenize.mjs";

test("mixed-language queries keep technical words intact", async () => {
    assert.deepEqual(tokenizeCJK("SwiftUI性能"), tokenizeCJK("SwiftUI 性能"));
    const items = [
        { id: "c", title: "C 指针", headings: "指针性能", body: "C 的指针", href: "posts/c/" },
        { id: "cpp", title: "C++17", headings: "移动语义", body: "C++ 的用法", href: "posts/cpp/" },
    ];
    const full = await buildFullSearch(items, MiniSearch);
    const preview = buildPreviewSearch(items);
    assert.deepEqual(full("C++").results.map(({ id }) => id), ["cpp"]);
    assert.deepEqual(preview("C++").results.map(({ id }) => id), ["cpp"]);
    assert.equal("<script>C++</script>".match(highlightPattern("C++"))[0], "C++");
});

test("the generated corpus returns all results and matches inline code", async () => {
    const url = new URL("../_site/data/search-corpus.json", import.meta.url);
    const items = JSON.parse(await readFile(url, "utf8"));
    const full = await buildFullSearch(items, MiniSearch);
    const swiftUI = full("SwiftUI");
    assert.ok(swiftUI.total > 30, "the corpus should exercise the old silent limit");
    assert.equal(swiftUI.results.length, swiftUI.total);
    assert.equal(full("SwiftUI", 8).results.length, 8);

    const mixed = full("SwiftUI性能");
    assert.ok(mixed.total > 0);
    assert.deepEqual(mixed, full("SwiftUI 性能"));
    assert.ok(mixed.results[0].date >= "2019-06-01", "ranking should not start before SwiftUI existed");

    const identifier = "ExpressibleByStringInterpolation";
    const result = full(identifier).results.find(({ type }) => type === "post");
    assert.ok(result?.snippet.includes(identifier), "show the inline-code match in its real context");
});
