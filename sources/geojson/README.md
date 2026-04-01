## Source GeoJSON

This directory is the source of truth for shipped border generation.
The current source files were derived from Natural Earth 1:10m GeoJSON data:

- https://www.naturalearthdata.com/

Files:
- `countries.geojson`: country-level source GeoJSON
- `states-and-countries.geojson`: merged source GeoJSON for the state-border view

The shipped border files under `resources/borders.*.json` are generated from these raw inputs. Do not treat the generated files as the editable source of truth.

Rebuild the shipped Aurora and Nostra border resources with:

```bash
npm run build:borders
```

The rebuild currently:
- projects the same two source GeoJSON files into both world coordinate systems
- writes a country-only resource for Aurora
- writes country-only and state-plus-country resources for Nostra
- dedupes shared raw borders before projection and simplification
- writes the final linework to `resources/borders.*.json`

Optional verification:

```bash
npm run check:borders:duplicates
```
