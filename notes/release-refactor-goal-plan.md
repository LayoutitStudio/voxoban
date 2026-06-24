# Voxoban Release Refactor Goal Plan

Status: Final
Updated: 2026-06-24
Repo: `/Users/ekrof/fed/voxoban`

## Goal

Make Voxoban's code quality credible for a public release by extracting pure level/game logic from the 4k-line Vue app, adding focused tests around the extracted behavior, and preserving the existing release-clean repo surface from the prior cleanup pass.

## Current Evidence

- `app.vue` still owns SEO, level decoding, campaign curation, Sokoban rules, deadlock heuristics, VoxCSS DOM patching, UI template, and scoped CSS.
- Existing cleanup already added `README.md`, `LICENSE`, `NOTICE.md`, `THIRD_PARTY_LICENSES/BOXOBAN_APACHE-2.0.txt`, release scripts, and `scripts/validate-packed-levels.mjs`.
- The raw upstream Boxoban mirror is intentionally ignored at `data/boxoban-levels-master/`; tracked level inputs are `data/boxoban/*.txt` plus generated `data/boxoban/packed-levels.ts`.
- Current verification gates are `npm run validate:levels`, `npm run check`, `npm run generate`, and `npm run audit`.
- `npm run audit:all` has one low-severity Nuxt nested Vite/esbuild Windows dev-server advisory. `npm run audit` passes because it fails only on moderate-or-higher findings.

## Project Invariants

- Preserve the existing gameplay behavior unless a test proves a current rule is wrong.
- Keep the ignored upstream Boxoban mirror and generated Nuxt output out of Git.
- Keep release docs and attribution intact.
- Keep VoxCSS DOM patching isolated from pure game-rule modules; renderer workarounds should not leak into testable Sokoban logic.
- Use narrow validation gates tied to this refactor; do not claim visual/performance improvement from compile-only evidence.

## Scope

- Extract reusable pure modules for level coordinates, packed-level decoding, Boxoban campaign construction, Sokoban movement, and deadlock helpers.
- Add a small automated test suite for parsing, movement, undo-adjacent state transitions, win/loss/deadlock primitives, and packed-level decoding.
- Wire tests into package scripts so `npm run check` verifies levels, unit tests, and production build.
- Leave `app.vue` as the visual/UI host, but reduce its ownership to Vue state, timers, routing, controls, VoxCSS rendering, and template/CSS.

## Non-Goals

- Do not redesign the UI or change controls.
- Do not split the scoped CSS unless a safe extraction falls out naturally.
- Do not replace Nuxt, VoxCSS, or the packed level format.
- Do not solve the large client chunk warning in this refactor; document it as a known bundle-size follow-up.
- Do not force dependency overrides for the low-severity esbuild advisory unless Nuxt exposes a compatible fix.

## Risks And Unknowns

- Deadlock heuristics may encode false positives; tests should lock current intended behavior, not pretend the heuristics are exhaustive.
- App-level Vue state currently mutates `Set` instances through ref replacement; extracted helpers must not rely on Vue reactivity.
- The packer and validator duplicate codec logic today; sharing that codec would improve consistency but must not make the packer harder to run from plain Node.
- `app.vue` is untracked in an all-untracked repo, so use file/status evidence rather than commit diffs as the source of truth.

## Implementation Slices

1. Module boundaries and shared types
   - Create `src/game/types.ts` for `Coord`, `LevelTier`, `Facing`, `ParsedLevel`, `CampaignLevel`, and `MoveSnapshot`.
   - Create `src/game/coords.ts` for `toKey`, `fromKey`, `clamp`, and cardinal direction constants.
   - Done when `app.vue` imports these types/helpers and no longer defines local duplicates.

2. Level parsing and packed campaign construction
   - Create `src/levels/packed-codec.ts` for browser-safe packed decode helpers.
   - Create `src/levels/boxoban.ts` for `parseLevel`, campaign scoring, source-index blocklist, fallback level, and campaign construction.
   - Keep `scripts/pack-boxoban.mjs` as the Node writer for now; optionally point the validator at the shared decoder if clean.
   - Done when `app.vue` imports `campaignLevels` or a `createBoxobanCampaign` helper instead of owning decoder/campaign code.

3. Pure Sokoban rules and deadlock helpers
   - Create `src/game/rules.ts` for wall/box checks, reachable-open-tile search, legal-push availability, single-box goal reachability, and move application.
   - Create `src/game/deadlocks.ts` for goal reachability, dead-square sets, corner, 2x2, freeze, goal-matching, and combined obvious-deadlock checks.
   - Done when `app.vue` computed state delegates to pure functions with `{ level, boxes, player }` inputs.

4. Unit tests and package scripts
   - Add Vitest as a dev dependency.
   - Add tests under `src/game/*.test.ts` and `src/levels/*.test.ts`.
   - Cover parse-level trimming, packed decode count/shape, legal push/no-push, single-box dead square, corner deadlock, 2x2 deadlock, and a solved-level win primitive.
   - Update `package.json`: add `test`, include tests in `check` after `validate:levels` and before `build`.

5. Release verification
   - Run `npm run validate:levels`, `npm run test`, `npm run check`, `npm run generate`, and `npm run audit`.
   - Run `npm run audit:all` and document any remaining low-severity advisory.
   - Start or reuse a local dev server on `127.0.0.1:3000` only as a manual inspection path; stop it before final if it is not needed.

## Progress Model

Milestone 0/10  ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜  plan written
Milestone 2/10  🟩🟩⬜⬜⬜⬜⬜⬜⬜⬜  shared types/coords extracted
Milestone 4/10  🟩🟩🟩🟩⬜⬜⬜⬜⬜⬜  level/campaign extraction compiling
Milestone 6/10  🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜  pure rules/deadlocks extracted
Milestone 8/10  🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜  tests wired and passing
Milestone 10/10 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 release gates passing

## Validation Gates

- `npm run validate:levels`
- `npm run test`
- `npm run check`
- `npm run generate`
- `npm run audit`
- `npm run audit:all` as informational for low-severity findings
- Optional manual route check: `curl -I http://127.0.0.1:3000/` after starting `npm run dev -- --host 127.0.0.1 --port 3000`

## Stop Conditions

- Stop and inspect before continuing if any extraction changes generated level counts, starting level identity, movement direction semantics, or win/loss behavior.
- Stop before forcing transitive dependency overrides for Nuxt/Vite/esbuild; prefer framework-supported versions.
- Stop if tests reveal a current deadlock heuristic is wrong in a way that requires gameplay/product judgment instead of mechanical extraction.

## Goal-Mode Handoff

Implement this plan in `/Users/ekrof/fed/voxoban`. Keep the release docs and ignored raw Boxoban mirror intact. Extract pure level, campaign, rules, and deadlock logic out of `app.vue`; add focused Vitest coverage; wire tests into `npm run check`; run the validation gates above; report the exact files changed, commands run, remaining warnings, and whether the local server is still running. Do not stage, commit, push, or deploy unless explicitly asked.
