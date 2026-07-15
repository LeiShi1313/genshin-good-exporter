(() => {
  if (globalThis.__HOYOLAB_GOOD_CONTENT_INSTALLED__) return;
  globalThis.__HOYOLAB_GOOD_CONTENT_INSTALLED__ = true;

  const REQUEST_TYPE = "HOYOLAB_GOOD_REQUEST";
  const RESPONSE_TYPE = "HOYOLAB_GOOD_RESPONSE";
  const PROGRESS_TYPE = "HOYOLAB_GOOD_PROGRESS";
  const ACCOUNT_OBSERVED_TYPE = "HOYOLAB_GOOD_ACCOUNT_OBSERVED";

  const pageProvider = /(?:miyoushe|mihoyo)\.com$/.test(location.hostname) ? "miyoushe" : "hoyolab";
  let detectedAccount = { roleId: "", server: "", provider: pageProvider };
  let scanTimer = null;
  const waiters = new Set();

  function inferServer(roleId, pageText = "", provider = pageProvider) {
    const text = pageText.toLowerCase();

    if (/天空岛|天空島/.test(text)) return "cn_gf01";
    if (/世界树|世界樹|bilibili|哔哩哔哩|嗶哩嗶哩/.test(text)) return "cn_qd01";

    if (/america|north america|北美|美服|américa|amérique/.test(text)) return "os_usa";
    if (/europe|欧洲|歐洲|europa/.test(text)) return "os_euro";
    if (/taiwan|hong kong|macao|macau|台港澳|臺港澳/.test(text)) return "os_cht";
    if (/asia|亚洲|亞洲|asie/.test(text)) return "os_asia";

    const prefix = String(roleId)[0];
    if (provider === "miyoushe") {
      if (prefix === "5") return "cn_qd01";
      if (/^[1-4]$/.test(prefix)) return "cn_gf01";
      return "";
    }

    return {
      "6": "os_usa",
      "7": "os_euro",
      "8": "os_asia",
      "9": "os_cht"
    }[String(roleId)[0]] || "";
  }

  function validRoleId(value) {
    return /^\d{9,10}$/.test(String(value || ""));
  }

  function validServer(value) {
    return /^(os_usa|os_euro|os_asia|os_cht|cn_gf01|cn_qd01)$/.test(String(value || ""));
  }

  function accountFromUrl() {
    const params = new URL(location.href).searchParams;
    const hashQuery = location.hash.includes("?")
      ? new URLSearchParams(location.hash.slice(location.hash.indexOf("?") + 1))
      : new URLSearchParams();

    return {
      roleId: params.get("role_id") || params.get("uid") || hashQuery.get("role_id") || hashQuery.get("uid") || "",
      server: params.get("server") || hashQuery.get("server") || ""
    };
  }

  function accountFromDocument() {
    const fromUrl = accountFromUrl();
    const roleElement = document.querySelector?.("[data-role-id], [data-uid], [data-game-uid]");
    const attributeRoleId = roleElement?.getAttribute("data-role-id")
      || roleElement?.getAttribute("data-uid")
      || roleElement?.getAttribute("data-game-uid")
      || "";
    const text = document.body?.innerText || "";
    const uidMatch = text.match(/(?:UID|UID号|UID號)\s*[:：#]?\s*(\d{9,10})/i);
    const roleId = validRoleId(fromUrl.roleId)
      ? fromUrl.roleId
      : validRoleId(attributeRoleId)
        ? attributeRoleId
        : uidMatch?.[1] || "";
    const server = validServer(fromUrl.server) ? fromUrl.server : inferServer(roleId, text, pageProvider);

    return { roleId, server, provider: pageProvider };
  }

  function accountPayload() {
    return {
      ...detectedAccount,
      pageTitle: document.title,
      url: location.href
    };
  }

  function notifyWaiters() {
    if (!validRoleId(detectedAccount.roleId) || !validServer(detectedAccount.server)) return;
    for (const resolve of waiters) resolve(accountPayload());
    waiters.clear();
  }

  function mergeAccount(candidate) {
    const next = {
      roleId: validRoleId(candidate?.roleId) ? String(candidate.roleId) : detectedAccount.roleId,
      server: validServer(candidate?.server) ? candidate.server : detectedAccount.server,
      provider: candidate?.provider === "miyoushe" || candidate?.provider === "hoyolab"
        ? candidate.provider
        : detectedAccount.provider
    };

    if (!next.server && next.roleId) next.server = inferServer(next.roleId, "", next.provider);
    const changed = next.roleId !== detectedAccount.roleId
      || next.server !== detectedAccount.server
      || next.provider !== detectedAccount.provider;
    detectedAccount = next;
    notifyWaiters();

    if (changed && validRoleId(next.roleId) && validServer(next.server)) {
      chrome.runtime.sendMessage({ type: "ACCOUNT_DETECTED", account: accountPayload() }).catch(() => {});
    }
  }

  function scanDocumentSoon() {
    if (validRoleId(detectedAccount.roleId) && validServer(detectedAccount.server)) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => mergeAccount(accountFromDocument()), 120);
  }

  function waitForAccount(timeoutMs = 5_000) {
    mergeAccount(accountFromDocument());
    if (validRoleId(detectedAccount.roleId) && validServer(detectedAccount.server)) {
      return Promise.resolve(accountPayload());
    }

    return new Promise((resolve) => {
      const finish = (account) => {
        clearTimeout(timeout);
        waiters.delete(finish);
        resolve(account || accountPayload());
      };
      const timeout = setTimeout(() => finish(accountPayload()), timeoutMs);
      waiters.add(finish);
    });
  }

  function observeDocument() {
    if (!document.documentElement) {
      document.addEventListener("DOMContentLoaded", observeDocument, { once: true });
      return;
    }

    const observer = new MutationObserver(scanDocumentSoon);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-role-id", "data-uid", "data-game-uid"]
    });
    scanDocumentSoon();
  }

  function requestFromPage(payload) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("The Battle Record page did not finish the export within two minutes."));
      }, 120_000);

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
      }

      function onMessage(event) {
        if (event.source !== window || !event.data || event.data.requestId !== requestId) return;

        if (event.data.type === PROGRESS_TYPE) {
          chrome.runtime.sendMessage({
            type: "EXPORT_PROGRESS",
            completed: event.data.completed,
            total: event.data.total
          }).catch(() => {});
          return;
        }

        if (event.data.type !== RESPONSE_TYPE) return;
        cleanup();

        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error || "Battle Record export failed."));
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ type: REQUEST_TYPE, requestId, payload }, location.origin);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== ACCOUNT_OBSERVED_TYPE) return;
    mergeAccount(event.data.account);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "DETECT_ACCOUNT") {
      mergeAccount(accountFromDocument());
      sendResponse({ ok: true, account: accountPayload() });
      return false;
    }

    if (message?.type === "WAIT_FOR_ACCOUNT") {
      waitForAccount(message.timeoutMs)
        .then((account) => sendResponse({ ok: true, account }));
      return true;
    }

    if (message?.type === "RUN_GOOD_EXPORT") {
      requestFromPage(message.payload)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  observeDocument();
  chrome.runtime.sendMessage({ type: "CONTENT_READY" }).catch(() => {});
})();
