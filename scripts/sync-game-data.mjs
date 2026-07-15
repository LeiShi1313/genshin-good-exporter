import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const localSource = process.env.GO_SOURCE_DIR;
const revision = process.env.GO_REVISION || "master";
const rawBase = `https://raw.githubusercontent.com/frzyc/genshin-optimizer/${revision}`;

const sources = {
  character: "libs/gi/dm/src/mapping/character.ts",
  weapon: "libs/gi/dm/src/mapping/weapon.ts",
  artifact: "libs/gi/dm/src/mapping/artifact.ts",
  artifactPieces: "libs/gi/dm/src/dm/artifact/ReliquaryExcelConfigData_idmap_gen.json"
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

const [characterSource, weaponSource, artifactSource, artifactPiecesSource] = await Promise.all([
  load(sources.character),
  load(sources.weapon),
  load(sources.artifact),
  load(sources.artifactPieces)
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

const generated = `// Generated from frzyc/genshin-optimizer. Do not edit by hand.\n` +
  `// Run \`npm run sync-data\` to refresh these canonical GOOD mappings.\n\n` +
  `export const CHARACTER_ID_MAP = ${JSON.stringify(characterMap, null, 2)};\n\n` +
  `export const WEAPON_ID_MAP = ${JSON.stringify(weaponMap, null, 2)};\n\n` +
  `export const ARTIFACT_SET_ID_MAP = ${JSON.stringify(artifactSetMap, null, 2)};\n\n` +
  `export const ARTIFACT_PIECE_SET_ID_MAP = ${JSON.stringify(pieceSetMap, null, 2)};\n`;

await mkdir(path.join(root, "src/data"), { recursive: true });
await writeFile(path.join(root, "src/data/game-data.js"), generated);
console.log(`Generated ${Object.keys(characterMap).length} characters, ${Object.keys(weaponMap).length} weapons, ${Object.keys(artifactSetMap).length} artifact sets, and ${Object.keys(pieceSetMap).length} artifact pieces.`);
