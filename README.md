# EarthMC Dynmap+ Cross-Browser Fork

This repository is a maintained fork of EarthMC Dynmap+ with first-class support for both Chromium-based browsers and Firefox.

## For Users

### What this extension does

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

### Install the extension

If you already have a built release artifact or a local build, load it like this.

### Chromium

Normal users should install the official Chrome release from CWS:

- https://chromewebstore.google.com/detail/earthmc-dynmap+-cross-bro/jmbcckhijagbdajjnefldnhlidhogjio

For a local build from this repository:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the extension folder: `dist/chromium/`.

### Firefox

Normal users should install the official Firefox release from AMO:

- https://addons.mozilla.org/en-US/firefox/addon/earthmc-dynmap-x-browser/

For a local build from this repository:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select the extension manifest: `dist/firefox/manifest.json`.

## License and Attribution

This project is GPL-licensed. See [`LICENSE`](./LICENSE).

This repository is based on the EarthMC Dynmap extension and its forks:

- Original project by 3meraldK:  
  https://github.com/3meraldK/earthmc-dynmap

- Fork by Owen3H:  
  https://github.com/Owen3H/earthmc-dynmap

This fork extends the project with:

- cross-browser support
- automated testing
- new features and UI improvements
- bug fixes and reliability work

### Common issues

### Archive mode is unavailable or inconsistent

Archive mode depends on historical marker snapshots and a compatibility relay. Normal live map browsing does not depend on that path.

Archive mode currently fetches Wayback snapshots through `https://api.codetabs.com/v1/proxy/?quest=` in practice.

This relay is only used for archive mode. If archive mode is unavailable, the rest of the extension can still work normally.

## For Developers

If you are new to browser extension development, the short version is:

1. Install Node.js.
2. Run `npm install`.
3. Build the extension with `npm run extension`.
4. Load the built extension from `dist/chromium/` or `dist/firefox/`.
5. Optionally run the live browser smoke tests with `npm run test:e2e` after reading `Automated tests` below.

### Before you start

You need:

- Node.js 18 or newer
- npm
- at least one supported browser installed locally

If you only want to build the extension, that is enough.

If you also want to run the end-to-end browser tests, read the `Automated tests` section below because Chromium has one important setup rule.

### Quick start

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

### Build commands

Available scripts:

- `npm run userscript`
- `npm run extension`
- `npm run extension:chromium`
- `npm run extension:firefox`
- `npm run build`
- `npm run build:borders`
- `npm run dedupe:borders:nostra`
- `npm run check:borders:duplicates`
- `npm run convert:borders:nostra -- <input.geojson> <output.json>`

What they do:

- `userscript`: builds `dist/emc-dynmapplus.user.js`
- `extension`: builds both browser targets
- `build`: builds both the userscript and both extension targets
- `build:borders`: rebuilds all shipped Aurora and Nostra border resources from raw GeoJSON sources
- `dedupe:borders:nostra`: legacy alias for `build:borders`
- `check:borders:duplicates`: checks a generated borders file for exact duplicate entries and duplicate undirected edges
- `convert:borders:nostra`: converts a single lon/lat GeoJSON file into standalone Nostra borders JSON using Miller cylindrical projection

### Automated tests

The Selenium-based end-to-end tests live in `tests/e2e/`.

These are live browser integration and smoke tests, not deterministic unit tests.

They exercise the built extension against real EarthMC pages and external services, so failures can come from browser setup, driver discovery, page changes, archive availability, or network issues in addition to extension regressions.

Main smoke-test commands:

- `npm run test:e2e`
- `npm run test:e2e:all`
- `npm run test:e2e:chromium`
- `npm run test:e2e:firefox`
- `npm run test:e2e:archive`
- `npm run test:e2e:archive:chromium`
- `npm run test:e2e:archive:firefox`

Current behavior:

- `test:e2e`: Chromium smoke suite only
- `test:e2e:all`: smoke suite across Chromium and Firefox
- `test:e2e:diagnostics`: Chromium-only diagnostic/calibration suite
- `test:e2e:diagnostics:all`: diagnostic suite across Chromium and Firefox

The smoke suite is the one intended to gate normal changes. Diagnostic tests are useful when actively tuning map projection or preview sizing, but they are intentionally not part of the default regression path.

