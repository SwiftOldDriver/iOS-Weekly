const page = document.body.dataset.page;

if (page === "home") {
    window.addEventListener("hashchange", openLegacyLink);
    openLegacyLink();
} else if (page === "archive") {
    installArchiveNavigation();
}

async function openLegacyLink() {
    const hash = location.hash;
    document.getElementById("legacy-notice")?.remove();
    if (!hash.startsWith("#/")) return;

    const root = new URL("./", import.meta.url);
    const route = hash.slice(2).replace(/\/$/, "");
    if (!route || ["reports", "posts", "contributors"].includes(route)) {
        location.replace(new URL(route ? route + "/" : "./", root).href);
        return;
    }

    try {
        const match = route.match(/^d\/(.+)$/);
        if (match) {
            const response = await fetch(new URL("data/legacy.json", root));
            if (!response.ok) throw new Error("Cannot load legacy links");
            const links = await response.json();
            const key = decodeURIComponent(match[1]);
            const href = Object.hasOwn(links, key) && links[key];
            if (hash !== location.hash) return;
            if (typeof href === "string" && /^(?:reports|posts|contributors)\/[^/]+\/$/.test(href)) {
                const target = new URL(href, root);
                if (target.origin === root.origin && target.pathname === root.pathname + href) {
                    location.replace(target.href);
                    return;
                }
            }
        }
    } catch {
        // The homepage and archive stay available if an old link cannot be resolved.
    }
    if (hash === location.hash) {
        const main = document.getElementById("main");
        const notice = document.createElement("p");
        notice.id = "legacy-notice";
        notice.className = "app-legacy-notice";
        notice.setAttribute("role", "status");
        notice.textContent = "这个旧链接没有找到对应内容。你可以浏览往期周报，或在上方搜索。";
        main.prepend(notice);
    }
}

function installArchiveNavigation() {
    const archive = document.getElementById("app-archive");
    if (!archive) return;

    const groups = [...archive.querySelectorAll(".app-year")];
    const url = new URL(location.href);
    const storageKey = "weekly-archive:" + url.pathname;
    const resume = url.searchParams.has("resume");
    const hashYear = () => groups.find(({ id }) => "#" + id === location.hash);
    const ownState = history.state?.weeklyArchive;
    const saved = resume && getSavedArchive();
    const requestedYear = hashYear();
    const restored = ownState || (saved && (!requestedYear || saved.open.includes(requestedYear.id)) ? saved : null);

    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (restored) {
        const open = new Set(restored.open);
        groups.forEach((group) => { group.open = open.has(group.id); });
    }

    function revealYear() {
        const group = hashYear();
        if (!group) return;
        group.open = true;
        requestAnimationFrame(() => group.scrollIntoView({ block: "start" }));
    }

    if (restored) {
        requestAnimationFrame(() => window.scrollTo(0, restored.scrollY));
    } else {
        revealYear();
    }
    if (resume) {
        url.searchParams.delete("resume");
        history.replaceState(history.state, "", url.href);
    }

    window.addEventListener("hashchange", revealYear);
    window.addEventListener("pagehide", rememberArchive);
    window.addEventListener("pageshow", (event) => {
        const state = history.state?.weeklyArchive;
        if (event.persisted && state) requestAnimationFrame(() => window.scrollTo(0, state.scrollY));
    });
    archive.querySelector(".app-year-nav")?.addEventListener("click", (event) => {
        const link = event.target.closest("a");
        if (link?.hash === location.hash) revealYear();
    });

    function getSavedArchive() {
        try {
            const state = JSON.parse(sessionStorage.getItem(storageKey));
            return Array.isArray(state?.open) && Number.isFinite(state.scrollY) ? state : null;
        } catch {
            return null;
        }
    }

    function rememberArchive() {
        const state = { open: groups.filter(({ open }) => open).map(({ id }) => id), scrollY: window.scrollY };
        history.replaceState({ ...history.state, weeklyArchive: state }, "");
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(state));
        } catch {
            // Browser history can still restore this archive entry without session storage.
        }
    }
}
