import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const bridgePath = path.resolve(import.meta.dirname, "../src/page-bridge.js");

test("China DS helper uses a correct MD5 implementation", async () => {
  const source = await readFile(bridgePath, "utf8");
  const instrumented = source
    .replace(
      "  function chinaDs() {",
      "  window.__BRIDGE_TEST__ = { md5 };\n\n  function chinaDs() {"
    )
    .replace(
      "  async function apiRequest(provider, path, data, attempt = 0) {",
      "  window.__BRIDGE_TEST__.requestProfile = requestProfile;\n\n  async function apiRequest(provider, path, data, attempt = 0) {"
    );
  const page = {
    addEventListener() {},
    crypto: { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    location: { origin: "https://www.miyoushe.com", hash: "#/ys" },
    postMessage() {},
    TextEncoder
  };
  page.window = page;

  vm.runInNewContext(instrumented, page);

  assert.equal(page.__BRIDGE_TEST__.md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(page.__BRIDGE_TEST__.md5("abc"), "900150983cd24fb0d6963f7d28e17f72");

  const china = page.__BRIDGE_TEST__.requestProfile("miyoushe");
  assert.equal(china.headers["x-rpc-page"], "v6.7.2-gr-cn_#/ys");
  assert.equal(china.headers["x-rpc-tool_verison"], "v6.7.2-gr-cn");
  assert.equal(china.headers["x-rpc-device_id"], "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(china.headers["x-rpc-device_fp"], "834a05833233b");
});
