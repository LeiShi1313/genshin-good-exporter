import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));

if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Manifest version must be semver-like");

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((entry) => entry.js),
  ...Object.values(manifest.icons || {})
];

for (const relativePath of referencedFiles) await access(path.join(root, relativePath));

const pageBridge = await readFile(path.join(root, "src/page-bridge.js"), "utf8");
if (!pageBridge.includes("/genshin/api/character/list")) throw new Error("Character list endpoint is missing");
if (!pageBridge.includes("/genshin/api/character/detail")) throw new Error("Character detail endpoint is missing");
if (!pageBridge.includes("https://api-takumi-record.mihoyo.com/game_record")) {
  throw new Error("The 米游社 China API adapter is missing");
}
if (!pageBridge.includes("cn_gf01") || !pageBridge.includes("cn_qd01")) {
  throw new Error("The Mainland China server identifiers are missing");
}

const mainWorldScript = manifest.content_scripts.find((entry) => entry.world === "MAIN");
if (!mainWorldScript || mainWorldScript.run_at !== "document_start") {
  throw new Error("The Battle Record request observer must run in the MAIN world at document_start");
}
if (manifest.action.default_state !== "enabled") {
  throw new Error("The toolbar action must remain clickable so it can offer export-page redirects");
}

console.log(`Manifest ${manifest.version} and ${referencedFiles.length} referenced files are valid.`);
