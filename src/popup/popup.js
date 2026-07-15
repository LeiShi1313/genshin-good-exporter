const uidInput = document.querySelector("#uid");
const serverSelect = document.querySelector("#server");
const exportButton = document.querySelector("#export");
const buttonLabel = document.querySelector("#button-label");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const warningList = document.querySelector("#warnings");
const warningSummary = document.querySelector("#warning-summary");
const providerLabel = document.querySelector("#provider-label");
const recordLink = document.querySelector("#record-link");
const redirects = document.querySelector("#redirects");

let activeTabId = null;
let busy = false;
let provider = "";
let exportSurface = false;

function providerForUrl(url = "") {
  if (url.startsWith("https://act.hoyolab.com/app/community-game-records-sea/")) return "hoyolab";
  if (url.startsWith("https://www.miyoushe.com/ys/")) return "miyoushe";
  if (url.startsWith("https://webstatic.mihoyo.com/app/community-game-records")) return "miyoushe";
  return "";
}

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function updateButton() {
  const validUid = /^\d{9,10}$/.test(uidInput.value.trim());
  exportButton.disabled = busy || !activeTabId || !exportSurface || !validUid || !serverSelect.value;
}

function showReport(report) {
  document.querySelector("#character-count").textContent = report.counts.characters;
  document.querySelector("#artifact-count").textContent = report.counts.artifacts;
  document.querySelector("#weapon-count").textContent = report.counts.weapons;

  warningList.replaceChildren();
  for (const warning of report.warnings.slice(0, 12)) {
    const item = document.createElement("li");
    item.textContent = warning.message;
    warningList.append(item);
  }
  warningSummary.textContent = `${report.warnings.length} export note${report.warnings.length === 1 ? "" : "s"}`;
  result.hidden = false;
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id || null;

  provider = providerForUrl(tab?.url);
  if (!activeTabId || !provider) {
    redirects.hidden = false;
    setStatus("This page cannot be exported. Choose a Battle Record page below.");
    updateButton();
    return;
  }

  const isChina = provider === "miyoushe";
  exportSurface = provider === "hoyolab"
    || tab.url.startsWith("https://webstatic.mihoyo.com/app/community-game-records");
  providerLabel.textContent = `${isChina ? "米游社" : "HoYoLAB"} equipped builds → GOOD v3`;
  recordLink.hidden = !isChina || exportSurface;

  if (!exportSurface) {
    setStatus("米游社 community page detected. Open 游戏工具 → 战绩 so the extension can use the real Genshin UID and first-party login session.");
    updateButton();
    return;
  }

  setStatus(`Exporter activated for ${isChina ? "米游社" : "HoYoLAB"}. Detecting the game account…`);

  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT", tabId: activeTabId });
    if (!response?.ok) throw new Error(response?.error || "Could not connect to this page.");
    if (!response.supported) throw new Error("This is not a supported Genshin Battle Record page.");
    provider = response.provider || provider;
    if (response.account?.roleId) uidInput.value = response.account.roleId;
    if (response.account?.server) serverSelect.value = response.account.server;

    if (uidInput.value && serverSelect.value) setStatus("Account detected. Ready to export equipped builds.");
    else if (provider === "miyoushe") {
      redirects.hidden = false;
      setStatus("米游社 战绩 is supported, but no game role was detected. Enter the Genshin UID and China server manually.");
    } else {
      setStatus("This page is supported, but the account is still hidden. Enter the UID and server shown on HoYoLAB.");
    }
  } catch {
    redirects.hidden = false;
    setStatus("Could not connect to this page. Close and reopen the extension popup to retry.", "error");
  }

  updateButton();
}

uidInput.addEventListener("input", updateButton);
serverSelect.addEventListener("change", updateButton);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "ACCOUNT_DETECTED") {
    if (message.account?.roleId) uidInput.value = message.account.roleId;
    if (message.account?.server) serverSelect.value = message.account.server;
    setStatus("Account detected. Ready to export equipped builds.");
    updateButton();
    return;
  }

  if (message?.type === "EXPORT_PROGRESS" && busy) {
    setStatus(`Fetching character details… ${message.completed}/${message.total}`);
  }
});

exportButton.addEventListener("click", async () => {
  busy = true;
  result.hidden = true;
  buttonLabel.textContent = "Exporting…";
  setStatus(`Fetching the character roster from ${provider === "miyoushe" ? "米游社" : "HoYoLAB"}…`);
  updateButton();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "START_EXPORT",
      tabId: activeTabId,
      roleId: uidInput.value.trim(),
      server: serverSelect.value
    });

    if (!response?.ok) throw new Error(response?.error || "Export failed.");
    showReport(response.report);
    setStatus("GOOD v3 JSON is ready in Chrome Downloads.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    busy = false;
    buttonLabel.textContent = "Export GOOD JSON";
    updateButton();
  }
});

initialize().catch((error) => setStatus(error.message, "error"));
