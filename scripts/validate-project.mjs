import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const optimizerConfig = JSON.parse(await readFile(path.join(root, "config/genshin-optimizer.json"), "utf8"));
const gameData = await import(pathToFileURL(path.join(root, "src/data/game-data.js")));

if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Manifest version must be semver-like");
if (packageJson.version !== manifest.version) throw new Error("package.json and manifest.json versions must match");

if (optimizerConfig.repository !== "frzyc/genshin-optimizer") {
  throw new Error("The canonical game-data repository must remain frzyc/genshin-optimizer");
}
if (!/^\d+\.\d+\.\d+$/.test(optimizerConfig.revision)) {
  throw new Error("The Genshin Optimizer dependency must be pinned to a stable release tag");
}
if (gameData.GENSHIN_OPTIMIZER_REVISION !== optimizerConfig.revision) {
  throw new Error("Generated game data does not match the pinned Genshin Optimizer revision");
}
if (JSON.stringify(gameData.TALENT_LIMITS) !== JSON.stringify([1, 1, 2, 4, 6, 8, 10])) {
  throw new Error(`Unexpected canonical talent limits: ${JSON.stringify(gameData.TALENT_LIMITS)}`);
}

const talentSlots = new Set(["auto", "skill", "burst"]);
for (const [key, boosts] of Object.entries(gameData.CONSTELLATION_TALENT_BOOSTS)) {
  if (JSON.stringify(Object.keys(boosts).sort()) !== JSON.stringify(["3", "5"])) {
    throw new Error(`${key} must have exactly one C3 and one C5 talent boost`);
  }
  for (const [constellation, boost] of Object.entries(boosts)) {
    if (!talentSlots.has(boost.slot) || boost.amount !== 3) {
      throw new Error(`${key} C${constellation} has an invalid talent boost`);
    }
  }
}

for (const key of new Set(Object.values(gameData.CHARACTER_ID_MAP))) {
  if (["Aloy", "TravelerF", "TravelerM"].includes(key)) continue;
  if (!gameData.CONSTELLATION_TALENT_BOOSTS[key]) {
    throw new Error(`Missing constellation talent metadata for ${key}`);
  }
}
if (!Object.keys(gameData.CONSTELLATION_TALENT_BOOSTS).some((key) => key.startsWith("Traveler"))) {
  throw new Error("Traveler constellation talent metadata is missing");
}

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

console.log(`Manifest ${manifest.version}, GO ${optimizerConfig.revision}, canonical talent data, and ${referencedFiles.length} referenced files are valid.`);
