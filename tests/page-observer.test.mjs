import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const observerPath = path.resolve(import.meta.dirname, "../src/page-observer.js");

test("detects the selected China Genshin role from 米游社's role-list response", async () => {
  const source = await readFile(observerPath, "utf8");
  const messages = [];
  const roleResponse = {
    retcode: 0,
    data: {
      list: [{
        game_biz: "hk4e_cn",
        game_uid: "123456789",
        region: "cn_gf01",
        nickname: "Traveler",
        level: 60,
        is_chosen: true
      }]
    }
  };

  class MockXMLHttpRequest {
    addEventListener() {}
    open() {}
    send() {}
  }

  const page = {
    location: {
      hostname: "webstatic.mihoyo.com",
      origin: "https://webstatic.mihoyo.com",
      pathname: "/app/community-game-records/"
    },
    fetch: async () => ({
      clone: () => ({ json: async () => roleResponse }),
      json: async () => roleResponse
    }),
    postMessage: (message) => messages.push(message),
    setTimeout: () => 0,
    URLSearchParams,
    WeakMap,
    XMLHttpRequest: MockXMLHttpRequest
  };
  page.window = page;

  vm.runInNewContext(source, page);
  await new Promise((resolve) => setImmediate(resolve));

  const detected = messages.find((message) => message.type === "HOYOLAB_GOOD_ACCOUNT_OBSERVED");
  assert.deepEqual(JSON.parse(JSON.stringify(detected.account)), {
    roleId: "123456789",
    server: "cn_gf01",
    provider: "miyoushe"
  });
});
