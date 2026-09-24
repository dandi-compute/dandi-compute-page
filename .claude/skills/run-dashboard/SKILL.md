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
      job-capsules Dandiset's bulk asset manifest (main queue view). The queue state is two
      tables, `derivatives/jobs.tsv` (one row per job capsule) and `derivatives/paths.tsv`
      (one row per asset path of a capsule: `job_id`, `path`, `content_id`). Neither is
      referenced by a known content-id, so `fetchQueueState` looks both up here first, then
      fetches each `contentUrl` blob (a `.../blobs/<3>/<3>/<id>` URL). Stub both hops: the
      manifest response is `[{"path": "derivatives/jobs.tsv", "contentUrl": [..., "<blob
url>"]}, {"path": "derivatives/paths.tsv", ...}]`, and each blob URL serves its table,
      plain tab-separated with a header. `jobs.tsv` columns match `_JOBS_TSV_FIELD_NAMES`
      and `paths.tsv` columns `_PATHS_TSV_FIELD_NAMES` in dandi-compute/dandi-compute-core
      (`dandi_compute_code.queue`). `joinJobsAndPaths` turns them into queue entries.
    - `https://dandiarchive.s3.amazonaws.com/dandisets/001873/draft/assets.jsonld` — same
      two-hop lookup, archive Dandiset (archive view).
    - `.../code/main/src/dandi_compute_code/queue/pipeline_configs.json` — priorities banner.
    - `.../code/main/...registered_params.json` / `registered_configs.json` — registries.
    - `https://dandiarchive.s3.amazonaws.com/blobs/<3>/<3>/<id>` — per-run artifacts
      (trace.txt, dataset_description.json, quality_control.json, visualization_output.json)
      as well as the resolved `jobs.tsv` and `paths.tsv` blobs themselves (same URL shape,
      so route by exact URL match on those specific blob ids, not just path prefix).
4. Load `http://localhost:8123/?view=dashboard` and wait for `#summary .summary-stats`;
   run cards are `.run-entry`. Count/inspect stubbed requests in the route handler
   to assert network behavior (e.g. blob requests are cache-hits on reload).

## Fixture gotchas (cost real debugging time)

- The queue view is `?view=dashboard` — `view=main` silently falls back to the landing page.
- A job's `run.path` is its capsule directory, taken from the `paths.tsv` row for its
  `dataset_description.json` (the one directly inside `.../<job_id>/`). Every other
  artifact lookup is `run.path` + a relative path, so the job's other `paths.tsv` rows
  MUST sit under that same directory (`.../logs/trace.txt`,
  `.../derivatives/visualization/...`) or every artifact resolves to null and nothing is
  fetched. A job with no `dataset_description.json` row has no capsule directory at all.
- A job's `status` in `jobs.tsv` only sets the presence flags (pending, stalled, failed,
  successful). The page derives its own status from those flags and the trace, so a
  `successful` job whose trace shows failed tasks still renders as failed.
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
