---
name: run-dashboard
description: Launch and drive this static dashboard in a real browser with stubbed external data. Use when running or screenshotting the app locally, or when verifying that a change to src/app.js works in the running app (not just in vitest).
---

# Running and driving the dandi-compute-page dashboard in a browser

The app is a static page (`src/index.html` + `src/app.js`, no build step). All data
comes from external hosts fetched client-side, so running it locally = serve `src/`,
open it in Chromium, and stub the external endpoints at the network boundary.

## Recipe

1. Serve the page: any static server over `src/` (e.g. `python3 -m http.server 8123 -d src`,
   or a small Node `http` server). `localhost` is a secure context, so the Cache API works.
2. Drive with Playwright against the preinstalled browser (do NOT `playwright install`):
   - `npm i playwright-core` in a scratch dir.
   - `chromium.launchPersistentContext(profileDir, { headless: true, executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" })`
     (adjust the revision dir to what's in `/opt/pw-browsers/`). A persistent
     profile lets you simulate a browser restart (close + relaunch, same dir)
     to test cross-session persistence (Cache API, localStorage).
3. Stub external hosts with `page.route(/raw\.githubusercontent\.com|dandiarchive\.s3\.amazonaws\.com|api\.github\.com/, handler)`
   and `route.fulfill(...)`. Endpoints the queue dashboard hits:
   - `https://dandiarchive.s3.amazonaws.com/dandisets/001697/draft/assets.jsonld` — the
     job-capsules Dandiset's bulk asset manifest (main queue view). `state.tsv` isn't
     referenced by a known content-id, so `fetchQueueState` looks it up here first: find
     the entry whose `path` is `derivatives/state.tsv`, then fetch its `contentUrl` blob
     entry (a `.../blobs/<3>/<3>/<id>` URL) for the actual table. Stub both hops: the
     manifest response is `[{"path": "derivatives/state.tsv", "contentUrl": [..., "<blob
     url>"]}]`, and the blob URL response is the table itself — plain tab-separated, one
     row per attempt capsule, header + rows matching `_STATE_TSV_FIELD_NAMES` in
     dandi-compute/dandi-compute-core's `_queue_state.py`; nested path/content-id maps
     (`dataset_description_path`, `output_paths`, `log_paths`) are compact-JSON cells,
     booleans are Python's `str(bool)` (`"True"`/`"False"`).
   - `https://dandiarchive.s3.amazonaws.com/dandisets/001873/draft/assets.jsonld` — same
     two-hop lookup, archive Dandiset (archive view).
   - `.../code/main/src/dandi_compute_code/queue/pipeline_configs.json` — priorities banner.
   - `.../code/main/...registered_params.json` / `registered_configs.json` — registries.
   - `https://dandiarchive.s3.amazonaws.com/blobs/<3>/<3>/<id>` — per-run artifacts
     (trace.txt, dataset_description.json, quality_control.json, visualization_output.json)
     as well as the resolved `state.tsv` blob itself (same URL shape, so route by exact
     URL match on that specific blob id, not just path prefix).
4. Load `http://localhost:8123/?view=dashboard` and wait for `#summary .summary-stats`;
   run cards are `.run-entry`. Count/inspect stubbed requests in the route handler
   to assert network behavior (e.g. blob requests are cache-hits on reload).

## Fixture gotchas (cost real debugging time)

- The queue view is `?view=dashboard` — `view=main` silently falls back to the landing page.
- A `state.tsv` row's blob lookups go through `run.path` built by `buildRunPath(entry)`
  from `dandiset_id`/`subject`/`pipeline`/`version`/`params`/`config`/`attempt`.
  The keys in `output_paths` MUST match that computed path exactly
  (`derivatives/dandiset-<id>/sub-<subject>/pipeline-<pipeline>/version-<version>_params-<params>_config-<config>_attempt-<n>/...`)
  or every artifact resolves to null and nothing is fetched.
- `dataset_description.json` is only fetched when the entry has a
  `dataset_description_path` field (`{ "<repo-path>": "<blob-id>" }` map), not
  merely a matching `output_paths` key.
- Fulfilled ETags on cross-origin fetches aren't exposed to page JS without
  `Access-Control-Expose-Headers: ETag`, so If-None-Match assertions against
  stubs need that header (the real GitHub CDN sends it).
- Tree-group bodies render lazily: run cards don't exist in the DOM until their
  group chain is opened (set `.open = true` AND `dispatchEvent(new Event("toggle"))`
  per level). Wait on `details.dandiset-group`, not `.run-entry`, at first paint.
- A single-dandiset fixture auto-expands its group (`autoExpand`), so "clicking to
  open" it actually closes it — check `details.open` before assuming click direction.
- Run cards live inside collapsed `<details>` groups (tree layout), so Playwright's
  default "visible" waits time out on them — use `waitForSelector(..., { state: "attached" })`.
- The Google Fonts request fails offline — harmless, ignore it.

A complete working example of this recipe (server + stubs + phased
cold/reload/restart/refresh assertions) was used for the blob-cache overhaul;
its shape is worth copying for future network-behavior checks.
