## Source GeoJSON

This directory is the source of truth for Nostra border generation.

Files:
- `borders.config.json`: exclusions and renames applied during the merged build
- `countries.geojson`: country-level source GeoJSON
- `us-states-and-territories.geojson`: US states, DC, and US territories

The shipped border file at `resources/borders.nostra.json` is generated from these raw inputs. Do not treat the generated file as the editable source of truth.

Rebuild the final deduped Nostra borders resource with:

```bash
npm run dedupe:borders:nostra
```

The rebuild currently:
- loads every `.geojson` file in this directory
- uses the Nostra projection window `latMin=-59.4` and `latMax=83.1`
- applies excludes and renames from `borders.config.json`
- dedupes shared raw borders before projection and simplification
- writes the final linework to `resources/borders.nostra.json`

Optional verification:

```bash
npm run check:borders:duplicates
```

If you add more subdivision datasets later, keep the raw GeoJSON here and extend the rebuild command rather than hand-merging generated Nostra JSON.
In the normal case, adding a dataset is just dropping another `.geojson` file into this directory and rerunning the rebuild. Only touch `borders.config.json` if the new data should replace an existing parent outline or if it introduces a name collision.
