# Nepal Church Pack (HamroShow)

This repo now includes an automated content pack builder and installer for Nepal churches.

## What It Adds

- Nepali Bible: `NNRV Nepali` (`.fsb`)
- English Bible: `KJV English` (`.fsb`)
- Nepali hymns from nepalichristiansongs.com as native HamroShow `.show` files

## Commands

Run from the HamroShow repo root.

```bash
npm run nepal:build
npm run nepal:install
```

Or run both in one step:

```bash
npm run nepal:setup
```

## Optional Flags

You can call the script directly for custom paths.

```bash
node scripts/nepal-pack.mjs setup --outDir dist/nepali-church-pack --dataRoot "C:/Users/<you>/Documents/HamroShow"
```

Limit imported hymn letter pages (faster test run):

```bash
node scripts/nepal-pack.mjs build --letters a,aa,i
```

## Generated Output

The build command creates:

- `dist/nepali-church-pack/Bibles/*.fsb`
- `dist/nepali-church-pack/Shows/*.show`
- `dist/nepali-church-pack/manifest.json`

The install command copies these into your HamroShow data folder:

- `<dataRoot>/Bibles`
- `<dataRoot>/Shows`

It also updates `<dataRoot>/Config/settings_synced.json` to register scripture entries:

- `ne_np_nnrv`
- `en_kjv`

## Notes

- Close HamroShow before running install/setup.
- Hymn data quality depends on source formatting from NCS pages.
- Re-running setup safely overwrites files with the latest generated content.
