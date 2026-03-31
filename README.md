# EarthMC Dynmap+ Cross-Browser Fork

This repository is a maintained fork of EarthMC Dynmap+ with first-class support for both Chromium-based browsers and Firefox.

If you are new to browser extension development, the short version is:

1. Install Node.js.
2. Run `npm install`.
3. Build the extension with `npm run extension`.
4. Load the built extension from `dist/chromium/` or `dist/firefox/`.
5. Optionally run the live browser smoke tests with `npm run test:e2e` after reading `Automated tests` below.

## What this project does

This extension adds extra tools and map overlays to the EarthMC Dynmap website, including:

- extra map modes such as alliances and meganations
- archive mode for older claim data
- town, nation, and resident lookup
- extra sidebar controls
- country borders and chunk overlays
- screenshot support

The same shared source code is packaged for:

- Chromium-based browsers
- Firefox
- a userscript fallback

## Before you start

You need:

- Node.js 18 or newer
- npm
- at least one supported browser installed locally

If you only want to build the extension, that is enough.

If you also want to run the end-to-end browser tests, read the `Automated tests` section below because Chromium has one important setup rule.

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Build the extension

```bash
npm run extension
```

That creates:

- `dist/chromium/`
- `dist/firefox/`
- `dist/emc-dynmapplus-chromium.zip`
- `dist/emc-dynmapplus-firefox.xpi`

If you only want one browser target:

```bash
npm run extension:chromium
npm run extension:firefox
```

If you want the userscript:

```bash
npm run userscript
```

## Load the extension in your browser

### Chromium

1. Build the Chromium target with `npm run extension:chromium`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `dist/chromium` folder.

### Firefox

1. Build the Firefox target with `npm run extension:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select `dist/firefox/manifest.json`.

Note:

- Firefox temporary add-ons are removed when Firefox fully restarts.
- That is normal during local development.

## Build commands

Available scripts:

- `npm run userscript`
- `npm run extension`
- `npm run extension:chromium`
- `npm run extension:firefox`
- `npm run build`
- `npm run dedupe:borders:nostra`
- `npm run check:borders:duplicates`
- `npm run convert:borders:nostra -- <input.geojson> <output.json>`

What they do:

- `userscript`: builds `dist/emc-dynmapplus.user.js`
- `extension`: builds both browser targets
- `build`: builds both the userscript and both extension targets
- `dedupe:borders:nostra`: rebuilds `resources/borders.nostra.json` from raw GeoJSON sources and dedupes shared borders before simplification
- `check:borders:duplicates`: checks a generated borders file for exact duplicate entries and duplicate undirected edges
- `convert:borders:nostra`: converts a single lon/lat GeoJSON file into standalone Nostra borders JSON using Miller cylindrical projection

## Borders workflow

The Nostra border source of truth is the raw GeoJSON in `sources/geojson/`.

To rebuild the shipped Nostra borders resource:

```bash
npm run dedupe:borders:nostra
```

That command:

- loads every `.geojson` file in `sources/geojson/`
- applies optional excludes and renames from `sources/geojson/borders.config.json`
- dedupes shared raw borders before projection and simplification
- writes the final linework to `resources/borders.nostra.json`

Current raw inputs include:

- `sources/geojson/countries.geojson`
- `sources/geojson/us-states-and-territories.geojson`

Current config rules include:

- excluding `United States of America` and overlapping US territory entries from the country dataset
- renaming the US state `Georgia` to `Georgia (US State)` to avoid the country-name collision

To verify the generated file:

```bash
npm run check:borders:duplicates
```

This workflow is the fix for the old doubled-border issue seen on borders such as Switzerland. The important rule is: do not manually maintain `resources/borders.nostra.json` as the source of truth. Update the raw GeoJSON inputs and regenerate instead.

If you want to add more subdivision data later, drop another raw `.geojson` file into `sources/geojson/` and rerun the rebuild. Only update `sources/geojson/borders.config.json` when you need dataset-specific overrides such as replacing a parent country outline or resolving a name collision.

## Automated tests

The Selenium-based end-to-end tests live in `scripts/e2e/`.

These are live browser integration and smoke tests, not deterministic unit tests.

They exercise the built extension against real EarthMC pages and external services, so failures can come from browser setup, driver discovery, page changes, archive availability, or network issues in addition to extension regressions.

Main commands:

- `npm run test:e2e`
- `npm run test:e2e:chromium`
- `npm run test:e2e:firefox`
- `npm run test:e2e:archive`
- `npm run test:e2e:archive:chromium`
- `npm run test:e2e:archive:firefox`

Legacy compatibility aliases still work:

- `npm run check:archive:chromium`
- `npm run check:archive:firefox`

You can also call the runner directly:

```bash
node scripts/e2e/run.mjs --list
node scripts/e2e/run.mjs --browser chromium
node scripts/e2e/run.mjs --browser firefox --test archive
```

### Headless mode

By default, the e2e runner is headful.

To request headless mode for all selected browsers:

```bash
npm run test:e2e --headless
```

You can also use the direct runner form:

```bash
node scripts/e2e/run.mjs --headless
```

Important note:

- Firefox supports the new headless flag normally.
- Chromium extension tests are most reliable headful.
- On current Chrome/Chromium builds, headless extension behavior is not a reliable signal that the unpacked extension actually loaded.

### Chromium test requirement

This is the most important testing note in the whole repository:

Extension-based Selenium tests for Chromium do not work reliably with branded Google Chrome 137+ because those builds ignore `--load-extension`.

For Chromium e2e tests, use one of these instead:

- Chromium
- Chrome for Testing

The test launcher will automatically prefer:

1. explicit environment variable paths
2. installed Chromium
3. a local Chrome for Testing fallback under `.tools/`

If the launcher only finds branded Google Chrome, it now fails with a clear error instead of silently starting a browser without the extension loaded.

### Local `.tools/` fallback

The `.tools/` folder is for local browser binaries only.

It is intentionally gitignored and should not be committed.

If you want to use Chrome for Testing as a local fallback, place binaries like this:

```text
.tools/
  chrome-win64/
    chrome.exe
  chromedriver-win64/
    chromedriver.exe
