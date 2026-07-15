import assert from "node:assert/strict";
import test from "node:test";

import { __test, convertHoYoLabToGOOD } from "../src/lib/convert.js";

const raw = {
  role: { role_id: "865142777", server: "os_asia" },
  exportedAt: "2026-07-15T10:00:00.000Z",
  characters: [
    {
      id: 10000122,
      name: "Nefer",
      level: 90,
      element: "Grass",
      actived_constellation_num: 1
    }
  ],
  details: [
    {
      id: 10000122,
      data: {
        property_map: {
          "1001": { name: "HP" },
          "1002": { name: "HP" },
          "1003": { name: "CRIT DMG" },
          "1004": { name: "CRIT Rate" },
          "1005": { name: "Elemental Mastery" }
        },
        list: [{
          base: {
            id: 10000122,
            name: "Nefer",
            level: 90,
            max_level: 90,
            element: "Grass",
            actived_constellation_num: 1
          },
          skills: [
            { skill_type: 1, level: 8, is_unlock: true },
            { skill_type: 1, level: 11, base_level: 8, is_unlock: true, is_enhanced: true, can_enhanced: true },
            { skill_type: 1, level: 10, is_unlock: true }
          ],
          weapon: {
            id: 14521,
            name: "Reliquary of Truth",
            level: 90,
            max_level: 90,
            affix_level: 1
          },
          relics: [
            {
              id: 20412,
              pos: 1,
              name: "Lamp of the Lost",
              level: 20,
              rarity: 5,
              main_property: { property_type: 1001, value: "4,780" },
              sub_property_list: [
                { property_type: 1002, value: "10.5%", times: 1 },
                { property_type: 1003, value: "28.0%", times: 3 },
                { property_type: 1004, value: "3.1%" },
                { property_type: 1005, value: "23" }
              ]
            }
          ]
        }]
      }
    }
  ]
};

test("converts a HoYoLAB equipped build to GOOD v3", () => {
  const { good, report } = convertHoYoLabToGOOD(raw);

  assert.equal(good.format, "GOOD");
  assert.equal(good.version, 3);
  assert.deepEqual(good.characters[0], {
    key: "Nefer",
    level: 90,
    constellation: 1,
    ascension: 6,
    talent: { auto: 8, skill: 8, burst: 10 }
  });
  assert.deepEqual(good.weapons[0], {
    key: "ReliquaryOfTruth",
    level: 90,
    ascension: 6,
    refinement: 1,
    location: "Nefer",
    lock: false
  });
  assert.deepEqual(good.artifacts[0], {
    setKey: "DeepwoodMemories",
    slotKey: "flower",
    level: 20,
    rarity: 5,
    mainStatKey: "hp",
    location: "Nefer",
    lock: false,
    substats: [
      { key: "hp_", value: 10.5 },
      { key: "critDMG_", value: 28 },
      { key: "critRate_", value: 3.1 },
      { key: "eleMas", value: 23 }
    ],
    totalRolls: 8
  });
  assert.deepEqual(report.counts, { characters: 1, artifacts: 1, weapons: 1 });
});

test("maps stat types and formatted values", () => {
  assert.equal(__test.statKey({ property_type: "FIGHT_PROP_CHARGE_EFFICIENCY" }), "enerRech_");
  assert.equal(__test.parseStatValue("+19.4%"), 19.4);
  assert.equal(__test.parseStatValue("4,780"), 4780);
});

test("reports ambiguous level-cap ascension", () => {
  const warnings = [];
  const warn = { add: (...args) => warnings.push(args) };
  assert.equal(__test.ascensionFrom({}, 80, "Weapon", warn, { id: 1 }), 5);
  assert.equal(warnings[0][0], "ambiguous-ascension");
});
