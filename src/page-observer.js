(() => {
  const ACCOUNT_OBSERVED_TYPE = "HOYOLAB_GOOD_ACCOUNT_OBSERVED";
  const OBSERVER_VERSION = "0.3.3";
  const ALL_SERVERS = /^(os_usa|os_euro|os_asia|os_cht|cn_gf01|cn_qd01)$/;
  const CHINA_ROLE_URL = "https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn";

  function providerFrom(url, server = "") {
    if (/^cn_/.test(server) || /(?:miyoushe|mihoyo)\.com/.test(String(url || ""))) return "miyoushe";
    return "hoyolab";
  }

  function publish(account) {
    if (!account?.roleId || !account?.server) return;
    window.__HOYOLAB_GOOD_LAST_ACCOUNT__ = account;
    window.postMessage({ type: ACCOUNT_OBSERVED_TYPE, account }, location.origin);
  }

  if (window.__HOYOLAB_GOOD_OBSERVER_INSTALLED__ === OBSERVER_VERSION) {
    publish(window.__HOYOLAB_GOOD_LAST_ACCOUNT__);
    return;
  }
  window.__HOYOLAB_GOOD_OBSERVER_INSTALLED__ = OBSERVER_VERSION;

  function observeRoleResponse(json) {
    const roles = Array.isArray(json?.data?.list) ? json.data.list : [];
    const role = roles.find((item) => item?.is_chosen || item?.is_default) || roles[0];
    const roleId = String(role?.game_uid || role?.game_role_id || role?.role_id || "");
    const server = String(role?.region || role?.server || "");
    if (/^\d{9,10}$/.test(roleId) && /^(cn_gf01|cn_qd01)$/.test(server)) {
      publish({ roleId, server, provider: "miyoushe" });
    }
  }

  function parseBody(body) {
    if (!body) return null;
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return Object.fromEntries(new URLSearchParams(body));
      }
    }
    if (body instanceof URLSearchParams) return Object.fromEntries(body);
    return null;
  }

  function observeRequest(url, body) {
    if (!String(url || "").includes("/genshin/api/")) return;
    const data = parseBody(body);
    const roleId = String(data?.role_id || data?.uid || "");
    const server = String(data?.server || "");
    if (/^\d{9,10}$/.test(roleId) && ALL_SERVERS.test(server)) {
      publish({ roleId, server, provider: providerFrom(url, server) });
    }
  }

  const nativeFetch = window.fetch;
  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url;
    observeRequest(url, init?.body);
    const request = nativeFetch.apply(this, arguments);
    if (String(url || "").includes("/binding/api/getUserGameRolesByCookie")) {
      request
        .then((response) => response.clone().json())
        .then(observeRoleResponse)
        .catch(() => {});
    }
    return request;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  const requestUrls = new WeakMap();

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    requestUrls.set(this, String(url || ""));
    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const url = requestUrls.get(this);
    observeRequest(url, body);
    if (String(url || "").includes("/binding/api/getUserGameRolesByCookie")) {
      this.addEventListener("load", () => {
        try {
          observeRoleResponse(JSON.parse(this.responseText));
        } catch {
          // Ignore non-JSON and blocked login responses.
        }
      }, { once: true });
    }
    return nativeSend.apply(this, arguments);
  };

  async function discoverChinaRole() {
    if (location.hostname !== "webstatic.mihoyo.com"
      || !location.pathname.startsWith("/app/community-game-records")) return;

    try {
      const response = await nativeFetch(CHINA_ROLE_URL, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json, text/plain, */*" }
      });
      observeRoleResponse(await response.json());
    } catch {
      // The popup will retain manual UID/server inputs when the user is signed out.
    }
  }

  discoverChinaRole();
  setTimeout(discoverChinaRole, 1_500);
})();
