# Voxoban

Voxoban is a browser-based 3D CSS Sokoban puzzle game built with Nuxt and
VoxCSS. The game renders voxel-style boards as DOM/CSS rather than canvas or
WebGL.

## Development

Install dependencies:

```sh
npm install
```

Run the development server:

```sh
npm run dev
```

Production checks:

```sh
npm run check
npm run generate
npm run audit
```

`npm run check` validates packed level data, runs unit tests, and builds the
Nuxt app. `npm run audit` fails on moderate-or-higher findings. Use
`npm run audit:all` when you want to see low-severity advisories too.

## Level Data

The playable levels are bundled from a curated subset of DeepMind's Boxoban
dataset. The raw upstream mirror is intentionally ignored by Git because it is
large; keep it locally at `data/boxoban-levels-master/` only when rebuilding or
auditing the source data.

Tracked source level files live in `levels/`. The app imports the generated
packed bundle from `src/levels/generated/packed-levels.ts`.

Rebuild the packed bundle after editing tracked level text files:

```sh
npm run pack:levels
```

See [NOTICE.md](NOTICE.md) for Boxoban attribution and citation details.
