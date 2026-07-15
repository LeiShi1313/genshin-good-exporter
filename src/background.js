import { convertHoYoLabToGOOD } from "./lib/convert.js";

const HOYOLAB_PAGE = /^https:\/\/act\.hoyolab\.com\/app\/community-game-records-sea\//;
const MIYOUSHE_PAGE = /^https:\/\/www\.miyoushe\.com\/ys(?:\/|$)/;
const MIYOUSHE_RECORD_PAGE = /^https:\/\/webstatic\.mihoyo\.com\/app\/community-game-records(?:\/|\?|#|$)/;
const accountReadyByTab = new Map();
const ACTIVE_ICONS = {
  16: "assets/icon-16.png",
  32: "assets/icon-32.png",
  48: "assets/icon-48.png",
  128: "assets/icon-128.png"
};
const INACTIVE_ICONS = {
  16: "assets/icon-inactive-16.png",
  32: "assets/icon-inactive-32.png",
  48: "assets/icon-inactive-48.png",
  128: "assets/icon-inactive-128.png"
};

function safeFilenamePart(value) {
  return String(value || "unknown").replace(/[^a-z0-9_-]+/gi, "-");
}

function providerForUrl(url) {
  try {
    const parsed = new URL(url);
    if (HOYOLAB_PAGE.test(url)) {
      return parsed.hash.startsWith("#/ys") || parsed.searchParams.get("gid") === "2"
        ? "hoyolab"
        : "";
    }
    if (MIYOUSHE_PAGE.test(url)) return "miyoushe";
    if (MIYOUSHE_RECORD_PAGE.test(url)) {
      return parsed.hash.startsWith("#/ys") || parsed.searchParams.get("game_id") === "2"
        ? "miyoushe"
        : "";
    }
    return "";
  } catch {
    return "";
  }
}

const isSupported = (url) => Boolean(providerForUrl(url));
const isExportSurface = (url) => providerForUrl(url) === "hoyolab" || MIYOUSHE_RECORD_PAGE.test(url || "");

async function setActionState(tabId, url) {
  if (!tabId) return;

  if (!isSupported(url)) {
    accountReadyByTab.delete(tabId);
    await Promise.allSettled([
      chrome.action.enable(tabId),
      chrome.action.setIcon({ tabId, path: INACTIVE_ICONS }),
      chrome.action.setBadgeText({ tabId, text: "" }),
      chrome.action.setTitle({ tabId, title: "Genshin GOOD Exporter — choose an export page" })
    ]);
    return;
  }

  const accountReady = accountReadyByTab.get(tabId) === true;
  await Promise.allSettled([
    chrome.action.enable(tabId),
    chrome.action.setIcon({ tabId, path: ACTIVE_ICONS }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: accountReady ? "#2f7d4b" : "#af8741" }),
    chrome.action.setBadgeText({ tabId, text: accountReady ? "✓" : "GO" }),
    chrome.action.setTitle({
      tabId,
      title: accountReady
        ? "Genshin GOOD Exporter — account detected"
        : "Genshin GOOD Exporter — supported page detected"
    })
  ]);
}

async function injectPageObserver(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/page-observer.js"],
    world: "MAIN",
    injectImmediately: true
  });
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (response?.ok) return;
  } catch {
    // Existing tabs do not receive newly installed content scripts automatically.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content.js"],
    world: "ISOLATED",
    injectImmediately: true
  });
}

async function ensurePageRuntime(tabId) {
  await ensureContentScript(tabId);
  // Re-injection is intentional: the observer guard replays the last captured account
  // after the isolated content script is ready to receive it.
  await injectPageObserver(tabId);
}

async function pageContext(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isSupported(tab.url)) {
    await setActionState(tabId, tab.url);
    return { supported: false, provider: "", account: null };
  }

  await setActionState(tabId, tab.url);
  await ensurePageRuntime(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "WAIT_FOR_ACCOUNT",
    timeoutMs: 5_000
  });

  const ready = Boolean(response?.account?.roleId && response?.account?.server);
  accountReadyByTab.set(tabId, ready);
  await setActionState(tabId, tab.url);
  return { supported: true, provider: providerForUrl(tab.url), account: response?.account || null };
}

async function downloadJson(value, filename) {
  const json = JSON.stringify(value, null, 2);
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  return chrome.downloads.download({ url, filename, saveAs: true });
}

async function runExport(message) {
  const tab = await chrome.tabs.get(message.tabId);
  if (!tab?.id || !isExportSurface(tab.url)) {
    throw new Error("Open HoYoLAB Battle Chronicle or the dedicated 米游社 战绩 page before exporting.");
  }

  await ensurePageRuntime(tab.id);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/page-bridge.js"],
    world: "MAIN"
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "RUN_GOOD_EXPORT",
    payload: {
      roleId: message.roleId,
      server: message.server,
      provider: providerForUrl(tab.url)
    }
  });

  if (!response?.ok) throw new Error(response?.error || "Battle Record export failed.");

  const converted = convertHoYoLabToGOOD(response.result);
  const date = new Date().toISOString().slice(0, 10);
  const uid = safeFilenamePart(converted.report.roleId);
  await downloadJson(converted.good, `genshin-good-${uid}-${date}.json`);
  await chrome.storage.local.set({ lastExportReport: converted.report });

  return converted.report;
}

async function initializeTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(async (tab) => {
    if (!tab.id) return;
    await setActionState(tab.id, tab.url);
    if (isSupported(tab.url)) await ensurePageRuntime(tab.id);
  }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONTENT_READY" && sender.tab?.id) {
    injectPageObserver(sender.tab.id).catch(() => {});
    return false;
  }

  if (message?.type === "ACCOUNT_DETECTED" && sender.tab?.id) {
    accountReadyByTab.set(sender.tab.id, true);
    setActionState(sender.tab.id, sender.tab.url).catch(() => {});
    return false;
  }

  if (message?.type === "GET_PAGE_CONTEXT") {
    pageContext(message.tabId)
      .then((context) => sendResponse({ ok: true, ...context }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "START_EXPORT") {
    runExport(message)
      .then((report) => sendResponse({ ok: true, report }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) accountReadyByTab.delete(tabId);
  setActionState(tabId, changeInfo.url || tab.url).catch(() => {});
  if (changeInfo.status === "complete" && isSupported(tab.url)) {
    ensurePageRuntime(tabId).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) await setActionState(tabId, tab.url);
});

chrome.tabs.onRemoved.addListener((tabId) => accountReadyByTab.delete(tabId));
chrome.runtime.onInstalled.addListener(() => initializeTabs().catch(() => {}));
chrome.runtime.onStartup.addListener(() => initializeTabs().catch(() => {}));

initializeTabs().catch(() => {});
