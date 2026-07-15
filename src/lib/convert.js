import {
  ARTIFACT_PIECE_SET_ID_MAP,
  ARTIFACT_SET_ID_MAP,
  CHARACTER_ID_MAP,
  CONSTELLATION_TALENT_BOOSTS,
  TALENT_LIMITS,
  WEAPON_ID_MAP
} from "../data/game-data.js";

const SLOT_MAP = {
  1: "flower",
  2: "plume",
  3: "sands",
  4: "goblet",
  5: "circlet",
  EQUIP_BRACER: "flower",
  EQUIP_NECKLACE: "plume",
  EQUIP_SHOES: "sands",
  EQUIP_RING: "goblet",
  EQUIP_DRESS: "circlet",
  flower: "flower",
  plume: "plume",
  sands: "sands",
  goblet: "goblet",
  circlet: "circlet"
};

const ELEMENT_MAP = {
  fire: "Pyro",
  pyro: "Pyro",
  grass: "Dendro",
  dendro: "Dendro",
  electric: "Electro",
  electro: "Electro",
  wind: "Anemo",
  anemo: "Anemo",
  ice: "Cryo",
  cryo: "Cryo",
  water: "Hydro",
  hydro: "Hydro",
  rock: "Geo",
  geo: "Geo"
};

const STAT_TYPE_MAP = {
  FIGHT_PROP_HP: "hp",
  FIGHT_PROP_HP_PERCENT: "hp_",
  FIGHT_PROP_ATTACK: "atk",
  FIGHT_PROP_ATTACK_PERCENT: "atk_",
  FIGHT_PROP_DEFENSE: "def",
  FIGHT_PROP_DEFENSE_PERCENT: "def_",
  FIGHT_PROP_CRITICAL: "critRate_",
  FIGHT_PROP_CRITICAL_HURT: "critDMG_",
  FIGHT_PROP_CHARGE_EFFICIENCY: "enerRech_",
  FIGHT_PROP_ELEMENT_MASTERY: "eleMas",
  FIGHT_PROP_HEAL_ADD: "heal_",
  FIGHT_PROP_PHYSICAL_ADD_HURT: "physical_dmg_",
  FIGHT_PROP_FIRE_ADD_HURT: "pyro_dmg_",
  FIGHT_PROP_WATER_ADD_HURT: "hydro_dmg_",
  FIGHT_PROP_GRASS_ADD_HURT: "dendro_dmg_",
  FIGHT_PROP_ELEC_ADD_HURT: "electro_dmg_",
  FIGHT_PROP_WIND_ADD_HURT: "anemo_dmg_",
  FIGHT_PROP_ICE_ADD_HURT: "cryo_dmg_",
  FIGHT_PROP_ROCK_ADD_HURT: "geo_dmg_"
};

const STAT_NAME_MAP = new Map([
  ["hp", "hp"],
  ["hppercent", "hp_"],
  ["atk", "atk"],
  ["attack", "atk"],
  ["atkpercent", "atk_"],
  ["attackpercent", "atk_"],
  ["def", "def"],
  ["defense", "def"],
  ["defpercent", "def_"],
  ["defensepercent", "def_"],
  ["critrate", "critRate_"],
  ["critdmg", "critDMG_"],
  ["criticaldamage", "critDMG_"],
  ["energyrecharge", "enerRech_"],
  ["elementalmastery", "eleMas"],
  ["healingbonus", "heal_"],
  ["physicaldmgbonus", "physical_dmg_"],
  ["pyrodmgbonus", "pyro_dmg_"],
  ["hydrodmgbonus", "hydro_dmg_"],
  ["dendrodmgbonus", "dendro_dmg_"],
  ["electrodmgbonus", "electro_dmg_"],
  ["anemodmgbonus", "anemo_dmg_"],
  ["cryodmgbonus", "cryo_dmg_"],
  ["geodmgbonus", "geo_dmg_"]
]);

const characterKeys = new Set(Object.values(CHARACTER_ID_MAP));
const weaponKeys = new Set(Object.values(WEAPON_ID_MAP));
const artifactSetKeys = new Set(Object.values(ARTIFACT_SET_ID_MAP));

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function buildNormalizedIndex(keys) {
  return new Map([...keys].map((key) => [normalizeName(key), key]));
}

