# Privacy Policy for Genshin GOOD Exporter

Effective date: July 15, 2026

Genshin GOOD Exporter converts the Genshin Impact character and equipment data available in a user's HoYoLAB or 米游社 Battle Record into a GOOD v3 JSON file. The extension performs this work in the user's browser and does not operate a developer-controlled server.

## Data the extension handles

When the user opens a supported Battle Record page or starts an export, the extension may handle:

- the active supported page's URL;
- the user's Genshin UID and server region;
- Genshin character, weapon, artifact, and related Battle Record data returned by HoYoLAB or 米游社; and
- an export report containing item counts and conversion warnings.

The extension does not request Chrome's cookie permission and does not read, collect, or export account passwords or browser cookies. Requests to the Battle Record services use the login session that the supported first-party page already has.

## How data is used

The extension uses this data only to detect the selected Genshin account, request its Battle Record, convert the equipped builds to GOOD v3, download the resulting JSON file, and display an export report.

The most recent export report is stored in Chrome's extension-local storage on the user's device. The exported GOOD JSON file remains in the location selected by the user. The developer does not receive or retain either file.

## Data sharing and transfers

The extension communicates only with the supported first-party HoYoLAB and 米游社/miHoYo Battle Record pages and APIs listed in its manifest. It does not send user data, analytics, or browsing activity to the developer, advertising networks, or other third parties. It does not sell user data or use data for advertising, creditworthiness, lending, or any purpose unrelated to the export feature.

## Retention and deletion

Because the developer does not receive user data, the developer has no server-side user data to retain or delete. Users can remove the locally stored export report by clearing the extension's data or uninstalling the extension. Users control and may delete exported JSON files through their operating system.

## Permissions

The extension requests only the browser and site access needed for its export workflow:

- `activeTab` identifies the supported page the user is actively using.
- `scripting` starts the bundled page integration on supported tabs, including tabs that were open before installation or an extension update.
- `downloads` saves the user-requested GOOD JSON export.
- `storage` keeps the latest export report locally on the user's device.
- The listed HoYoLAB, 米游社, and miHoYo host permissions allow account detection and first-party Battle Record requests only on the supported services.

The extension does not execute remotely hosted code. All executable code is included in the extension package.

## Limited Use

The extension's use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the extension's single, user-facing export purpose.

## Changes to this policy

If the extension's data practices change, this policy and the Chrome Web Store disclosures will be updated before those changes are released.

## Contact

For privacy questions or support, open an issue in the [Genshin GOOD Exporter GitHub repository](https://github.com/LeiShi1313/genshin-good-exporter/issues).
