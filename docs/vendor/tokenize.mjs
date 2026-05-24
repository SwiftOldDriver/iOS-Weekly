/**
 * Shared tokenizer for MiniSearch indexing & querying.
 *
 * Splits on whitespace + punctuation; for CJK runs emits unigrams + bigrams,
 * which lets MiniSearch find Chinese substrings without a dictionary.
 *
 * NOTE: This file is loaded BOTH by:
 *   - the build script (scripts/build-index.js, copy at scripts/tokenize.js)
 *   - the browser app (docs/app.js)
 * Keep it dependency-free.
 */

export function tokenizeCJK(text) {
    if (!text) return [];
    const out = [];
    const parts = String(text).split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
    const cjkRe = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
    for (const part of parts) {
        if (/^[\p{ASCII}]+$/u.test(part)) {
            out.push(part.toLowerCase());
            continue;
        }
        const chars = [...part];
        let buf = "";
        const flush = () => {
            if (!buf) return;
            const cs = [...buf];
            for (let i = 0; i < cs.length; i++) {
                out.push(cs[i]);
                if (i + 1 < cs.length) out.push(cs[i] + cs[i + 1]);
            }
            buf = "";
        };
        for (const ch of chars) {
            if (cjkRe.test(ch)) {
                buf += ch;
            } else {
                flush();
                if (ch.trim()) out.push(ch.toLowerCase());
            }
        }
        flush();
    }
    return out;
}
