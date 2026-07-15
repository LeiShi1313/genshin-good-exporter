import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const localSource = process.env.GO_SOURCE_DIR;
const config = JSON.parse(await readFile(path.join(root, "config/genshin-optimizer.json"), "utf8"));
const revision = process.env.GO_REVISION || config.revision;
const rawBase = `https://raw.githubusercontent.com/frzyc/genshin-optimizer/${revision}`;

const sources = {
  character: "libs/gi/dm/src/mapping/character.ts",
  weapon: "libs/gi/dm/src/mapping/weapon.ts",
  artifact: "libs/gi/dm/src/mapping/artifact.ts",
  artifactPieces: "libs/gi/dm/src/dm/artifact/ReliquaryExcelConfigData_idmap_gen.json",
  characterConsts: "libs/gi/consts/src/character.ts",
  commonConsts: "libs/gi/consts/src/common.ts"
};

async function load(relativePath) {
  if (localSource) return readFile(path.join(localSource, relativePath), "utf8");
  const response = await fetch(`${rawBase}/${relativePath}`);
  if (!response.ok) throw new Error(`Unable to fetch ${relativePath}: HTTP ${response.status}`);
  return response.text();
}

function parseMap(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Could not find ${declaration}`);
  const body = source.slice(start, source.indexOf("} as const", start));
  return Object.fromEntries(
    [...body.matchAll(/^\s*(\d+):\s*['"]([^'"]+)['"]/gm)].map((match) => [match[1], match[2]])
  );
}

function parseStringArray(source, declaration) {
  const start = source.indexOf(`export const ${declaration} = [`);
  if (start < 0) throw new Error(`Could not find ${declaration}`);
  const end = source.indexOf("] as const", start);
  if (end < 0) throw new Error(`Could not find the end of ${declaration}`);
  return [...source.slice(start, end).matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function parseTalentLimits(source) {
  const match = source.match(/export const talentLimits = \[([^\]]+)\] as const/);
  if (!match) throw new Error("Could not find talentLimits");
  const limits = match[1].split(",").map((value) => Number(value.trim()));
  if (limits.length !== 7 || limits.some((value) => !Number.isInteger(value))) {
    throw new Error(`Invalid talentLimits: ${JSON.stringify(limits)}`);
  }
  return limits;
}

function parseConstellationTalentBoosts(source, characterKey) {
  const definitions = new Map(
    [...source.matchAll(/const\s+(\w+)\s*=\s*greaterEq\(\s*input\.constellation\s*,\s*([35])\s*,\s*(\d+)\s*\)/g)]
      .map((match) => [match[1], { constellation: Number(match[2]), amount: Number(match[3]) }])
  );
  const boosts = [];

  for (const match of source.matchAll(/^\s*(auto|skill|burst)Boost:\s*([^,\n]+)/gm)) {
    const definition = definitions.get(match[2].trim());
    if (definition) boosts.push({ slot: match[1], ...definition });
  }

  if (characterKey === "Aloy") {
    if (boosts.length) throw new Error("Aloy unexpectedly has constellation talent boosts");
    return null;
  }

  const result = {};
  for (const constellation of [3, 5]) {
    const matches = boosts.filter((boost) => boost.constellation === constellation);
    if (matches.length !== 1) {
      throw new Error(`${characterKey} C${constellation} matched ${matches.length} talent boosts`);
    }
    const [{ slot, amount }] = matches;
    if (amount !== 3) throw new Error(`${characterKey} C${constellation} has an unexpected +${amount} boost`);
    result[constellation] = { slot, amount };
  }
  return result;
}

const [
  characterSource,
  weaponSource,
  artifactSource,
  artifactPiecesSource,
  characterConstsSource,
  commonConstsSource
] = await Promise.all([
  load(sources.character),
  load(sources.weapon),
  load(sources.artifact),
  load(sources.artifactPieces),
  load(sources.characterConsts),
  load(sources.commonConsts)
]);

const characterMap = parseMap(characterSource, "characterIdMap");
const weaponMap = parseMap(weaponSource, "weaponIdMap");
const artifactSetMap = parseMap(artifactSource, "artifactIdMap");
const artifactPieces = JSON.parse(artifactPiecesSource);
const pieceSetMap = Object.fromEntries(
  Object.entries(artifactPieces)
    .filter(([, value]) => Array.isArray(value) && Number(value[0]) > 0 && artifactSetMap[String(value[0])])
    .map(([pieceId, value]) => [pieceId, String(value[0])])
);
const talentLimits = parseTalentLimits(commonConstsSource);
const nonTravelerKeys = parseStringArray(characterConstsSource, "nonTravelerCharacterKeys");
const travelerSheetKeys = parseStringArray(characterConstsSource, "travelerFKeys");
const characterSheetSources = [
  ...nonTravelerKeys.map((key) => ({
    key,
    path: `libs/gi/sheets/src/Characters/${key}/index.tsx`
  })),
  ...travelerSheetKeys.map((sheetKey) => {
    const key = sheetKey.slice(0, -1);
    const element = key.slice("Traveler".length).toLowerCase();
    return {
      key,
      path: `libs/gi/sheets/src/Characters/${sheetKey}/${element}.tsx`
    };
  })
];
const loadedCharacterSheets = await Promise.all(
  characterSheetSources.map(async (entry) => ({ ...entry, source: await load(entry.path) }))
);
const constellationTalentBoosts = Object.fromEntries(
  loadedCharacterSheets
    .map(({ key, source }) => [key, parseConstellationTalentBoosts(source, key)])
    .filter(([, boosts]) => boosts)
);

for (const key of new Set(Object.values(characterMap))) {
  if (key === "Aloy" || key === "TravelerF" || key === "TravelerM") continue;
  if (!constellationTalentBoosts[key]) throw new Error(`Missing constellation talent boosts for ${key}`);
}
for (const sheetKey of travelerSheetKeys) {
  const key = sheetKey.slice(0, -1);
  if (!constellationTalentBoosts[key]) throw new Error(`Missing constellation talent boosts for ${key}`);
}

const generated = `// Generated from frzyc/genshin-optimizer ${revision}. Do not edit by hand.\n` +
  `// Run \`npm run sync-data\` to refresh these canonical GOOD mappings.\n\n` +
  `export const GENSHIN_OPTIMIZER_REVISION = ${JSON.stringify(revision)};\n\n` +
  `export const TALENT_LIMITS = ${JSON.stringify(talentLimits)};\n\n` +
  `export const CONSTELLATION_TALENT_BOOSTS = ${JSON.stringify(constellationTalentBoosts, null, 2)};\n\n` +
  `export const CHARACTER_ID_MAP = ${JSON.stringify(characterMap, null, 2)};\n\n` +
  `export const WEAPON_ID_MAP = ${JSON.stringify(weaponMap, null, 2)};\n\n` +
  `export const ARTIFACT_SET_ID_MAP = ${JSON.stringify(artifactSetMap, null, 2)};\n\n` +
  `export const ARTIFACT_PIECE_SET_ID_MAP = ${JSON.stringify(pieceSetMap, null, 2)};\n`;

await mkdir(path.join(root, "src/data"), { recursive: true });
await writeFile(path.join(root, "src/data/game-data.js"), generated);
console.log(`Generated GO ${revision} data: ${Object.keys(characterMap).length} characters, ${Object.keys(constellationTalentBoosts).length} talent-boost records, ${Object.keys(weaponMap).length} weapons, ${Object.keys(artifactSetMap).length} artifact sets, and ${Object.keys(pieceSetMap).length} artifact pieces.`);
