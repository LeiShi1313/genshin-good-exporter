# Genshin GOOD Exporter

A Manifest V3 Chrome extension that exports the characters and equipment visible in Genshin Impact's HoYoLAB or 米游社 Battle Record as [GOOD v3](https://frzyc.github.io/genshin-optimizer/#/doc) JSON.

## What it exports

- Characters: level, constellation, ascension, and combat talent levels.
- Equipped weapons: level, ascension, refinement, and character location.
- Equipped artifacts: set, slot, level, rarity, main stat, substats, roll count when available, and character location.

The official Battle Record APIs do not expose unequipped inventory, item lock state, material quantities, artifact favorite/crafted flags, or complete roll history. The extension produces a separate in-extension report for fields it inferred or could not obtain. It never adds nonstandard fields to the GOOD JSON.

## Install

1. Download the extension ZIP from the [latest GitHub release](https://github.com/LeiShi1313/genshin-good-exporter/releases/latest).
2. Extract the ZIP.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted `genshin-good-exporter` folder.

Chrome cannot load an unpacked extension directly from a ZIP; it must be extracted first.

## Install from source

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project directory.

No build step or third-party runtime dependencies are required.

## Use

1. Sign in and open either:
   - [HoYoLAB Genshin Battle Chronicle](https://act.hoyolab.com/app/community-game-records-sea/index.html#/ys) for global accounts.
   - [米游社 原神](https://www.miyoushe.com/ys/), then **游戏工具 → 战绩**, for Mainland China accounts.
2. Open the extension popup.
3. Confirm the detected UID and server.
4. Select **Export GOOD JSON** and choose where to save the file.
5. Import the downloaded JSON from Genshin Optimizer's database page.

The toolbar icon is gray on unrelated pages but remains clickable so the popup can link to an exportable HoYoLAB or 米游社 page. On a supported page it becomes colored and shows `GO`; once the game account is detected, the badge changes to `✓`.

The extension observes the role ID and server already attached to the site's own first-party API requests, with a visible-page fallback. On `miyoushe.com/ys/`, the icon activates and the popup links to the dedicated 战绩 page; export runs there so it can use the real Genshin UID and the correct first-party login context. The community UID is deliberately never treated as a Genshin UID. It automatically injects into supported tabs that were open before the extension was installed or reloaded, so a page refresh is normally not required. It does not request Chrome's cookie permission, read browser storage, transmit data to another service, or interact with the game client.

Supported server identifiers:

- 米游社: `cn_gf01` (天空岛 / official) and `cn_qd01` (世界树 / channel).
- HoYoLAB: `os_usa`, `os_euro`, `os_asia`, and `os_cht`.

## Development

```bash
npm test
npm run validate
npm run check
```

Canonical character, weapon, artifact-set, and artifact-piece mappings are generated from the current [Genshin Optimizer](https://github.com/frzyc/genshin-optimizer) source:

```bash
npm run sync-data
```

For an existing local optimizer checkout:

```bash
GO_SOURCE_DIR=/path/to/genshin-optimizer npm run sync-data
```

The pinned optimizer release is recorded in `config/genshin-optimizer.json`. Generation also extracts canonical ascension talent caps and each character's explicit C3/C5 `autoBoost`, `skillBoost`, or `burstBoost`. Exported talent levels therefore remove unlocked constellation `+3` bonuses; unrelated boost nodes such as Tartaglia's team Normal Attack `+1` are never mistaken for constellation upgrades.

The scheduled **Update Genshin Optimizer data** workflow checks for a newer stable GO release each day. It regenerates the data, requires every supported character to have an unambiguous C3 and C5 mapping, runs the complete test suite, and opens or updates a dependency PR. Unexpected upstream structures fail closed instead of producing guessed GOOD keys or talent levels.

Pushing a tag matching the manifest version, such as `v0.3.5`, runs the release workflow. It validates the project, packages only the runtime extension files, creates a SHA-256 checksum, and publishes both files to a GitHub release.

## Notes

- Battle Record endpoints and response fields are undocumented implementation details and may change.
- The 米游社 China adapter uses the same non-secret `DS` compatibility signature as the official web Battle Record page; it does not read or export cookies.
- At level-cap boundaries, ascension can be ambiguous if the API omits `max_level`; the exporter chooses the minimum valid ascension and reports it.
- When Battle Record returns an effective talent level, the exporter removes unlocked C3/C5 boosts using the pinned Genshin Optimizer character model and clamps the invested level to the character's ascension cap.
- The APIs do not expose lock state, so exported equipped items use `lock: false` and the report records this limitation.
