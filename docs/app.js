import { buildPreviewSearch, highlightPattern } from "./search-core.mjs";

const SITE_ROOT = new URL("./", import.meta.url);
const QUICK_LIMIT = 8;
const LABELS = { report: "周报", post: "文章", contributor: "贡献者" };
const input = document.querySelector("#app-search-input");
const form = input?.form;
const panel = document.querySelector("#app-search-panel");
const status = document.querySelector("#app-search-status");
const more = document.querySelector("#app-search-more");

let previewPromise;
let worker;
let nextRequest = 0;
const requests = new Map();

function loadPreview() {
    previewPromise ??= fetch(new URL("data/search-preview.json", SITE_ROOT))
        .then((response) => {
            if (!response.ok) throw new Error(`Search preview: ${response.status}`);
            return response.json();
        })
        .then(buildPreviewSearch)
        .catch((error) => {
            previewPromise = undefined;
            throw error;
        });
    return previewPromise;
}

function makeWorker() {
    const instance = new Worker(new URL("search-worker.js", SITE_ROOT), { type: "module" });
    instance.addEventListener("message", ({ data }) => {
        const request = requests.get(data.scope);
        if (request?.id !== data.id) return;
        requests.delete(data.scope);
        request.resolve(data.failed ? null : data);
    });
    const onError = () => {
        instance.terminate();
        if (worker !== instance) return;
        worker = undefined;
        for (const request of requests.values()) request.resolve(null);
        requests.clear();
    };
    instance.addEventListener("error", onError);
    instance.addEventListener("messageerror", onError);
    return instance;
}

function cancelSearch(scope) {
    const request = requests.get(scope);
    if (!request) return;
    requests.delete(scope);
    request.resolve(null);
    worker?.postMessage({ scope, id: ++nextRequest });
}

function requestFullSearch(scope, query, limit) {
    cancelSearch(scope);
    return new Promise((resolve) => {
        try {
            worker ??= makeWorker();
            const id = ++nextRequest;
            requests.set(scope, { id, resolve });
            worker.postMessage({ scope, id, query, limit });
        } catch {
            requests.delete(scope);
            resolve(null);
        }
    });
}

async function search(scope, query, limit, onPreview) {
    let finished = false;
    const preview = loadPreview().then((run) => {
        if (finished) return null;
        const result = run(query, limit);
        onPreview(result);
        return result;
    }).catch(() => null);
    const full = await requestFullSearch(scope, query, limit);
    if (full) {
        finished = true;
        return { ...full, mode: "full" };
    }
    const fallback = await preview;
    return fallback ? { ...fallback, mode: "preview" } : { total: 0, results: [], mode: "failed" };
}