```

That setup is especially useful on Windows if you do not have Chromium installed.

### Browser and driver prerequisites

Before running e2e tests:

1. Build the correct extension target first.
2. Make sure the browser exists locally.
3. Make sure the matching driver is already discoverable locally.

Examples:

- `npm run extension:chromium` before Chromium tests
- `npm run extension:firefox` before Firefox tests

Important details:

- Firefox currently requires a locally discoverable `geckodriver`. The launcher checks explicit env vars, some common Windows locations, the Selenium cache, and `PATH`, but it does not download `geckodriver` for you.
- Chromium tests expect a locally discoverable Chromium-compatible browser plus matching ChromeDriver. The launcher can use explicit env vars, common install locations, the Selenium cache, `.tools/`, or `PATH`.
- The launcher is Windows-first because several discovery paths and diagnostics are optimized for Windows installs. macOS/Linux runs are best-effort rather than heavily exercised.

### Environment variables

Browser paths:

- Chromium: `CHROMIUM_BINARY`, `CHROMIUM_BINARY_PATH`, `CHROME_BINARY`, `CHROME_BINARY_PATH`
- Firefox: `FIREFOX_BINARY`, `FIREFOX_BINARY_PATH`

Driver paths:

- Chromium: `CHROMEDRIVER`, `CHROMEDRIVER_PATH`
- Firefox: `GECKODRIVER`, `GECKODRIVER_PATH`

Optional test behavior:

- `CHROMIUM_HEADLESS=1` forces Chromium headless mode
- `FIREFOX_HEADLESS=1` forces Firefox headless mode
- `CHROMIUM_NO_SANDBOX=1` forces Chromium `--no-sandbox`
- `E2E_VERBOSE_DRIVER_LOGS=1` enables verbose WebDriver logs
- `E2E_VERBOSE_CHROMIUM_LOGS=1` enables extra Chromium launcher logs

Advanced override:

- `CHROMIUM_ALLOW_GOOGLE_CHROME=1`

Use that only if you know exactly why you need it. The default guard exists because branded Google Chrome is not a reliable target for unpacked extension Selenium runs.

### Local E2E override file

The runner loads optional local overrides from:

1. `.env.e2e.local`
2. `.env.e2e`

Use `.env.e2e.local` for machine-specific test targets or browser paths that should not be committed. Start from `./.env.e2e.example`.

## What the `archive` e2e test checks

The current automated test opens `https://map.earthmc.net/`, switches the extension into archive mode, refreshes the page, and checks that:

- the archive label appears
- the archive label stays stable
- archive marker counts differ from live marker counts
- archive marker counts stay stable over repeated reads
- the UI does not create duplicate labels
- the UI does not create duplicate sidebars

## Troubleshooting

### The Chromium test says the extension did not load

