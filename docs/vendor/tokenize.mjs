// Keep Latin identifiers intact next to CJK text. For CJK, index both single
// characters and pairs so readers can search substrings without a dictionary.
const CJK_RUN = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+)/u;
const WORD = /c(?:\+\+|#)\d*|[\p{L}\p{M}\p{N}_]+/gu;

export function searchWords(text, cjkBigrams = false) {
    const tokens = [];
    const runs = String(text ?? "").normalize("NFKC").toLowerCase().split(CJK_RUN);
    for (const [index, run] of runs.entries()) {
        if (!run) continue;
        if (index % 2 === 0) {
            tokens.push(...(run.match(WORD) || []));
        } else if (cjkBigrams) {
            const characters = [...run];
            for (const [offset, character] of characters.entries()) {
                tokens.push(character);
                if (offset + 1 < characters.length) tokens.push(character + characters[offset + 1]);
            }
        } else {
            tokens.push(run);
        }
    }
    return tokens;
}

export function tokenizeCJK(text) {
    return searchWords(text, true);
}