function resultLink(result, query) {
    const link = makeElement("a", "app-search__result");
    link.href = new URL(result.href, SITE_ROOT);
    const head = makeElement("span", "app-search__result-head");
    const badge = makeElement("span", `app-badge app-badge--${result.type}`, LABELS[result.type]);
    const title = makeElement("span", "app-search__result-title");
    const issue = result.type === "report" && result.id.match(/^r-(\d+)-/);
    const label = issue ? `第 ${Number(issue[1])} 期` : result.title;
    appendHighlight(title, label, query, result.matchedTerms);
    head.append(badge, title);
    if (result.date) {
        const date = makeElement("time", "app-search__result-date", result.date);
        date.dateTime = result.date;
        head.append(date);
    }
    link.append(head);
    if (result.snippet) {
        const snippet = makeElement("span", "app-search__result-snippet");
        appendHighlight(snippet, result.snippet, query, result.matchedTerms);
        link.append(snippet);
    }
    return link;
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function appendHighlight(element, text, query, terms) {
    const pattern = highlightPattern(query, terms, "giu");
    let offset = 0;
    if (pattern) {
        for (const match of text.matchAll(pattern)) {
            element.append(text.slice(offset, match.index), makeElement("mark", "", match[0]));
            offset = match.index + match[0].length;
        }
    }
    element.append(text.slice(offset));
}

function cleanQuery(value) {
    return Array.from((value ?? "").trim()).slice(0, 120).join("");
}

function resultMessage({ total, mode }) {
    if (mode === "failed") return "搜索加载失败，请稍后重试。";
    if (mode === "preview") return `全文搜索暂不可用。标题和栏目匹配 ${total} 条。`;
    return total ? `找到 ${total} 条结果` : "没有找到匹配结果";
}

function installQuickSearch() {
    let revision = 0;
    let timer;
    let options = [];
    let active = -1;
    let composing = false;
    let composingEnter = false;
    const count = makeElement("span", "app-search__count");
    const all = makeElement("a", "app-search__all", "查看全部");
    more.replaceChildren(count, all);

    function showMore(message, query) {
        status.textContent = message;
        count.textContent = message;
        const resultsUrl = new URL("search/", SITE_ROOT);
        resultsUrl.searchParams.set("q", query);
        all.href = resultsUrl;
        more.hidden = false;
    }

    function setActive(index, scroll = true) {
        active = index;
        for (const [position, option] of options.entries()) {
            const selected = position === index;
            option.classList.toggle("is-active", selected);
            option.setAttribute("aria-selected", String(selected));
        }
        const option = options[active];
        if (option) {
            input.setAttribute("aria-activedescendant", option.id);
            if (scroll) option.scrollIntoView({ block: "nearest" });
        } else {
            input.removeAttribute("aria-activedescendant");
        }
    }

    function renderOptions(results, query) {
        const selected = options[active]?.href;
        options = results.map((result, index) => {
            const option = resultLink(result, query);
            option.id = `app-search-option-${index}`;
            option.tabIndex = -1;
            option.setAttribute("role", "option");
            return option;
        });
        panel.replaceChildren(...options);
        panel.hidden = !options.length;
        input.setAttribute("aria-expanded", String(options.length > 0));
        setActive(options.findIndex((option) => option.href === selected), false);
    }

    function dismiss() {
        revision++;
        clearTimeout(timer);
        cancelSearch("popup");
        renderOptions([], "");
        more.hidden = true;
        status.textContent = "";
    }

    function schedule() {
        dismiss();
        const query = cleanQuery(input.value);
        if (!query || composing || document.activeElement !== input) return;
        const current = revision;
        showMore("正在搜索…", query);
        timer = setTimeout(async () => {
            const result = await search("popup", query, QUICK_LIMIT, (preview) => {
                if (current !== revision) return;
                renderOptions(preview.results, query);
                showMore(`标题和栏目匹配 ${preview.total} 条，正在搜索全文…`, query);
            });
            if (current !== revision) return;
            renderOptions(result.results, query);
            showMore(resultMessage(result), query);
        }, 120);
    }

    input.addEventListener("focus", schedule);
    input.addEventListener("input", (event) => {
        if (!event.isComposing && !composing) schedule();
    });
    input.addEventListener("compositionstart", () => {
        composing = true;
        dismiss();
    });
    input.addEventListener("compositionend", () => {
        composing = false;
        schedule();
    });
    input.addEventListener("keydown", (event) => {
        if (composing || event.isComposing || event.keyCode === 229) {
            if (event.key === "Enter") {
                composingEnter = true;
                setTimeout(() => { composingEnter = false; }, 0);
            }
            return;
        }
        if (event.key === "Escape" && !more.hidden) {
            event.preventDefault();
            dismiss();
        } else if (options.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            const next = event.key === "ArrowDown" ? active + 1 : active < 0 ? options.length - 1 : active - 1;
            setActive((next + options.length) % options.length);
        } else if (event.key === "Enter" && options[active]) {
            event.preventDefault();
            const href = options[active].href;
            dismiss();
            window.location.assign(href);
        }
    });
    form.addEventListener("submit", (event) => {
        const query = cleanQuery(input.value);
        if (composing || composingEnter || !query) {
            event.preventDefault();
            return;
        }
        input.value = query;
        dismiss();
    });
    form.addEventListener("focusout", (event) => {
        if (!form.contains(event.relatedTarget)) dismiss();
    });
    document.addEventListener("pointerdown", (event) => {
        if (!form.contains(event.target) && !more.hidden) dismiss();
    });
    for (const container of [panel, more]) {
        container.addEventListener("mousedown", (event) => {
            // Keep focus on the combobox until a pointer selection is activated.
            if (event.button === 0 && event.target.closest("a[href]")) event.preventDefault();
        });
        container.addEventListener("click", (event) => {
            const link = event.target.closest("a[href]");
            if (!link || event.defaultPrevented) return;
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                setTimeout(dismiss, 0);
                return;
            }
            event.preventDefault();
            const href = link.href;
            dismiss();
            window.location.assign(href);
        });
    }
    window.addEventListener("pagehide", dismiss);
    document.addEventListener("keydown", (event) => {
        if (event.key !== "/" || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
        event.preventDefault();
        input.focus();
        input.select();
    });
}

async function showSearchPage() {
    const list = document.querySelector("#app-search-results");
    const message = document.querySelector("#app-search-results-status");
    if (!list || !message) return;
    const query = cleanQuery(new URLSearchParams(window.location.search).get("q"));
    if (!query) {
        message.textContent = "输入期号、关键词或技术标识符开始搜索。";
        return;
    }
    if (input) input.value = query;

    function update(results, text) {
        const rows = results.map((result) => {
            const row = document.createElement("li");
            row.append(resultLink(result, query));
            return row;
        });
        list.replaceChildren(...rows);
        message.textContent = `“${query}”：${text}`;
    }

    update([], "正在搜索…");
    const result = await search("page", query, undefined, (preview) => {
        update(preview.results, `标题和栏目匹配 ${preview.total} 条，正在搜索全文…`);
    });
    update(result.results, resultMessage(result));
}

if (form && panel && status && more) installQuickSearch();
showSearchPage();