const characterNameIndex = buildNormalizedIndex(characterKeys);
const weaponNameIndex = buildNormalizedIndex(weaponKeys);
const artifactSetNameIndex = buildNormalizedIndex(artifactSetKeys);

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(finiteNumber(value, fallback));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseStatValue(value) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace(/[,+%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function warningCollector() {
  const warnings = [];
  const seen = new Set();

  return {
    warnings,
    add(code, message, context = {}, deduplicate = false) {
      const identity = deduplicate ? code : `${code}:${JSON.stringify(context)}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      if (warnings.length < 250) warnings.push({ code, message, context });
    }
  };
}

function detailRecord(detailEntry) {
  const data = detailEntry?.data;
  if (!data) return null;
  if (Array.isArray(data.list)) return data.list[0] || null;
  return data;
}

function characterId(record, listCharacter) {
  return String(firstDefined(
    record?.base?.id,
    record?.id,
    record?.avatar_id,
    listCharacter?.id,
    listCharacter?.avatar_id,
    ""
  ));
}

function elementOf(record, listCharacter) {
  const raw = firstDefined(
    record?.base?.element,
    record?.element,
    listCharacter?.element,
    ""
  );
  return ELEMENT_MAP[String(raw).toLowerCase()] || "";
}

function characterKey(record, listCharacter, warn) {
  const id = characterId(record, listCharacter);
  let key = CHARACTER_ID_MAP[id];
  const name = firstDefined(record?.base?.name, record?.name, listCharacter?.name);

  if (!key && name) key = characterNameIndex.get(normalizeName(name));
  if (!key) {
    warn.add("unknown-character", "Skipped a character that is not in the bundled GOOD key map.", { id, name });
    return "";
  }

  if (key === "Traveler" || key === "TravelerM" || key === "TravelerF") {
    const element = elementOf(record, listCharacter);
    if (!element) {
      warn.add("traveler-element", "Traveler element was unavailable; TravelerAnemo was used.", { id });
      return "TravelerAnemo";
    }
    return `Traveler${element}`;
  }

  return key;
}

function equipmentLocation(key) {
  return key.startsWith("Traveler") ? "Traveler" : key;
}

function ascensionFrom(record, level, kind, warn, context) {
  const explicit = firstDefined(record?.ascension, record?.promote_level, record?.promoteLevel);
  if (explicit !== undefined) return clamp(integer(explicit), 0, 6);

  const maxLevel = integer(firstDefined(record?.max_level, record?.maxLevel, record?.level_cap), 0);
  const caps = [20, 40, 50, 60, 70, 80, 90];
  const capIndex = caps.indexOf(maxLevel);
  if (capIndex >= 0) return capIndex;

  const minimum = level <= 20 ? 0
    : level <= 40 ? 1
      : level <= 50 ? 2
        : level <= 60 ? 3
          : level <= 70 ? 4
            : level <= 80 ? 5
              : 6;

  if ([20, 40, 50, 60, 70, 80].includes(level)) {
    warn.add(
      "ambiguous-ascension",
      `${kind} ascension was not returned at a level-cap boundary; the minimum valid ascension was used.`,
      context
    );
  }
  return minimum;
}

function constellationTalentBoost(characterKey, constellation, slot) {
  return Object.entries(CONSTELLATION_TALENT_BOOSTS[characterKey] || {})
    .filter(([required, boost]) => constellation >= Number(required) && boost.slot === slot)
    .reduce((sum, [, boost]) => sum + boost.amount, 0);
}

function skillLevel(skill, characterKey, constellation, ascension, slot, warn, context) {
  const cap = TALENT_LIMITS[ascension] ?? TALENT_LIMITS[TALENT_LIMITS.length - 1];
  const explicitBase = firstDefined(skill?.base_level, skill?.original_level, skill?.level_before_enhanced);
  if (explicitBase !== undefined) return clamp(integer(explicitBase, 1), 1, cap);

  let level = clamp(integer(skill?.level, 1), 1, 15);
  const boost = constellationTalentBoost(characterKey, constellation, slot);
  if (boost) {
    const displayedLevel = level;
    level -= boost;
    warn.add(
      "talent-inference",
      "A constellation-enhanced displayed talent level was converted back to its invested level.",
      { ...context, displayedLevel, constellation, boost }
    );
  }
  return clamp(level, 1, cap);
}

function talentsFrom(record, characterKey, constellation, ascension, warn, context) {
  const skills = Array.isArray(record?.skills) ? record.skills : [];
  let active = skills.filter((skill) => Number(skill?.skill_type) === 1 && skill?.is_unlock !== false);
  if (active.length < 3) active = skills.filter((skill) => skill?.can_enhanced && skill?.is_unlock !== false);
  if (active.length < 3) active = skills.filter((skill) => skill?.is_unlock !== false);

  if (active.length < 3) {
    warn.add("missing-talents", "Some talent levels were unavailable and defaulted to 1.", context);
  }

  return {
    auto: skillLevel(active[0], characterKey, constellation, ascension, "auto", warn, { ...context, talent: "auto" }),
    skill: skillLevel(active[1], characterKey, constellation, ascension, "skill", warn, { ...context, talent: "skill" }),
    burst: skillLevel(active[2], characterKey, constellation, ascension, "burst", warn, { ...context, talent: "burst" })
  };
}

function constellationFrom(base, record, listCharacter) {
  const explicit = firstDefined(
    base?.actived_constellation_num,
    base?.constellation,
    record?.actived_constellation_num,
    listCharacter?.actived_constellation_num,
    listCharacter?.constellation
  );
  if (explicit !== undefined) return clamp(integer(explicit), 0, 6);

  const constellations = Array.isArray(record?.constellations) ? record.constellations : [];
  return clamp(constellations.filter((item) => item?.is_actived || item?.is_unlocked).length, 0, 6);
}

function statKey(property, propertyMap = {}) {
  const type = firstDefined(property?.property_type, property?.type, property?.key, "");
  if (STAT_TYPE_MAP[type]) return STAT_TYPE_MAP[type];

  const descriptor = propertyMap[type] || propertyMap[String(type)] || {};
  const name = firstDefined(
    property?.name,
    property?.filter_name,
    property?.property_name,
    descriptor?.name,
    descriptor?.filter_name,
    descriptor?.property_name,
    type
  );
  const normalized = normalizeName(name)
    .replace("percentage", "percent")
    .replace("bonus", "bonus");
  const mapped = STAT_NAME_MAP.get(normalized) || "";
  const renderedValue = String(firstDefined(property?.value, property?.final, property?.amount, ""));
  if (renderedValue.includes("%") && mapped === "hp") return "hp_";
  if (renderedValue.includes("%") && mapped === "atk") return "atk_";
  if (renderedValue.includes("%") && mapped === "def") return "def_";
  return mapped;
}

function artifactSetKey(artifact) {
  const pieceId = String(firstDefined(artifact?.id, artifact?.reliquary_id, ""));
  const setId = String(firstDefined(
    artifact?.set_id,
    artifact?.reliquary_set_id,
    artifact?.set?.id,
    artifact?.set?.set_id,
    ARTIFACT_PIECE_SET_ID_MAP[pieceId],
    ""
  ));

  if (ARTIFACT_SET_ID_MAP[setId]) return ARTIFACT_SET_ID_MAP[setId];

  const setName = firstDefined(
    artifact?.set_name,
    artifact?.reliquary_set_name,
    artifact?.set?.name,
    ""
  );
  return artifactSetNameIndex.get(normalizeName(setName)) || "";
}

function artifactSlot(artifact) {
  const slot = firstDefined(artifact?.pos, artifact?.slot, artifact?.equip_type, artifact?.slotKey);
  return SLOT_MAP[slot] || SLOT_MAP[String(slot)] || "";
}

function convertArtifact(artifact, location, propertyMap, warn, characterContext) {
  const setKey = artifactSetKey(artifact);
  const slotKey = artifactSlot(artifact);
  const mainProperty = artifact?.main_property || artifact?.mainProperty || {};
  const mainStatKey = statKey(mainProperty, propertyMap);
  const context = { ...characterContext, artifactId: artifact?.id, artifactName: artifact?.name };

  if (!setKey || !slotKey || !mainStatKey) {
    warn.add("invalid-artifact", "Skipped an artifact with an unknown set, slot, or main stat.", {
      ...context,
      setKey,
      slotKey,
      propertyType: mainProperty?.property_type
    });
    return null;
  }

  const rawSubstats = artifact?.sub_property_list || artifact?.substats || [];
  const substats = [];
  for (const property of rawSubstats) {
    const key = statKey(property, propertyMap);
    if (!key) {
      warn.add("unknown-stat", "Skipped an artifact substat with an unknown stat key.", {
        ...context,
        propertyType: property?.property_type,
        name: property?.name
      });
      continue;
    }
    substats.push({
      key,
      value: parseStatValue(firstDefined(property?.value, property?.final, property?.amount, 0))
    });
  }

  const converted = {
    setKey,
    slotKey,
    level: clamp(integer(artifact?.level), 0, 20),
    rarity: clamp(integer(artifact?.rarity, 5), 1, 5),
    mainStatKey,
    location,
    lock: false,
    substats
  };

  const enhancementRolls = rawSubstats.reduce(
    (sum, property) => sum + Math.max(0, integer(firstDefined(property?.times, property?.rolls, 0))),
    0
  );
  const totalRolls = rawSubstats.length + enhancementRolls;
  if (converted.rarity === 5 && totalRolls >= 3 && totalRolls <= 9) converted.totalRolls = totalRolls;

  return converted;
}

function convertWeapon(weapon, location, warn, characterContext) {
  if (!weapon || !firstDefined(weapon.id, weapon.weapon_id, weapon.name)) return null;

  const id = String(firstDefined(weapon.id, weapon.weapon_id, ""));
  const name = weapon.name;
  const key = WEAPON_ID_MAP[id] || weaponNameIndex.get(normalizeName(name));
  if (!key) {
    warn.add("unknown-weapon", "Skipped a weapon that is not in the bundled GOOD key map.", {
      ...characterContext,
      weaponId: id,
      weaponName: name
    });
    return null;
  }

  const level = clamp(integer(weapon.level, 1), 1, 90);
  return {
    key,
    level,
    ascension: ascensionFrom(weapon, level, "Weapon", warn, { ...characterContext, weaponId: id, weaponName: name }),
    refinement: clamp(integer(firstDefined(weapon.affix_level, weapon.refinement, weapon.rank_level, 1), 1), 1, 5),
    location,
    lock: false
  };
}

export function convertHoYoLabToGOOD(raw) {
  const warn = warningCollector();
  const detailById = new Map((raw?.details || []).map((entry) => [String(entry.id), entry]));
  const characters = [];
  const artifacts = [];
  const weapons = [];

  warn.add(
    "lock-state-unavailable",
    "HoYoLAB does not expose lock state; equipped artifacts and weapons were exported with lock=false.",
    {},
    true
  );
  warn.add(
    "equipped-only",
    "HoYoLAB exposes equipped artifacts and weapons only; unequipped inventory is not included.",
    {},
    true
  );

  for (const listCharacter of raw?.characters || []) {
    const listId = String(firstDefined(listCharacter?.id, listCharacter?.avatar_id, ""));
    const detailEntry = detailById.get(listId);
    const record = detailRecord(detailEntry) || listCharacter;
    const propertyMap = detailEntry?.data?.property_map || record?.property_map || {};
    const base = record?.base || record;
    const key = characterKey(record, listCharacter, warn);
    if (!key) continue;

    const context = { characterId: listId, characterKey: key };
    const level = clamp(integer(firstDefined(base?.level, record?.level, listCharacter?.level, 1), 1), 1, 100);
    const location = equipmentLocation(key);
    const constellation = constellationFrom(base, record, listCharacter);
    const ascension = ascensionFrom(base, level, "Character", warn, context);

    if (detailEntry?.error) {
      warn.add("character-detail-failed", "Character detail could not be fetched; equipment may be missing.", {
        ...context,
        error: detailEntry.error
      });
    }

    characters.push({
      key,
      level,
      constellation,
      ascension,
      talent: talentsFrom(record, key, constellation, ascension, warn, context)
    });

    const weapon = convertWeapon(record?.weapon || base?.weapon, location, warn, context);
    if (weapon) weapons.push(weapon);

    const relics = record?.relics || record?.reliquaries || base?.relics || base?.reliquaries || [];
    for (const artifact of relics) {
      const converted = convertArtifact(artifact, location, propertyMap, warn, context);
      if (converted) artifacts.push(converted);
    }
  }

  const good = {
    format: "GOOD",
    version: 3,
    source: "HoYoLAB GOOD Exporter 0.3.5",
    characters,
    artifacts,
    weapons
  };

  return {
    good,
    report: {
      exportedAt: raw?.exportedAt || new Date().toISOString(),
      roleId: raw?.role?.role_id || "",
      server: raw?.role?.server || "",
      counts: {
        characters: characters.length,
        artifacts: artifacts.length,
        weapons: weapons.length
      },
      warnings: warn.warnings
    }
  };
}

export const __test = {
  artifactSetKey,
  artifactSlot,
  ascensionFrom,
  constellationTalentBoost,
  parseStatValue,
  statKey
};