Most likely cause:

- the launcher found branded Google Chrome instead of Chromium or Chrome for Testing

Fix:

- install Chromium, or
- place Chrome for Testing and ChromeDriver under `.tools/`, or
- point `CHROMIUM_BINARY_PATH` and `CHROMEDRIVER_PATH` at a compatible browser and matching driver

### The Chromium test opens a window and then hangs

This was previously caused by a Windows browser version probe that launched Chrome directly before Selenium started.

That startup path has been removed. If you still see a hang:

- rerun with `E2E_VERBOSE_CHROMIUM_LOGS=1`
- confirm which browser binary is being selected
- confirm you are not accidentally forcing branded Google Chrome

### I see a Windows sandbox access error with Chrome for Testing

On this Windows setup, the launcher automatically applies `--no-sandbox` for extension-based runs that use the local Chrome for Testing fallback.

If you still hit permission issues:

- make sure the repository is in a normal writable folder
- make sure antivirus or Windows security tools are not locking `chrome.exe`
- remove stale browser processes and rerun

### Firefox tests do not start

Make sure Firefox and `geckodriver` are installed and reachable.

If they are in custom locations, set:

- `FIREFOX_BINARY_PATH`
- `GECKODRIVER_PATH`

## External runtime services

This project talks to a few services outside the current page origin. That is normal for the current feature set, but it is worth knowing up front:

- `map.earthmc.net` and `earthmc.net`: live map tiles, markers, and older marker endpoints. Required for normal live map usage.
- `api.earthmc.net`: official EarthMC API lookups used by live extension features such as player and server data. Required for those live lookup features.
- `web.archive.org`: historical marker snapshots for archive mode. Archive-only dependency.
- `api.codetabs.com`: relay used for archive-mode Wayback requests in practice because direct browser/runtime Wayback fetches are not currently reliable enough. Archive-only third-party dependency.
- `mc-heads.net`: resident avatar images. Best-effort cosmetic dependency.
- `emcstats.bot.nu`: alliance data used by alliance-related map features. Feature-specific dependency.
- `fonts.googleapis.com` and `fonts.gstatic.com`: UI font delivery for the bundled styles. Best-effort cosmetic dependency.

### Archive mode relay

Archive mode currently fetches Wayback snapshots through `https://api.codetabs.com/v1/proxy/?quest=` in practice.

This relay is only used for archive mode. Normal live map browsing does not depend on it.

It is a third-party dependency and should be treated as a documented compatibility workaround, not a hidden implementation detail. If a reliable first-party or direct-fetch approach becomes practical later, that would be a better cleanup target than changing behavior ad hoc.

## Repository layout

Important folders and files:

- `src/`: shared extension source code
- `resources/`: static assets and page-context helpers
- `sources/geojson/`: raw GeoJSON border sources used to regenerate Nostra borders
- `sources/geojson/borders.config.json`: exclusions and renames applied during the merged deduped border build
- `scripts/e2e/`: Selenium test runner, browser launchers, and tests
- `scripts/build-deduped-borders-geojson.mjs`: raw-source Nostra border builder with shared-edge dedupe
- `scripts/check-borders-duplicates.mjs`: duplicate checker for generated Nostra border data
- `build-extension.js`: builds Chromium and Firefox extension packages
- `build-userscript.js`: builds the userscript output
- `manifest.json`: shared extension manifest source

## Upstream sync notes

This fork tries to keep browser-specific behavior isolated so upstream merges stay manageable.

The most likely merge-conflict files are:

- `manifest.json`
- `build-extension.js`
- `build-userscript.js`
- `README.md`
- browser compatibility helpers

Recommended sync flow:

```bash
git fetch upstream
git merge upstream/main
npm run build
npm run test:e2e
```

## Userscript fallback

The userscript build output is written to:

- `dist/emc-dynmapplus.user.js`

That build uses this fork's repository metadata rather than the upstream fork metadata.

The tracked userscript file in `dist/` is the published artifact for the current userscript flow, so code changes that affect shipped runtime behavior should be followed by regenerating it.

## Attribution

This repository is based on the EarthMC Dynmap extension and its forks:

- Original project by 3meraldK:  
  https://github.com/3meraldK/earthmc-dynmap

- Fork by Owen3H:  
  https://github.com/Owen3H/earthmc-dynmap

This fork (earthmc-dynmap-cross-browser) extends the project with:

- Cross-browser support (Chromium + Firefox)
- Bug fixes and performance improvements
- Automated testing and improved reliability
