(() => {
  if (window.__HOYOLAB_GOOD_BRIDGE_INSTALLED__) return;
  window.__HOYOLAB_GOOD_BRIDGE_INSTALLED__ = true;

  const REQUEST_TYPE = "HOYOLAB_GOOD_REQUEST";
  const RESPONSE_TYPE = "HOYOLAB_GOOD_RESPONSE";
  const PROGRESS_TYPE = "HOYOLAB_GOOD_PROGRESS";
  const DEVICE_ID = crypto.randomUUID();
  const CHINA_DS_SALT = "h8w582wxwgqvahcdkpvdhbh2w9casgfl";
  const CHINA_TOOL_VERSION = "v6.7.2-gr-cn";

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function leftRotate(value, amount) {
    return (value << amount) | (value >>> (32 - amount));
  }

  // Chrome Web Crypto intentionally does not expose MD5. 米游社's official web
  // client still uses MD5 for its non-secret, per-request DS compatibility header.
  function md5(input) {
    const bytes = new TextEncoder().encode(input);
    const words = [];
    for (let index = 0; index < bytes.length; index += 1) {
      words[index >> 2] = (words[index >> 2] || 0) | (bytes[index] << ((index % 4) * 8));
    }
    words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | (0x80 << ((bytes.length % 4) * 8));
    const lengthIndex = (((bytes.length + 8) >> 6) + 1) * 16;
    while (words.length < lengthIndex) words.push(0);
    words[lengthIndex - 2] = bytes.length * 8;

    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    const constants = Array.from({ length: 64 }, (_, index) =>
      Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32));

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let offset = 0; offset < words.length; offset += 16) {
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let round = 0; round < 64; round += 1) {
        let value;
        let wordIndex;
        if (round < 16) {
          value = (b & c) | (~b & d);
          wordIndex = round;
        } else if (round < 32) {
          value = (d & b) | (~d & c);
          wordIndex = (5 * round + 1) % 16;
        } else if (round < 48) {
          value = b ^ c ^ d;
          wordIndex = (3 * round + 5) % 16;
        } else {
          value = c ^ (b | ~d);
          wordIndex = (7 * round) % 16;
        }

        const nextD = d;
        d = c;
        c = b;
        b = (b + leftRotate((a + value + constants[round] + (words[offset + wordIndex] || 0)) | 0, shifts[round])) | 0;
        a = nextD;
      }

      a0 = (a0 + a) | 0;
      b0 = (b0 + b) | 0;
      c0 = (c0 + c) | 0;
      d0 = (d0 + d) | 0;
    }

    return [a0, b0, c0, d0]
      .flatMap((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")))
      .join("");
  }

  function chinaDs() {
    const timestamp = Math.floor(Date.now() / 1000);
    const random = Math.floor(Math.random() * 100000) + 100000;
    const checksum = md5(`salt=${CHINA_DS_SALT}&t=${timestamp}&r=${random}`);
    return `${timestamp},${random},${checksum}`;
  }

  function requestProfile(provider) {
    if (provider === "miyoushe") {
      return {
        name: "米游社",
        base: "https://api-takumi-record.mihoyo.com/game_record",
        headers: {
          DS: chinaDs(),
          "x-rpc-app_version": "2.3.0",
          "x-rpc-client_type": "5",
          "x-rpc-page": `${CHINA_TOOL_VERSION}_${location.hash.replace(/(\?.*|\/\?.*|\/$)/, "")}`,
          "x-rpc-tool_verison": CHINA_TOOL_VERSION
        }
      };
    }

    return {
      name: "HoYoLAB",
      base: "https://sg-act-public-api.hoyolab.com/event/game_record",
      headers: {
        "x-rpc-app_version": "1.5.0",
        "x-rpc-client_type": "5",
        "x-rpc-device_id": DEVICE_ID,
        "x-rpc-lang": "en-us",
        "x-rpc-language": "en-us",
        "x-rpc-page": "v6.7.1-gr-sea_#/ys/role/all",
        "x-rpc-platform": "4"
      }
    };
  }

  async function apiRequest(provider, path, data, attempt = 0) {
    let response;
    const profile = requestProfile(provider);

    try {
      response = await fetch(`${profile.base}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
          ...profile.headers
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      if (attempt < 2) {
        await sleep(500 * 2 ** attempt);
        return apiRequest(provider, path, data, attempt + 1);
      }
      throw error;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(700 * 2 ** attempt);
      return apiRequest(provider, path, data, attempt + 1);
    }

    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${profile.name} returned HTTP ${response.status}.`);
    if (!json) throw new Error(`${profile.name} returned an unreadable response.`);
    if (json.retcode !== 0) {
      if (provider === "miyoushe" && [-100, 10001].includes(json.retcode)) {
        throw new Error("米游社 is not signed in, or the login expired. Sign in on miyoushe.com and reopen 战绩. (-100)");
      }
      if (provider === "miyoushe" && json.retcode === 1034) {
        throw new Error("米游社 requires human verification (1034). Complete its Geetest challenge on the official 战绩 page, then retry; the extension cannot bypass this CAPTCHA.");
      }
      const message = json.message || `${profile.name} error ${json.retcode}`;
      throw new Error(`${message} (${json.retcode})`);
    }

    return json.data || {};
  }

  async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;

    async function worker() {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await mapper(items[index], index);
      }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  function characterId(character) {
    return Number(character?.id ?? character?.avatar_id ?? character?.base?.id ?? 0);
  }

  async function exportRawData({ roleId, server, provider }, requestId) {
    if (!/^\d{9,10}$/.test(String(roleId))) throw new Error("Enter a valid 9 or 10 digit Genshin UID.");
    if (!/^(os_usa|os_euro|os_asia|os_cht|cn_gf01|cn_qd01)$/.test(server)) throw new Error("Choose a valid Genshin server.");

    const selectedProvider = /^cn_/.test(server) ? "miyoushe" : provider === "miyoushe" ? "miyoushe" : "hoyolab";
    if (selectedProvider === "miyoushe" && !/^cn_/.test(server)) {
      throw new Error("Choose 天空岛 or 世界树 for a 米游社 export.");
    }
    if (selectedProvider === "hoyolab" && /^cn_/.test(server)) {
      throw new Error("China servers must be exported from 米游社.");
    }

    const role = { role_id: String(roleId), server };
    const listData = await apiRequest(selectedProvider, "/genshin/api/character/list", role);
    const characters = Array.isArray(listData.list) ? listData.list : [];

    if (!characters.length) {
      throw new Error("The Battle Record returned no characters. Check that character details are enabled for this account.");
    }

    let completed = 0;
    const details = await mapLimit(characters, 3, async (character) => {
      const id = characterId(character);
      let result;

      try {
        const data = await apiRequest(selectedProvider, "/genshin/api/character/detail", {
          ...role,
          character_ids: [id]
        });
        // Keep the complete response. Artifact property_type values can be numeric
        // and need the response-level property_map for GOOD stat conversion.
        result = { id, data };
      } catch (error) {
        result = { id, error: error.message };
      }

      completed += 1;
      window.postMessage({
        type: PROGRESS_TYPE,
        requestId,
        completed,
        total: characters.length
      }, location.origin);

      return result;
    });

    return {
      role,
      provider: selectedProvider,
      characters,
      details,
      exportedAt: new Date().toISOString()
    };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== REQUEST_TYPE) return;

    const { requestId, payload } = event.data;
    try {
      const result = await exportRawData(payload, requestId);
      window.postMessage({ type: RESPONSE_TYPE, requestId, ok: true, result }, location.origin);
    } catch (error) {
      window.postMessage({
        type: RESPONSE_TYPE,
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }, location.origin);
    }
  });
})();