Legacy compatibility aliases still work:

- `npm run check:archive:chromium`
- `npm run check:archive:firefox`

You can also call the runner directly:

```bash
node tests/e2e/run.mjs --list
node tests/e2e/run.mjs --suite smoke --browser chromium
node tests/e2e/run.mjs --suite diagnostic --browser chromium
node tests/e2e/run.mjs --browser firefox --test archive
```

### Headless mode

By default, the e2e runner is headful.

To request headless mode for all selected browsers:

```bash
npm run test:e2e --headless
```

You can also use the direct runner form:

```bash
node tests/e2e/run.mjs --headless
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

### What the `archive` e2e test checks

The current automated test opens `https://map.earthmc.net/` for the live Nostra map, switches the extension into archive mode, refreshes the page, and checks that:

- the archive label appears
- the archive label stays stable
- archive mode stays active after refresh
- archive marker payload fetches succeed
- archive marker counts stay stable over repeated reads
- the UI does not create duplicate labels
- the UI does not create duplicate sidebars

### Troubleshooting

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

### Borders workflow

The shipped Aurora and Nostra border resources are generated from the raw GeoJSON in `sources/geojson/`.
The current GeoJSON source files were derived from Natural Earth 1:10m data:

- https://www.naturalearthdata.com/

To rebuild the shipped border resources:

```bash
npm run build:borders
```

That command:
- builds both world projections from the same raw source GeoJSON
- writes a country-only resource for Aurora
- writes country-only and state-plus-country resources for Nostra
- dedupes shared raw borders before projection and simplification

Current raw inputs include:

- `sources/geojson/countries.geojson`
- `sources/geojson/states-and-countries.geojson`

Current runtime behavior:

- Aurora uses only the country-border resource
- Nostra uses the country-border resource and the state-detail resource

To verify the generated file:

```bash
npm run check:borders:duplicates
```

This workflow is the fix for the old doubled-border issue seen on borders such as Switzerland. The important rule is: do not manually maintain the shipped files under `resources/borders.*.json` as the source of truth. Update the raw GeoJSON inputs and regenerate instead.

If you want to change the border dataset, update the source GeoJSON files in `sources/geojson/` and rerun the rebuild. Do not hand-edit the generated files under `resources/`.

### External runtime services

This project talks to a few services outside the current page origin. That is normal for the current feature set, but it is worth knowing up front:

- `map.earthmc.net`, `aurora.earthmc.net`, and `earthmc.net`: live map tiles, markers, and older marker endpoints. Required for normal live map usage.
- `api.earthmc.net`: official EarthMC API lookups used by live extension features such as player and server data. Required for those live lookup features.
- `web.archive.org`: historical marker snapshots for archive mode. Archive-only dependency.
- `api.codetabs.com`: relay used for archive-mode Wayback requests in practice because direct browser/runtime Wayback fetches are not currently reliable enough. Archive-only third-party dependency.
- `mc-heads.net`: resident avatar images. Best-effort cosmetic dependency.
- `emcstats.bot.nu`: alliance data used by alliance-related map features. Feature-specific dependency.
- `fonts.googleapis.com` and `fonts.gstatic.com`: UI font delivery for the bundled styles. Best-effort cosmetic dependency.

### Repository layout

Important folders and files:

- `src/`: shared extension source code
- `resources/`: static assets and page-context helpers
- `sources/geojson/`: raw GeoJSON border sources used to regenerate shipped border resources
- `tests/unit/`: unit tests for deterministic shared logic
- `tests/e2e/`: Selenium test runner, browser launchers, and tests
- `scripts/build-deduped-borders-geojson.mjs`: explicit-input border builder with shared-edge dedupe
- `scripts/check-borders-duplicates.mjs`: duplicate checker for generated Nostra border data
- `build-extension.js`: builds Chromium and Firefox extension packages
- `build-userscript.js`: builds the userscript output
- `manifest.json`: shared extension manifest source

### Maintainer upstream sync

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

### Userscript fallback

The userscript build output is written to:

- `dist/emc-dynmapplus.user.js`

That build uses this fork's repository metadata rather than the upstream fork metadata.

The tracked userscript file in `dist/` is the published artifact for the current userscript flow, so code changes that affect shipped runtime behavior should be followed by regenerating it.
