/* ─── Configuration ─────────────────────────────────────────── */
/* Keep in sync with the "version" field in package.json.
   TODO: once this project migrates to TS + Vite, source this from
   package.json directly (e.g. via Vite's `define`) instead of duplicating
   it here. */
const APP_VERSION = "1.0.1";
const OWNER = "dandi-compute";
const REPO = "001697";
const BRANCH = "draft";
const DERIVATIVES_DANDISET_ID = "001697";
const CDN_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

/* Queue state is published as two plain-text tables inside the Dandiset it
   describes: `derivatives/jobs.tsv` (one row per job capsule) and its sibling
   `derivatives/paths.tsv` (one row per asset path of a capsule, keyed by
   job_id, carrying that asset's S3 blob id). Both are written by
   dandi_compute_code.queue.PipelineQueue. The job-capsules Dandiset (001697,
   same as CDN_BASE) carries the main queue state; archived failing runs live
   in the same-shaped tables inside a dedicated archive Dandiset, surfaced on
   the Archive page (?view=archive) to keep them out of the main queue.
   The 001697/001873 GitHub mirrors are retired for asset content (see the S3
   blob helpers below), so the tables can't be fetched by a predictable raw.
   githubusercontent.com URL. Unlike a run's output artifacts, they also
   aren't referenced by any content-id the app already knows -- so their
   current S3 blobs have to be looked up by path against the Dandiset's own
   `assets.jsonld` manifest (the same one
   dandi_compute_code.dandiset.load_assets_jsonld_metadata reads on the
   backend) before they can be fetched. See resolveAssetBlobUrls below. */
const ARCHIVE_DANDISET_ID = "001873";
const JOBS_TSV_RELATIVE_PATH = "derivatives/jobs.tsv";
const PATHS_TSV_RELATIVE_PATH = "derivatives/paths.tsv";
/* Pipeline scheduling config, packaged with dandi-compute/dandi-compute-core (formerly a
   queue_config.json living only in the now-retired dandi-compute/queue repo). */
const PIPELINE_CONFIGS_URL =
    "https://raw.githubusercontent.com/dandi-compute/dandi-compute-core/main/src/dandi_compute_code/queue/pipeline_configs.json";
const PIPELINE_CONFIGS_SOURCE_URL =
    "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/queue/pipeline_configs.json";

const GITHUB_API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

/* Content source for the landing page qualification conditions, linked as the
   authoritative reference. */
const QUALIFYING_CONTENT_IDS_README_URL =
    "https://github.com/dandi-cache/qualifying-aind-content-ids#aind-ephys-qualification-conditions";

const PIPELINE_REPO_URL = "https://github.com/AllenNeuralDynamics/aind-ephys-pipeline";
const PIPELINE_API_BASE = "https://api.github.com/repos/AllenNeuralDynamics/aind-ephys-pipeline";
const CODE_REPO_URL = "https://github.com/dandi-compute/dandi-compute-core";
const AIND_EPHYS_PIPELINE_CODE_URL =
    "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline";
const PARAMS_SCHEMA_URL =
    "https://raw.githubusercontent.com/AllenNeuralDynamics/aind-ephys-pipeline/main/pipeline/default_params_schema.json";
const PARAMS_PLACEHOLDER_URL =
    "https://raw.githubusercontent.com/AllenNeuralDynamics/aind-ephys-pipeline/main/pipeline/default_params.json";
const REGISTRY_FALLBACK_ALIAS_PRIORITY = 1;
const MIN_SHORT_COMMIT_HASH_LENGTH = 6;
const FULL_COMMIT_HASH_LENGTH = 40;
/* Matches both the current dandi-compute/dandi-compute-core repo and its former
   dandi-compute/code name, which is still baked into the provenance of runs
   already published to the archive. */
const DANDI_CODE_REPO_PATTERN = /github\.com\/dandi-compute\/(?:dandi-compute-core|code)(?:\/|$)/;
const ROOT_DIFF_PATH_LABEL = "(root)";
const COMMIT_HASH_PATTERN = new RegExp(`^[0-9a-f]{${MIN_SHORT_COMMIT_HASH_LENGTH},${FULL_COMMIT_HASH_LENGTH}}$`, "i");
const REGISTERED_PARAMS_PATH = "src/dandi_compute_code/aind_ephys_pipeline/registries/registered_params.json";
const REGISTERED_CONFIGS_PATH = "src/dandi_compute_code/aind_ephys_pipeline/registries/registered_configs.json";
let PARAMS_REGISTRY = [];
let CONFIG_REGISTRY = [];
/* Dandisets used for internal testing – hidden from the main view and moved to
   the dedicated Tests page (?view=tests). */
const TEST_DANDISETS = new Set(["001849"]);
/* Per-dandiset fallback subject used when a queue entry carries a null subject */
const DANDISET_SUBJECT_DEFAULTS = new Map([["001849", "test"]]);

/* Module-level view mode ("tests" | "archive" | "compare" | "params" | null),
   set during init */
let _viewMode = null;

/* Module-level layout mode ("tree" | "flat"), toggled by the layout bar */
let _layoutMode = "tree";
/* Module-level sort mode ("attempt" | "created_at" | "dandiset_id"), toggled by the layout bar */
let _sortMode = "attempt";
/* Module-level sort direction ("desc" | "asc"), toggled by the layout bar */
let _sortDirection = "desc";
/* Cached filtered runs for re-rendering on layout toggle */
let _filteredRuns = [];
/* All view-scoped runs for the current load (superset of _filteredRuns).
   Hydration mutates these run objects in place, so _filteredRuns and the
   hydration queue share them and re-renders always show the latest data. */
let _runsInScope = [];
/* data-group-key values of tree groups the user has open. Group bodies render
   lazily (only for open groups), so this drives what re-renders materialize. */
let _openGroupKeys = new Set();
/* How many flat-layout cards are currently materialized ("Show more" grows it) */
const FLAT_RENDER_CHUNK = 200;
let _flatRenderLimit = FLAT_RENDER_CHUNK;

const ALLOWED_VIEW_MODES = new Set(["dashboard", "compare", "params", "curation", "tests", "archive"]);

function parseViewMode() {
    const rawView = new URLSearchParams(window.location.search).get("view");
    return ALLOWED_VIEW_MODES.has(rawView) ? rawView : null;
}

function syncTopNav(viewMode = parseViewMode()) {
    const navLinks = [
        { selector: '.site-view-toggle-link[href="./"]', mode: null },
        { selector: '.site-view-toggle-link[href="?view=dashboard"]', mode: "dashboard" },
        { selector: '.site-view-toggle-link[href="?view=compare"]', mode: "compare" },
        { selector: '.site-view-toggle-link[href="?view=params"]', mode: "params" },
        { selector: '.site-view-toggle-link[href="?view=curation"]', mode: "curation" },
        { selector: '.site-view-toggle-link[href="?view=tests"]', mode: "tests" },
        { selector: '.site-view-toggle-link[href="?view=archive"]', mode: "archive" },
    ];
    navLinks.forEach(({ selector, mode }) => {
        const link = document.querySelector(selector);
        if (!link) return;
        const active = viewMode === mode;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

function parseLayoutMode() {
    const layout = new URLSearchParams(window.location.search).get("layout");
    if (layout === "flat" || layout === "tree") return layout;
    return localStorage.getItem("layoutMode") === "flat" ? "flat" : "tree";
}

function parseSortMode() {
    const sort = new URLSearchParams(window.location.search).get("sort");
    if (sort === "attempt" || sort === "created_at" || sort === "dandiset_id") return sort;
    const storedSortMode = localStorage.getItem("sortMode");
    if (storedSortMode === "attempt" || storedSortMode === "created_at" || storedSortMode === "dandiset_id")
        return storedSortMode;
    return "attempt";
}

function parseSortDirection() {
    const sortDir = new URLSearchParams(window.location.search).get("sortDir");
    if (sortDir === "asc" || sortDir === "desc") return sortDir;
    return localStorage.getItem("sortDirection") === "asc" ? "asc" : "desc";
}

function updateLayoutModeUrl(mode) {
    if (mode !== "flat" && mode !== "tree") return;
    const params = new URLSearchParams(window.location.search);
    params.set("layout", mode);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

function updateSortModeUrl(mode) {
    if (mode !== "attempt" && mode !== "created_at" && mode !== "dandiset_id") return;
    const params = new URLSearchParams(window.location.search);
    params.set("sort", mode);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

function updateSortDirectionUrl(direction) {
    if (direction !== "asc" && direction !== "desc") return;
    const params = new URLSearchParams(window.location.search);
    params.set("sortDir", direction);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

function codeRepoBlobUrl(path) {
    return `${CODE_REPO_URL}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function codeRepoRawUrl(path) {
    return `https://raw.githubusercontent.com/dandi-compute/dandi-compute-core/main/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function dandiBaseUrl(_dandisetId) {
    return "https://dandiarchive.org";
}

/* ─── URL-based filtering ───────────────────────────────────── */
function parseFilter() {
    const params = new URLSearchParams(window.location.search);
    return {
        dandisetId: params.get("dandiset") ?? null,
        subject: params.get("subject") ?? null,
        session: params.get("session") ?? null,
        pipelineVersion: params.get("version") ?? null,
        paramsType: params.get("params") ?? null,
        configType: params.get("config") ?? null,
        dandiCodebaseHash: params.get("codebaseHash") ?? null,
        dandiCodebaseVersion: params.get("codebaseVersion") ?? null,
        assetSize: params.get("assetSize") ?? null,
        failureStep: params.get("failureStep") ?? null,
        status: params.get("status") ?? null,
    };
}

// Extract a stable hash-like identifier for the dandi-compute/dandi-compute-core source
// backing a run. Prefer explicit commit-looking versions, then commit-like
// `+hash` segments, and finally fall back to the raw version text.
function runDandiCodebaseHash(run) {
    const generatedByEntries = Array.isArray(run.generatedBy) ? run.generatedBy : [];
    for (const entry of generatedByEntries) {
        if (!DANDI_CODE_REPO_PATTERN.test(String(entry.CodeURL ?? ""))) continue;
        const version = String(entry.Version ?? "").trim();
        if (!version) continue;
        if (COMMIT_HASH_PATTERN.test(version)) return version;
        const refCandidate = pipelineCompareRefCandidates(version)[0];
        if (refCandidate) return refCandidate;
        return version;
    }
    return null;
}

// Resolve a run params identifier to a registered alias when available;
// otherwise preserve the raw params value for matching and display.
function runParamsType(run) {
    const alias = resolveRegistryAlias(run.paramsProfile, PARAMS_REGISTRY)?.alias;
    return alias ?? run.paramsProfile ?? null;
}

// Resolve a run config identifier to a registered alias when available;
// otherwise preserve the raw config value for matching and display.
function runConfigType(run) {
    const alias = resolveRegistryAlias(run.configHash, CONFIG_REGISTRY)?.alias;
    return alias ?? run.configHash ?? null;
}

function matchesResolvedOrRawValue(filterValue, resolvedValue, rawValue) {
    if (!filterValue) return true;
    return resolvedValue === filterValue || rawValue === filterValue;
}

function classifyFailedTaskStep(taskName = "") {
    const normalized = String(taskName).toLowerCase();
    if (/dispatch/.test(normalized)) return "job-dispatch";
    if (/pre[\s_-]*process/.test(normalized)) return "pre-processing";
    if (/post[\s_-]*process/.test(normalized)) return "post-processing";
    return "other";
}

function isFailedStatus(status) {
    return String(status).toLowerCase() === "failed";
}

function runFailureStep(run) {
    if (!isFailedStatus(run.status)) return null;
    const failedTasks = (run.tasks ?? []).filter((task) => isFailedStatus(task.status));
    if (failedTasks.length === 0) return "other";

    const failedSteps = failedTasks.map((task) => classifyFailedTaskStep(task.name));
    if (failedSteps.includes("pre-processing")) return "pre-processing";
    if (failedSteps.includes("post-processing")) return "post-processing";
    if (failedSteps.includes("job-dispatch")) return "job-dispatch";
    return "other";
}

// Whether any user-facing filter parameter is active (shared by the filter
// banner, the queue loader, and hydration flushes).
function isFilterActive(filter) {
    return !!(
        filter.dandisetId ||
        filter.subject ||
        filter.session ||
        filter.pipelineVersion ||
        filter.paramsType ||
        filter.configType ||
        filter.dandiCodebaseVersion ||
        filter.assetSize ||
        filter.failureStep ||
        filter.status
    );
}

// Flag-only status: what we can know before any blob fetch. Prefers an
// explicit upstream status when the state entry carries one.
function deriveFlagStatus(run) {
    if (run.stateStatus) return run.stateStatus;
    return run.hasOutput
        ? "success"
        : run.hasBeenSubmitted && !run.hasLogs
          ? "running"
          : !run.hasLogs && run.hasCode
            ? "queued"
            : "failed";
}

// Skeleton run for the immediate first render: flag-derived status plus
// everything derivable synchronously from the entry's output_paths map
// (visualization images, log-file listing). The trace-refined status,
// failureStep, tasks, provenance, QC, and viz links arrive later via the
// hydration passes. failureStep stays null (= "not yet known") rather than
// defaulting to "other" so failure-step filters never transiently over-match
// before hydration.
//
// statusProvisional marks runs whose displayed status glyph could still change
// once the trace lands: a run with output counts as "success" from flags alone,
// but its trace may reveal failed tasks. Runs without output (or with an
// authoritative upstream status) can only gain detail, never flip — their
// badges are trustworthy immediately.
function buildInitialRun(run) {
    return {
        ...run,
        status: deriveFlagStatus(run),
        failureStep: run.stateFailureStep ?? null,
        statusProvisional: !run.stateStatus && !!(run.hasOutput && run.hasLogs),
        tasks: [],
        generatedBy: [],
        datasetDescription: null,
        vizData: run.hasOutput ? fetchVisualizationData(run) : null,
        vizLinks: null,
        qualityControl: null,
        logFiles: runLogFiles(run),
        traceLoaded: !run.hasLogs, // nothing to fetch for runs without logs
        // Whether a trace has confirmed status/failureStep at least once.
        // Unlike traceLoaded this survives the filter-change soft reset, so a
        // released run's badges stay truthful without a background refetch.
        statusSettled: !run.hasLogs,
        detailsLoaded: false,
        detailQueued: false,
        qcLoaded: false,
        qcQueued: false,
    };
}

// Job capsules are identified by their job id. Runs from before job ids were
// introduced carry an attempt number instead.
function runIdentityLabel(run) {
    if (run.jobId) return `Job&nbsp;${e(String(run.jobId))}`;
    return `Attempt&nbsp;${e(String(run.attempt))}`;
}

function normalizeStatus(status) {
    return status ? String(status).toLowerCase() : null;
}

function isStalled(run) {
    if (run.status !== "running" || !run.createdAt) return false;
    return Date.now() - new Date(run.createdAt).getTime() > 24 * 60 * 60 * 1000;
}

function applyFilter(runs, filter) {
    const normalizedFilterStatus = normalizeStatus(filter.status);
    return runs.filter((r) => {
        if (filter.dandisetId && r.dandisetId !== filter.dandisetId) return false;
        if (filter.subject && r.subject !== filter.subject) return false;
        if (filter.session && r.session !== filter.session) return false;
        if (filter.pipelineVersion && r.pipelineVersion !== filter.pipelineVersion) return false;
        if (!matchesResolvedOrRawValue(filter.paramsType, runParamsType(r), r.paramsProfile)) return false;
        if (!matchesResolvedOrRawValue(filter.configType, runConfigType(r), r.configHash)) return false;
        if (filter.dandiCodebaseHash && runDandiCodebaseHash(r) !== filter.dandiCodebaseHash) return false;
        if (filter.dandiCodebaseVersion && r.codebase !== filter.dandiCodebaseVersion) return false;
        if (filter.assetSize && !matchesAssetSizeExpr(r, filter.assetSize)) return false;
        if (normalizedFilterStatus === "stalled") {
            if (!isStalled(r)) return false;
        } else if (normalizedFilterStatus === "running") {
            if (String(r.status).toLowerCase() !== "running" || isStalled(r)) return false;
        } else if (normalizedFilterStatus && String(r.status).toLowerCase() !== normalizedFilterStatus) return false;
        if (filter.failureStep) {
            if (!isFailedStatus(r.status)) return false;
            const failedStep = r.failureStep;
            if (filter.failureStep === "exclude-job-dispatch") return failedStep !== "job-dispatch";
            return failedStep === filter.failureStep;
        }
        return true;
    });
}

/* Build a page URL with the given filter parameters.
   When on a named dashboard page (dashboard, tests, or archive), the matching
   view param is automatically preserved so navigation stays within that scope. */
function narrowUrl(params) {
    const sp = new URLSearchParams();
    sp.set("layout", parseLayoutMode());
    sp.set("sort", parseSortMode());
    sp.set("sortDir", parseSortDirection());
    if (_viewMode === "dashboard" || _viewMode === "tests" || _viewMode === "archive") sp.set("view", _viewMode);
    if (params.dandiset) sp.set("dandiset", params.dandiset);
    if (params.subject) sp.set("subject", params.subject);
    if (params.session) sp.set("session", params.session);
    if (params.pipelineVersion) sp.set("version", params.pipelineVersion);
    if (params.paramsType) sp.set("params", params.paramsType);
    if (params.configType) sp.set("config", params.configType);
    if (params.dandiCodebaseVersion) sp.set("codebaseVersion", params.dandiCodebaseVersion);
    if (params.assetSize) sp.set("assetSize", params.assetSize);
    if (params.failureStep) sp.set("failureStep", params.failureStep);
    if (params.status) sp.set("status", params.status);
    const qs = sp.toString();
    return qs ? `?${qs}` : "./";
}

const FILTER_VALUE_COLLATOR = new Intl.Collator();
const uniqueSortedValues = (items) => [...new Set(items.filter(Boolean))].sort(FILTER_VALUE_COLLATOR.compare);
const FAILURE_STEP_FILTER_OPTIONS = ["exclude-job-dispatch", "pre-processing", "post-processing"];
const STATUS_LABELS = {
    success: "Successful",
    failed: "Failed",
    queued: "Queued",
    running: "Running",

    stalled: "Stalled",
};
const DECIMAL_DATA_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
const DATA_SIZE_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function normalizeByteCount(value) {
    if (value === null || value === undefined || value === "") return null;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) return null;
    return Math.round(numericValue);
}

function runByteCount(run) {
    return normalizeByteCount(run?.assetSizeBytes);
}

// Asset-size filter expression. The user types one or more comparison clauses
// (combined with AND), comma-separated, with values in GB (decimal, 1 GB = 1e9
// bytes). The "GB" unit and surrounding whitespace are optional, so all of
// "> 10", ">10 GB", and ">50 GB, <100 GB" are accepted. Operators: > >= < <= =.
const ASSET_SIZE_GB = 1e9;
const ASSET_SIZE_SUGGESTIONS = ["> 10", "> 50", "< 10", "> 50, < 100", ">= 100"];
const ASSET_SIZE_CLAUSE_PATTERN = /^(>=|<=|==|=|>|<)\s*([0-9]*\.?[0-9]+)\s*(?:gb?)?$/i;

// Parse an expression into [{ op, bytes }] clauses, or null when empty/invalid
// (any malformed clause invalidates the whole expression).
function parseAssetSizeExpr(expr) {
    if (!expr) return null;
    const clauses = String(expr)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (clauses.length === 0) return null;
    const parsed = [];
    for (const clause of clauses) {
        const m = clause.match(ASSET_SIZE_CLAUSE_PATTERN);
        if (!m) return null;
        const gb = parseFloat(m[2]);
        if (!Number.isFinite(gb)) return null;
        parsed.push({ op: m[1] === "==" ? "=" : m[1], bytes: gb * ASSET_SIZE_GB });
    }
    return parsed;
}

// Whether a run's asset size satisfies the expression. An empty/invalid
// expression imposes no constraint; a run with unknown size never matches a
// (valid) size filter.
function matchesAssetSizeExpr(run, expr) {
    const clauses = parseAssetSizeExpr(expr);
    if (!clauses) return true;
    const bytes = runByteCount(run);
    if (bytes === null) return false;
    return clauses.every(({ op, bytes: threshold }) => {
        switch (op) {
            case ">":
                return bytes > threshold;
            case ">=":
                return bytes >= threshold;
            case "<":
                return bytes < threshold;
            case "<=":
                return bytes <= threshold;
            case "=":
                return Math.round(bytes / ASSET_SIZE_GB) === Math.round(threshold / ASSET_SIZE_GB);
            default:
                return true;
        }
    });
}

// Build the params object for narrowUrl from the full current filter, omitting
// the given filter keys. Used for each filter input's "clear" link so it drops
// only its own dimension (with the dandiset→subject→session cascade) while
// preserving every other active filter.
function filterNarrowParams(filter, omit = []) {
    const all = {
        dandiset: filter.dandisetId,
        subject: filter.subject,
        session: filter.session,
        pipelineVersion: filter.pipelineVersion,
        paramsType: filter.paramsType,
        configType: filter.configType,
        dandiCodebaseVersion: filter.dandiCodebaseVersion,
        assetSize: filter.assetSize,
        failureStep: filter.failureStep,
        status: filter.status,
    };
    for (const key of omit) delete all[key];
    return all;
}

function sumRunByteCounts(runs) {
    return runs.reduce((sum, run) => {
        const bytes = runByteCount(run);
        return bytes === null ? sum : sum + bytes;
    }, 0);
}

function formatByteCount(value) {
    if (!Number.isFinite(value) || value < 0) return "0 B";
    let scaledValue = value;
    let unitIndex = 0;
    while (scaledValue >= 1000 && unitIndex < DECIMAL_DATA_SIZE_UNITS.length - 1) {
        scaledValue /= 1000;
        unitIndex += 1;
    }
    return `${DATA_SIZE_FORMATTER.format(scaledValue)} ${DECIMAL_DATA_SIZE_UNITS[unitIndex]}`;
}

function renderFilterInput(name, label, value, suggestions, clearHref = null, placeholder = "") {
    const listId = `filter-options-${name}`;
    const options = suggestions.map((item) => `<option value="${e(item)}"></option>`).join("");
    const clearBtn = clearHref
        ? `<a class="filter-input-clear${value ? " filter-input-clear-active" : ""}" href="${e(clearHref)}" title="Clear ${label} filter" aria-label="Clear ${label} filter">×</a>`
        : "";
    const placeholderAttr = placeholder ? ` placeholder="${e(placeholder)}"` : "";
    return `
<label class="filter-input-wrap">
    <span class="filter-input-label">${label}</span>
    <span class="filter-input-row">
        <input class="filter-input" name="${name}" value="${e(value ?? "")}" list="${listId}" autocomplete="off"${placeholderAttr}>
        ${clearBtn}
    </span>
    <datalist id="${listId}">${options}</datalist>
</label>`;
}

function renderFilterBanner(filter, availableRuns = []) {
    const banner = document.getElementById("filter-banner");
    const layoutMode = parseLayoutMode();
    const sortMode = parseSortMode();
    const sortDirection = parseSortDirection();
    const isFiltered = isFilterActive(filter);

    const crumbs = [];
    if (filter.dandisetId) {
        crumbs.push(
            `<a class="filter-crumb" href="${narrowUrl({ dandiset: filter.dandisetId })}">Dandiset&nbsp;${e(filter.dandisetId)}</a>`
        );
    }
    if (filter.subject) {
        crumbs.push(
            `<a class="filter-crumb" href="${narrowUrl({ dandiset: filter.dandisetId, subject: filter.subject })}">Sub:&nbsp;${e(filter.subject)}</a>`
        );
    }
    if (filter.session) {
        crumbs.push(
            `<a class="filter-crumb" href="${narrowUrl({ dandiset: filter.dandisetId, subject: filter.subject, session: filter.session })}">Ses:&nbsp;${e(filter.session)}</a>`
        );
    }
    if (filter.pipelineVersion) {
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ pipelineVersion: filter.pipelineVersion }))}">Ver:&nbsp;${e(filter.pipelineVersion)}</a>`
        );
    }
    if (filter.paramsType) {
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ paramsType: filter.paramsType }))}">Params:&nbsp;${e(filter.paramsType)}</a>`
        );
    }
    if (filter.configType) {
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ configType: filter.configType }))}">Config:&nbsp;${e(filter.configType)}</a>`
        );
    }
    if (filter.dandiCodebaseVersion) {
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ dandiCodebaseVersion: filter.dandiCodebaseVersion }))}">Compute&nbsp;ver:&nbsp;${e(filter.dandiCodebaseVersion)}</a>`
        );
    }
    if (filter.assetSize) {
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ assetSize: filter.assetSize }))}">Size:&nbsp;${e(filter.assetSize)}</a>`
        );
    }
    if (filter.failureStep) {
        const failureStepLabel =
            filter.failureStep === "exclude-job-dispatch"
                ? "Failed (except dispatch)"
                : filter.failureStep === "pre-processing"
                  ? "Failed in pre-processing"
                  : filter.failureStep === "post-processing"
                    ? "Failed in post-processing"
                    : `Failed in ${filter.failureStep}`;
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ failureStep: filter.failureStep }))}">${e(failureStepLabel)}</a>`
        );
    }
    if (filter.status) {
        const statusLabel = normalizeStatus(filter.status);
        const summaryStatusLabel = STATUS_LABELS[statusLabel] ?? `Status: ${filter.status}`;
        crumbs.push(
            `<a class="filter-crumb" href="${e(narrowUrl({ status: filter.status }))}">${e(summaryStatusLabel)}</a>`
        );
    }

    const runsMatchingDandiset = filter.dandisetId
        ? availableRuns.filter((run) => run.dandisetId === filter.dandisetId)
        : availableRuns;
    const runsMatchingSubject = filter.subject
        ? runsMatchingDandiset.filter((run) => run.subject === filter.subject)
        : runsMatchingDandiset;
    const dandisets = uniqueSortedValues(availableRuns.map((r) => r.dandisetId));
    const subjects = uniqueSortedValues(runsMatchingDandiset.map((r) => r.subject));
    const sessions = uniqueSortedValues(runsMatchingSubject.map((r) => r.session));
    const versions = uniqueSortedValues(availableRuns.map((r) => r.pipelineVersion));
    const paramsTypes = uniqueSortedValues(availableRuns.map(runParamsType));
    const configTypes = uniqueSortedValues(availableRuns.map(runConfigType));
    const dandiCodebaseVersions = uniqueSortedValues(availableRuns.map((r) => r.codebase));
    const failureSteps = uniqueSortedValues([
        ...FAILURE_STEP_FILTER_OPTIONS,
        ...availableRuns
            .filter((run) => isFailedStatus(run.status))
            .map((run) => run.failureStep)
            .filter((step) => step !== "other"),
    ]);
    const filteredViewHtml = isFiltered
        ? `<div class="filter-banner-active">
    <span class="filter-banner-label">Filtered view:</span>
    <span class="filter-crumbs">${crumbs.join('<span class="filter-sep">/</span>')}</span>
</div>`
        : "";

    const scopedPageBanners = {
        tests: {
            label: "🧪 Tests",
            desc: "Showing internal test runs only (Dandiset 001849)",
        },
        archive: {
            label: "🗄️ Archive",
            desc: "Showing archived failing runs only (separate from the main queue)",
        },
    };
    const scopedBanner = scopedPageBanners[_viewMode];
    const testsPageHtml = scopedBanner
        ? `<div class="tests-page-banner">
    <span class="tests-page-label">${scopedBanner.label}</span>
    <span class="tests-page-desc">${scopedBanner.desc}</span>
    <a class="tests-back-link" href="?view=dashboard">← Back to dashboard</a>
</div>`
        : "";

    const viewHiddenInput = _viewMode ? `<input type="hidden" name="view" value="${_viewMode}">` : "";
    const layoutHiddenInput = `<input type="hidden" name="layout" value="${layoutMode}">`;
    const sortHiddenInput = `<input type="hidden" name="sort" value="${sortMode}">`;
    const sortDirectionHiddenInput = `<input type="hidden" name="sortDir" value="${sortDirection}">`;
    const statuses = Object.keys(STATUS_LABELS);
    const clearAllParams = new URLSearchParams();
    clearAllParams.set("layout", layoutMode);
    clearAllParams.set("sort", sortMode);
    clearAllParams.set("sortDir", sortDirection);
    if (_viewMode === "dashboard" || _viewMode === "tests" || _viewMode === "archive")
        clearAllParams.set("view", _viewMode);
    const clearAllHref = `?${clearAllParams.toString()}`;

    banner.innerHTML = `
${testsPageHtml}<div class="filter-banner-main">
    <span class="filter-banner-label">Filter runs:</span>
    <form class="filter-form" method="get" action="">
        ${viewHiddenInput}
        ${layoutHiddenInput}
        ${sortHiddenInput}
        ${sortDirectionHiddenInput}
        ${renderFilterInput("dandiset", "Dandiset", filter.dandisetId, dandisets, narrowUrl(filterNarrowParams(filter, ["dandiset", "subject", "session"])))}
        ${renderFilterInput("subject", "Subject", filter.subject, subjects, narrowUrl(filterNarrowParams(filter, ["subject", "session"])))}
        ${renderFilterInput("session", "Session", filter.session, sessions, narrowUrl(filterNarrowParams(filter, ["session"])))}
        ${renderFilterInput("assetSize", "Asset Size (GB)", filter.assetSize, ASSET_SIZE_SUGGESTIONS, narrowUrl(filterNarrowParams(filter, ["assetSize"])), "e.g. >10  or  >50, <100")}
        ${renderFilterInput("params", "Params Type", filter.paramsType, paramsTypes, narrowUrl(filterNarrowParams(filter, ["paramsType"])))}
        ${renderFilterInput("config", "Config Type", filter.configType, configTypes, narrowUrl(filterNarrowParams(filter, ["configType"])))}
        ${renderFilterInput("version", "Pipeline Version", filter.pipelineVersion, versions, narrowUrl(filterNarrowParams(filter, ["pipelineVersion"])))}
        ${renderFilterInput("codebaseVersion", "Compute Codebase Version", filter.dandiCodebaseVersion, dandiCodebaseVersions, narrowUrl(filterNarrowParams(filter, ["dandiCodebaseVersion"])))}
        ${renderFilterInput("status", "Status", filter.status, statuses, narrowUrl(filterNarrowParams(filter, ["status"])))}
        ${renderFilterInput("failureStep", "Failure Step", filter.failureStep, failureSteps, narrowUrl(filterNarrowParams(filter, ["failureStep"])))}
        <div class="filter-actions">
            <a class="filter-clear" href="${clearAllHref}">× View all runs</a>
            <button class="filter-apply" type="submit">Apply</button>
        </div>
    </form>
</div>
${filteredViewHtml}`;

    const form = banner.querySelector(".filter-form");
    const dandisetInput = form?.querySelector('input[name="dandiset"]');
    const subjectInput = form?.querySelector('input[name="subject"]');
    const sessionInput = form?.querySelector('input[name="session"]');
    const subjectDatalist = banner.querySelector("#filter-options-subject");
    const sessionDatalist = banner.querySelector("#filter-options-session");
    const renderDatalistOptions = (datalist, values) => {
        if (!datalist) return;
        datalist.innerHTML = values.map((item) => `<option value="${e(item)}"></option>`).join("");
    };
    const refreshDependentFilterOptions = () => {
        const selectedDandiset = dandisetInput?.value ?? "";
        const nextRunsMatchingDandiset = selectedDandiset
            ? availableRuns.filter((run) => run.dandisetId === selectedDandiset)
            : availableRuns;
        const nextSubjects = uniqueSortedValues(nextRunsMatchingDandiset.map((run) => run.subject));
        renderDatalistOptions(subjectDatalist, nextSubjects);
        if (subjectInput && subjectInput.value && !nextSubjects.includes(subjectInput.value)) {
            subjectInput.value = "";
        }

        const selectedSubject = subjectInput?.value ?? "";
        const nextRunsMatchingSubject = selectedSubject
            ? nextRunsMatchingDandiset.filter((run) => run.subject === selectedSubject)
            : nextRunsMatchingDandiset;
        const nextSessions = uniqueSortedValues(nextRunsMatchingSubject.map((run) => run.session));
        renderDatalistOptions(sessionDatalist, nextSessions);
        if (sessionInput && sessionInput.value && !nextSessions.includes(sessionInput.value)) {
            sessionInput.value = "";
        }
    };
    if (dandisetInput) {
        dandisetInput.addEventListener("input", refreshDependentFilterOptions);
    }
    if (subjectInput) {
        subjectInput.addEventListener("input", refreshDependentFilterOptions);
    }

    banner.style.display = "";
}

function setPageCopy(title, subtitleHtml) {
    const titleEl = document.querySelector("h1");
    const subtitleEl = document.querySelector(".page-subtitle");
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.innerHTML = subtitleHtml;
}

/* ─── Theme toggle ──────────────────────────────────────────── */
function initTheme() {
    const btn = document.getElementById("theme_toggle_btn");
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : prefersDark;
    applyTheme(isDark ? "dark" : "light", btn);
    btn.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        applyTheme(next, btn);
        localStorage.setItem("theme", next);
    });
}

/* ─── Footer ────────────────────────────────────────────────── */
function initVersion() {
    const el = document.getElementById("site_version");
    if (el) el.textContent = `v${APP_VERSION}`;
}

function applyTheme(theme, btn) {
    if (theme === "light") {
        document.documentElement.dataset.theme = "light";
        btn.setAttribute("aria-label", "Switch to dark mode");
        btn.title = "Switch to dark mode";
        btn.innerHTML = SUN_ICON;
    } else {
        delete document.documentElement.dataset.theme;
        btn.setAttribute("aria-label", "Switch to light mode");
        btn.title = "Switch to light mode";
        btn.innerHTML = MOON_ICON;
    }
}

const MOON_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>`;
const SUN_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.22 3.22l1.42 1.42M15.36 15.36l1.42 1.42M3.22 16.78l1.42-1.42M15.36 4.64l1.42-1.42" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;

// Marks links that open in Neurosift, so it's clear before clicking where they lead.
const NEUROSIFT_ICON_HTML = `<img class="neurosift-icon" src="assets/neurosift-icon.png" alt="" aria-hidden="true" width="14" height="14" />`;
// Marks links that open in the DANDI archive, so it's clear before clicking where they lead.
const DANDI_ICON_HTML = `<img class="dandi-icon" src="assets/dandi-icon.png" alt="" aria-hidden="true" width="14" height="14" />`;

/* ─── ETag-aware fetch cache ────────────────────────────────── */
// Caches response bodies in sessionStorage keyed by URL together with the
// server's ETag.  Subsequent requests send "If-None-Match" so the server can
// respond with 304 Not Modified, avoiding a redundant download.  Storage
// errors (quota exceeded, private-browsing restrictions) are silently ignored
// so that a failed cache write never prevents the fetch from succeeding.
const ETAG_CACHE_PREFIX = "aind_etag:";

async function cachedFetch(url, init = {}) {
    // Content-addressed S3 blobs are immutable: a cache hit never needs
    // revalidation, so skip the conditional-GET machinery entirely.
    if (isImmutableBlobUrl(url)) return blobCachedFetch(url, init);

    const cacheKey = ETAG_CACHE_PREFIX + url;
    let cached = null;
    try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) cached = JSON.parse(raw);
    } catch {
        /* sessionStorage unavailable or parse error; proceed without cache */
    }

    const headers = new Headers(init.headers ?? {});
    if (cached?.etag) {
        headers.set("If-None-Match", cached.etag);
    }

    const resp = await fetch(url, { ...init, headers });

    if (resp.status === 304 && cached) {
        return new Response(cached.body, {
            status: cached.status ?? 200,
            headers: { "Content-Type": cached.contentType ?? "" },
        });
    }

    if (!resp.ok) return resp;

    const body = await resp.text();
    const etag = resp.headers.get("ETag");
    const contentType = resp.headers.get("Content-Type") ?? "";

    if (etag) {
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ etag, body, contentType, status: resp.status }));
        } catch {
            /* Ignore storage errors (e.g., quota exceeded) */
        }
    }

    return new Response(body, { status: resp.status, headers: { "Content-Type": contentType } });
}

/* ─── Immutable S3 blob cache ───────────────────────────────── */
// DANDI S3 blob URLs are content-addressed (the blob id is a content hash), so
// the body behind a given URL can never change — a re-run surfaces as new blob
// ids in the queue state. Cached blobs therefore never need revalidation and
// are stored persistently in the Cache API (large quota, shared across
// tabs/sessions), with the sessionStorage ETag-cache format as a fallback for
// contexts without CacheStorage. A per-page memory Map sits on top so repeat
// loads in the same tab (e.g. the manual queue refresh) skip storage entirely.
// Every cache operation is best-effort: failures fall through to the network.
const BLOB_CACHE_NAME = "aind-blobs-v1";
const BLOB_MEMORY_CACHE_MAX_BODY = 512 * 1024; // keep huge bodies out of the Map
// Hard cap on the Map's total retained bytes: page memory must stay flat as
// background hydration sweeps thousands of blobs. Oldest entries evict first
// (Map iteration order; reads refresh recency); the Cache API remains the
// durable warm layer, so eviction only costs a disk re-read.
const BLOB_MEMORY_CACHE_MAX_TOTAL = 24 * 1024 * 1024;
const _blobMemoryCache = new Map(); // url -> { body, contentType, status }
let _blobMemoryCacheBytes = 0;

function blobMemoryCachePut(url, entry) {
    if (entry.body.length > BLOB_MEMORY_CACHE_MAX_BODY) return;
    const existing = _blobMemoryCache.get(url);
    if (existing) {
        _blobMemoryCacheBytes -= existing.body.length;
        _blobMemoryCache.delete(url);
    }
    _blobMemoryCache.set(url, entry);
    _blobMemoryCacheBytes += entry.body.length;
    for (const [oldUrl, oldEntry] of _blobMemoryCache) {
        if (_blobMemoryCacheBytes <= BLOB_MEMORY_CACHE_MAX_TOTAL) break;
        _blobMemoryCache.delete(oldUrl);
        _blobMemoryCacheBytes -= oldEntry.body.length;
    }
}

// Release every retained blob body (used by the filter-change soft reset).
// Only the in-memory layer is dropped: the persistent Cache API store (or its
// sessionStorage fallback) keeps the bytes, so later reads are disk hits.
function clearBlobMemoryCache() {
    _blobMemoryCache.clear();
    _blobMemoryCacheBytes = 0;
}

// Test hook: current retained-entry count and byte total of the memory layer.
function blobMemoryCacheStats() {
    return { entries: _blobMemoryCache.size, bytes: _blobMemoryCacheBytes };
}

function isImmutableBlobUrl(url) {
    return typeof url === "string" && url.startsWith(`${S3_BLOB_BASE}/`);
}

async function openBlobCache() {
    if (typeof caches === "undefined") return null;
    try {
        return await caches.open(BLOB_CACHE_NAME);
    } catch {
        return null; // insecure context or storage restrictions
    }
}

// Drop persistent blob caches left behind by older cache-name versions.
function pruneStaleBlobCaches() {
    if (typeof caches === "undefined") return;
    caches
        .keys()
        .then((names) =>
            Promise.all(
                names
                    .filter((name) => name.startsWith("aind-blobs-") && name !== BLOB_CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
        .catch(() => {});
}

function blobResponse({ body, contentType, status }) {
    return new Response(body, { status: status ?? 200, headers: { "Content-Type": contentType ?? "" } });
}

async function readCachedBlob(url) {
    const memoryHit = _blobMemoryCache.get(url);
    if (memoryHit) {
        blobMemoryCachePut(url, memoryHit); // refresh recency for eviction order
        return blobResponse(memoryHit);
    }

    const cache = await openBlobCache();
    if (cache) {
        try {
            const match = await cache.match(url);
            if (match) {
                const entry = {
                    body: await match.text(),
                    contentType: match.headers.get("Content-Type") ?? "",
                    status: match.status,
                };
                blobMemoryCachePut(url, entry);
                return blobResponse(entry);
            }
        } catch {
            /* fall through to the sessionStorage fallback */
        }
    }

    try {
        const raw = sessionStorage.getItem(ETAG_CACHE_PREFIX + url);
        if (raw) return blobResponse(JSON.parse(raw));
    } catch {
        /* sessionStorage unavailable or parse error */
    }
    return null;
}

function writeCachedBlob(url, body, contentType, status) {
    const entry = { body, contentType, status };
    blobMemoryCachePut(url, entry);

    if (typeof caches !== "undefined") {
        openBlobCache()
            .then((cache) => cache?.put(url, blobResponse(entry)))
            .catch(() => {});
        return;
    }
    // No CacheStorage: fall back to the sessionStorage ETag-cache format so the
    // entry is still readable by readCachedBlob (no etag → no revalidation).
    try {
        sessionStorage.setItem(ETAG_CACHE_PREFIX + url, JSON.stringify(entry));
    } catch {
        /* Ignore storage errors (e.g., quota exceeded) */
    }
}

async function blobCachedFetch(url, init = {}) {
    const hit = await readCachedBlob(url);
    if (hit) return hit;

    const resp = await fetch(url, init); // plain GET: no If-None-Match needed
    if (!resp.ok) return resp; // never cache failures

    const body = await resp.text();
    const contentType = resp.headers.get("Content-Type") ?? "";
    writeCachedBlob(url, body, contentType, resp.status);
    return blobResponse({ body, contentType, status: resp.status });
}

function normalizeRegistryEntries(registryEntries) {
    if (!registryEntries || typeof registryEntries !== "object" || Array.isArray(registryEntries)) return [];
    return Object.entries(registryEntries).flatMap(([alias, entry]) => {
        if (typeof alias !== "string" || !alias.trim()) return [];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        if (typeof entry.path !== "string" || !entry.path.trim()) return [];
        if (typeof entry.md5 !== "string" || !entry.md5.trim()) return [];
        return [
            {
                alias,
                md5: entry.md5.toLowerCase(),
                path: entry.path,
                priority: alias === "default" ? 0 : REGISTRY_FALLBACK_ALIAS_PRIORITY,
            },
        ];
    });
}

async function fetchRegistryEntries(path, kindLabel) {
    const response = await cachedFetch(codeRepoRawUrl(path));
    if (!response.ok) {
        throw new Error(`Failed to load ${kindLabel} registry (HTTP ${response.status}).`);
    }
    const entries = normalizeRegistryEntries(await response.json());
    if (entries.length === 0) {
        throw new Error(`Loaded ${kindLabel} registry is empty or invalid.`);
    }
    return entries;
}

async function loadAindPipelineRegistries() {
    const [paramsResult, configResult] = await Promise.allSettled([
        fetchRegistryEntries(REGISTERED_PARAMS_PATH, "params"),
        fetchRegistryEntries(REGISTERED_CONFIGS_PATH, "config"),
    ]);
    if (paramsResult.status === "fulfilled") {
        PARAMS_REGISTRY = paramsResult.value;
    } else {
        console.warn(paramsResult.reason?.message ?? "Failed to load params registry.");
    }
    if (configResult.status === "fulfilled") {
        CONFIG_REGISTRY = configResult.value;
    } else {
        console.warn(configResult.reason?.message ?? "Failed to load config registry.");
    }
    return { paramsRegistry: PARAMS_REGISTRY, configRegistry: CONFIG_REGISTRY };
}

// Memoized registry load so init() and loadQueueData() can share one in-flight
// fetch; kicked off without await so it overlaps the queue-state/blob fetches.
// loadAindPipelineRegistries never rejects (it warns and falls back to raw
// values), so awaiting this promise cannot introduce a new failure mode.
let _registriesReady = null;

function ensureRegistriesLoaded() {
    if (!_registriesReady) _registriesReady = loadAindPipelineRegistries();
    return _registriesReady;
}

/* ─── Data fetching ─────────────────────────────────────────── */
// Every draft Dandiset version publishes a bulk `assets.jsonld` manifest
// (path + contentUrl per asset) directly on the public DANDI S3 bucket -- the
// same manifest dandi_compute_code.dandiset.load_assets_jsonld_metadata reads
// on the backend. It's the only way to resolve jobs.tsv's and paths.tsv's
// current S3 blob URLs, since (unlike a run's output artifacts) nothing else in
// the queue data already carries their content-ids.
function assetsJsonldUrl(dandisetId) {
    return `https://dandiarchive.s3.amazonaws.com/dandisets/${dandisetId}/draft/assets.jsonld`;
}

function queueStateCacheKey() {
    return ETAG_CACHE_PREFIX + assetsJsonldUrl(DERIVATIVES_DANDISET_ID);
}

function archiveStateCacheKey() {
    return ETAG_CACHE_PREFIX + assetsJsonldUrl(ARCHIVE_DANDISET_ID);
}

// Minimal RFC4180-style tab-delimited parser matching Python's csv module
// (the writer used to produce jobs.tsv and paths.tsv): fields are unquoted unless they
// contain the delimiter, a quote, or a newline, in which case they're
// wrapped in double quotes with embedded quotes doubled.
function parseTsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }
        if (char === '"' && field === "") {
            inQuotes = true;
        } else if (char === "\t") {
            row.push(field);
            field = "";
        } else if (char === "\r") {
            // ignore; paired \n below terminates the row
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// Parse a tab-separated table (header + rows) into one object per non-empty
// row, keyed by column name. Every value stays a string; empty cells are "".
function parseTsvRecords(text) {
    if (!text || !text.trim()) return [];
    const rows = parseTsvRows(text);
    if (!rows.length) return [];
    const [header, ...dataRows] = rows;
    return dataRows
        .filter((cols) => cols.some((cell) => cell !== ""))
        .map((cols) => Object.fromEntries(header.map((key, i) => [key, cols[i] ?? ""])));
}

// A job capsule's own dataset_description.json sits directly in its capsule
// directory, which is named after its job id ("…/pipeline-{name}/{job_id}/").
// Output subtrees can carry dataset_description.json files of their own, so
// the capsule's is the one whose parent directory is the job id, falling back
// to the shallowest when none is (a capsule named some other way).
function capsuleDatasetDescriptionPath(jobId, paths) {
    const candidates = paths.filter((path) => path.endsWith("/dataset_description.json"));
    if (candidates.length === 0) return null;
    const suffix = `/${jobId}/dataset_description.json`;
    const named = candidates.find((path) => path.endsWith(suffix));
    if (named) return named;
    return candidates.reduce((shallowest, path) =>
        path.split("/").length < shallowest.split("/").length ? path : shallowest
    );
}

// Join jobs.tsv rows with their paths.tsv rows into the queue-entry shape
// parseQueueEntries reads:
//   - `run_path` is the capsule directory, taken from its dataset_description.json;
//   - `dataset_description_path` / `output_paths` map each asset path to its blob id;
//   - the presence flags come from the capsule's `status` (pending → code only,
//     stalled → submitted, failed → logs without output, successful → output)
//     plus whether any of its assets sit under `logs/`.
// The capsule's `status` is folded into those flags rather than passed through,
// so that the page keeps deriving its own status vocabulary from them.
function joinJobsAndPaths(jobRows, pathRows) {
    const pathsByJob = new Map();
    for (const row of pathRows) {
        if (!row.job_id || !row.path) continue;
        if (!pathsByJob.has(row.job_id)) pathsByJob.set(row.job_id, new Map());
        pathsByJob.get(row.job_id).set(row.path, row.content_id);
    }
    return jobRows.map((row) => {
        const blobIdsByPath = pathsByJob.get(row.job_id) ?? new Map();
        const datasetDescriptionPath = capsuleDatasetDescriptionPath(row.job_id, [...blobIdsByPath.keys()]);
        const runPath = datasetDescriptionPath
            ? datasetDescriptionPath.slice(0, -"/dataset_description.json".length)
            : null;
        const outputPaths = {};
        for (const [path, blobId] of blobIdsByPath) {
            if (path !== datasetDescriptionPath) outputPaths[path] = blobId;
        }
        const hasLogPath =
            runPath !== null && Object.keys(outputPaths).some((path) => path.startsWith(`${runPath}/logs/`));
        const status = row.status || null;
        return {
            job_id: row.job_id || null,
            dandiset_id: row.dandiset_id || null,
            dandi_path: row.within_dandiset_path || null,
            pipeline: row.pipeline || null,
            version: row.version || null,
            params: row.params || null,
            config: row.config || null,
            codebase: row.codebase || null,
            content_id: row.content_id || null,
            asset_size_bytes:
                row.asset_size_bytes === "" || row.asset_size_bytes == null ? null : Number(row.asset_size_bytes),
            created_at: row.created_at || null,
            job_submission_time: row.job_submission_time || null,
            job_completion_time: row.job_completion_time || null,
            run_path: runPath,
            has_code: true,
            has_been_submitted: status !== "pending",
            has_output: status === "successful",
            has_logs: status === "failed" || hasLogPath,
            dataset_description_path: datasetDescriptionPath
                ? { [datasetDescriptionPath]: blobIdsByPath.get(datasetDescriptionPath) }
                : {},
            output_paths: outputPaths,
        };
    });
}

// Shared error mapping for both the assets.jsonld lookup and the resolved
// blob fetch below: cachedFetch already handles ETag/immutable-blob caching,
// this just turns a non-ok Response into a descriptive Error.
async function fetchDandiText(url, context) {
    const resp = await cachedFetch(url);
    if (resp.ok) return resp.text();
    if (resp.status === 403) {
        throw new Error(
            `Access denied while loading ${context} (HTTP 403) — the Dandiset may be embargoed or restricted.`
        );
    }
    if (resp.status === 429) {
        throw new Error("DANDI archive rate limit exceeded. Please try again in a few minutes.");
    }
    throw new Error(`Failed to load ${context} (HTTP ${resp.status}).`);
}

// Look up the current S3 blob URL of each of *paths* within *dandisetId*'s
// draft assets.jsonld manifest, in the order given. Content-addressed, so once
// resolved the blobs themselves are fetched via cachedFetch's immutable-blob
// path (see isImmutableBlobUrl) -- only this manifest lookup needs
// revalidating each session.
async function resolveAssetBlobUrls(dandisetId, paths) {
    const text = await fetchDandiText(assetsJsonldUrl(dandisetId), `asset metadata for Dandiset ${dandisetId}`);
    let assets;
    try {
        assets = JSON.parse(text);
    } catch {
        throw new Error(`Asset metadata for Dandiset ${dandisetId} is not valid JSON.`);
    }
    const assetsByPath = new Map((Array.isArray(assets) ? assets : []).filter((a) => a?.path).map((a) => [a.path, a]));
    return paths.map((path) => {
        const contentUrls = assetsByPath.get(path)?.contentUrl;
        const blobUrl = (Array.isArray(contentUrls) ? contentUrls : []).find(
            (u) => typeof u === "string" && u.includes("/blobs/")
        );
        if (!blobUrl) {
            throw new Error(`${path} not found in Dandiset ${dandisetId}'s asset listing.`);
        }
        return blobUrl;
    });
}

// Fetch a Dandiset's `derivatives/jobs.tsv` and `derivatives/paths.tsv` and
// join them into queue entries (see joinJobsAndPaths). Defaults to the main
// queue state; pass { dandisetId } to fetch a different source (e.g. the
// archive Dandiset's tables).
async function fetchQueueState(options = {}) {
    const { dandisetId = DERIVATIVES_DANDISET_ID } = options;
    const [jobsBlobUrl, pathsBlobUrl] = await resolveAssetBlobUrls(dandisetId, [
        JOBS_TSV_RELATIVE_PATH,
        PATHS_TSV_RELATIVE_PATH,
    ]);
    const [jobsText, pathsText] = await Promise.all([
        fetchDandiText(jobsBlobUrl, "the jobs table"),
        fetchDandiText(pathsBlobUrl, "the paths table"),
    ]);
    return joinJobsAndPaths(parseTsvRecords(jobsText), parseTsvRecords(pathsText));
}

// Fetch the archived failing runs from the archive Dandiset's jobs.tsv and
// paths.tsv (the same schema as the main queue's).
async function fetchArchiveState() {
    return fetchQueueState({ dandisetId: ARCHIVE_DANDISET_ID });
}

// Only the assets.jsonld manifest lookups are cleared: the resolved jobs.tsv
// and paths.tsv blobs are content-addressed (immutable), and per-run S3 blobs already
// always arrive as new blob URLs in a freshly resolved state.
function clearQueueStateCache() {
    try {
        sessionStorage.removeItem(queueStateCacheKey());
        sessionStorage.removeItem(archiveStateCacheKey());
    } catch {
        /* sessionStorage unavailable; nothing to clear */
    }
}

async function fetchTraceText(run) {
    const url = resolveBlobUrl(run, `${run.path}/logs/trace.txt`);
    if (!url) return null;
    try {
        const resp = await cachedFetch(url);
        if (!resp.ok) return null;
        return resp.text();
    } catch {
        return null;
    }
}

// List the log file basenames present for a run, sourced from its S3 blob map.
// Only direct children of "{run.path}/logs/" are returned (e.g. trace.txt,
// report.html, timeline.html, dag.html, nextflow.log, *_slurm.log).
function runLogFiles(run) {
    const outputPaths = run?.outputPaths;
    if (!outputPaths) return [];
    const prefix = `${run.path}/logs/`;
    const names = new Set();
    for (const repoPath of Object.keys(outputPaths)) {
        if (!repoPath.startsWith(prefix)) continue;
        const relative = repoPath.slice(prefix.length);
        if (!relative || relative.includes("/")) continue; // direct children only
        names.add(relative);
    }
    return Array.from(names);
}

// SLURM job log basenames for a run, sourced from its S3 blob map.
async function fetchSlurmLogs(run) {
    return runLogFiles(run)
        .filter((name) => name.endsWith("_slurm.log"))
        .sort((a, b) => a.localeCompare(b));
}

async function fetchDatasetDescription(run) {
    // dataset_description.json's blob is provided in the entry's
    // `dataset_description_path` map (merged into the run's lookup), so resolve it
    // straight from the S3 blob bucket like every other artifact.
    const path = run.datasetDescriptionPath ?? `${run.path}/dataset_description.json`;
    const url = resolveBlobUrl(run, path);
    if (!url) return null;
    try {
        const resp = await cachedFetch(url);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

// Build the visualization recording groups for a run from its S3 blob map.
// PNGs live under "{run.path}/derivatives/visualization/..." (or the legacy
// "{run.path}/visualization/..."). Images inside a recording subdirectory are
// grouped under that subdirectory's name; images directly under visualization/
// are grouped under a synthetic "summary" recording. Sourced entirely from the
// per-entry output_paths map — no directory listing required.
function fetchVisualizationData(run) {
    const outputPaths = run?.outputPaths;
    if (!outputPaths) return null;
    const prefixes = [`${run.path}/derivatives/visualization/`, `${run.path}/visualization/`];

    const groups = new Map();
    for (const [repoPath, blobId] of Object.entries(outputPaths)) {
        if (!/\.png$/i.test(repoPath)) continue;
        const prefix = prefixes.find((p) => repoPath.startsWith(p));
        if (!prefix) continue;
        const relative = repoPath.slice(prefix.length); // e.g. "rec1/drift_map.png" or "psd.png"
        const slashIndex = relative.indexOf("/");
        const groupName = slashIndex === -1 ? "summary" : relative.slice(0, slashIndex);
        const baseName = relative.slice(relative.lastIndexOf("/") + 1);
        const url = blobUrl(blobId);
        if (!url) continue;
        if (!groups.has(groupName)) groups.set(groupName, []);
        groups.get(groupName).push({ name: baseName, url });
    }
    if (groups.size === 0) return null;

    // Order: the top-level "summary" group first, then recordings alphabetically.
    const orderedNames = Array.from(groups.keys()).sort((a, b) => {
        if (a === "summary") return -1;
        if (b === "summary") return 1;
        return a.localeCompare(b);
    });
    const recordings = orderedNames.map((name) => ({
        name,
        images: groups.get(name).sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return recordings.length > 0 ? recordings : null;
}

// Fetch and parse a JSON artifact that lives alongside the visualization images
// under "{run.path}/derivatives/visualization/<name>" (or the legacy
// "{run.path}/visualization/<name>"), resolving its blob from the S3 map.
async function fetchVizArtifactJson(run, fileName) {
    if (!run?.outputPaths) return null;
    const candidates = [`${run.path}/derivatives/visualization/${fileName}`, `${run.path}/visualization/${fileName}`];
    for (const repoPath of candidates) {
        const url = resolveBlobUrl(run, repoPath);
        if (!url) continue;
        try {
            const resp = await cachedFetch(url);
            if (resp.ok) return await resp.json();
        } catch {
            /* try the next candidate */
        }
    }
    return null;
}

// quality_control.json — QC metrics for a successful run.
async function fetchQualityControl(run) {
    return fetchVizArtifactJson(run, "quality_control.json");
}

// visualization_output.json — interactive Kachery/figurl view links, keyed by
// recording: { "<recording>": { "<view>": "<figurl url>", ... }, ... }.
async function fetchVisualizationOutput(run) {
    return fetchVizArtifactJson(run, "visualization_output.json");
}

// Returns subject, falling back to a per-dandiset default when subject is null.
function resolveSubject(dandisetId, subject) {
    if (subject != null) return subject;
    return DANDISET_SUBJECT_DEFAULTS.get(String(dandisetId)) ?? null;
}

function parseDandiPath(dandiPath) {
    const pathParts = String(dandiPath ?? "")
        .split("/")
        .filter(Boolean);
    const subjectIndex = pathParts.findIndex((part) => part.startsWith("sub-"));
    const subjectPart = subjectIndex >= 0 ? pathParts[subjectIndex] : "";
    const searchAfterSubject = subjectIndex >= 0 ? pathParts.slice(subjectIndex + 1) : pathParts;

    // Prefer an explicit ses-{session} directory component...
    const sessionPart = searchAfterSubject.find((part) => part.startsWith("ses-")) ?? "";
    let session = sessionPart ? sessionPart.replace(/^ses-/, "") : null;

    // ...fall back to extracting session from the NWB filename (sub-{sub}_ses-{ses}_{rest}.nwb)
    if (!session) {
        const filename = pathParts[pathParts.length - 1] ?? "";
        const sesMatch = filename.match(/_ses-([^_]+)/);
        if (sesMatch) session = sesMatch[1];
    }

    return {
        subject: subjectPart ? subjectPart.replace(/^sub-/, "") : null,
        session,
    };
}

function dandiPathDirectoryParts(dandiPath) {
    const pathParts = String(dandiPath ?? "")
        .split("/")
        .filter(Boolean);
    if (pathParts.length === 0) return [];
    const terminalPart = pathParts[pathParts.length - 1] ?? "";
    if (!terminalPart.toLowerCase().endsWith(".nwb")) return pathParts;
    const directoryParts = pathParts.slice(0, -1);
    const nwbStem = terminalPart.slice(0, -4);
    directoryParts.push(nwbStem);
    return directoryParts;
}

// Build a run directory path from a JSONL queue entry.
// With session:    derivatives/dandiset-{id}/sub-{subject}/ses-{session}/pipeline-{pipeline}/version-{version}_params-{params}_config-{config}[_date-{date}]_attempt-{attempt}
// Without session: derivatives/dandiset-{id}/sub-{subject}/pipeline-{pipeline}/version-{version}_params-{params}_config-{config}[_date-{date}]_attempt-{attempt}
function buildRunPath(entry) {
    const parsed = parseDandiPath(entry.dandi_path);
    const subject = resolveSubject(entry.dandiset_id, entry.subject ?? parsed.subject);
    const session = entry.session ?? parsed.session;
    const dandiPathParts = dandiPathDirectoryParts(entry.dandi_path);
    const parts = ["derivatives", `dandiset-${entry.dandiset_id}`];
    if (dandiPathParts.length > 0) {
        parts.push(...dandiPathParts);
    } else {
        parts.push(`sub-${subject}`);
        if (session !== null && session !== undefined) {
            parts.push(`ses-${session}`);
        }
    }
    parts.push(`pipeline-${entry.pipeline}`);
    let capsule = `version-${entry.version}`;
    if (entry.codebase) {
        capsule += `_codebase-${entry.codebase}`;
    }
    capsule += `_params-${entry.params}_config-${entry.config}_attempt-${entry.attempt}`;
    parts.push(capsule);
    return parts.join("/");
}

/* ─── Queue entry parsing ───────────────────────────────────── */
// Merge the per-entry output/log path → blob-id maps into a single lookup.
// Keys are repo-relative paths within the 001697 derivatives dandiset; values
// are DANDI S3 content blob IDs. Both `output_paths` and an optional separate
// `log_paths` map are supported and merged into one object.
function normalizeOutputPaths(entry) {
    const merged = {};
    for (const key of ["output_paths", "log_paths", "dataset_description_path"]) {
        const map = entry?.[key];
        if (map && typeof map === "object" && !Array.isArray(map)) {
            Object.assign(merged, map);
        }
    }
    return merged;
}

// Extract the dataset_description.json repo path from an entry. Newer entries
// provide `dataset_description_path` as a { path: blob-id } map (its blob is then
// merged into the run's lookup by normalizeOutputPaths); older entries used a
// bare path string.
function datasetDescriptionPathOf(entry) {
    const dd = entry?.dataset_description_path;
    if (typeof dd === "string") return dd;
    if (dd && typeof dd === "object" && !Array.isArray(dd)) {
        const keys = Object.keys(dd);
        return keys.length > 0 ? keys[0] : null;
    }
    return null;
}

// Convert raw JSONL entries from the queue state file into run objects.
function parseQueueEntries(entries) {
    return entries.map((entry) => {
        const parsed = parseDandiPath(entry.dandi_path);
        const createdAt = entry.created_at ?? null;
        return {
            path: entry.run_path ?? buildRunPath(entry),
            jobId: entry.job_id ?? null,
            dandisetId: entry.dandiset_id,
            dandiPath: entry.dandi_path ?? null,
            subject: resolveSubject(entry.dandiset_id, entry.subject ?? parsed.subject),
            session: entry.session ?? parsed.session,
            pipelineName: entry.pipeline,
            pipelineVersion: entry.version,
            paramsProfile: entry.params,
            configHash: normalizeConfigHash(entry.config),
            attempt: entry.attempt,
            codebase: entry.codebase ?? null,
            hasCode: entry.has_code,
            hasBeenSubmitted: entry.has_been_submitted ?? false,
            hasOutput: entry.has_output,
            hasLogs: entry.has_logs,
            // Upstream may eventually publish authoritative status/failure-step
            // fields in the state entries; surface them so the initial render
            // can use them and hydration can skip trace-based refinement.
            stateStatus: entry.status ?? null,
            stateFailureStep: entry.failure_step ?? null,
            contentHash: entry.content_id ?? null,
            outputPaths: normalizeOutputPaths(entry),
            datasetDescriptionPath: datasetDescriptionPathOf(entry),
            // Whether the source asset lives under sourcedata/ in its dandiset —
            // derived directly from the dandi_path (no DANDI API lookup needed).
            inSourcedata: String(entry.dandi_path ?? "").startsWith("sourcedata/"),
            assetSizeBytes: normalizeByteCount(entry.asset_size_bytes ?? entry.asset_bytes ?? entry.bytes),
            createdAt,
            runDate: createdAt ?? entry.date ?? null,
        };
    });
}

// Strip _date-{...} suffix from a raw config field value so that the short
// commit hash can be resolved against the registry independently of whether
// the date was embedded in the same token (e.g. "0d4bf36_date-2026+05+21" → "0d4bf36").
function normalizeConfigHash(config) {
    if (!config) return config;
    const dateIndex = String(config).indexOf("_date-");
    return dateIndex !== -1 ? config.slice(0, dateIndex) : config;
}

/* ─── Path parsing ──────────────────────────────────────────── */
// Run paths are one of:
// - derivatives/{dandiset}/{subject}/{session?}/{pipeline}/version-{version}/{runId}
// - derivatives/{dandiset}/{subject}/{session?}/{pipeline}/version-{version}_{runId}
function parseRunPath(runPath) {
    const parts = runPath.split("/");

    const dandisetPart = parts.find((part) => part.startsWith("dandiset-")) ?? "";
    const subjectPart = parts.find((part) => part.startsWith("sub-")) ?? "";
    const pipelineIndex = parts.findIndex((part) => part.startsWith("pipeline-"));

    const dandisetId = dandisetPart.replace(/^dandiset-/, "");
    const subject = subjectPart.replace(/^sub-/, "");

    const sessionPart = pipelineIndex > 0 ? parts[pipelineIndex - 1] : "";
    const sesMatch = sessionPart?.match(/^ses-(.+)$/);
    const session = sesMatch ? sesMatch[1] : null;

    const pipelineName = pipelineIndex >= 0 ? parts[pipelineIndex].replace(/^pipeline-/, "") : "";
    const versionPart = pipelineIndex >= 0 ? (parts[pipelineIndex + 1] ?? "") : "";
    const runPart = pipelineIndex >= 0 ? (parts[pipelineIndex + 2] ?? "") : "";

    let pipelineVersion = versionPart.startsWith("version-") ? versionPart.slice("version-".length) : versionPart;
    let capsulePart = runPart;
    if (versionPart.startsWith("version-")) {
        const versionBody = versionPart.slice("version-".length);
        const flattenedMarker = "_params-";
        const flattenedIndex = versionBody.indexOf(flattenedMarker);
        if (flattenedIndex !== -1) {
            pipelineVersion = versionBody.slice(0, flattenedIndex);
            capsulePart = `params-${versionBody.slice(flattenedIndex + flattenedMarker.length)}`;
        }
    }

    let paramsProfile = capsulePart;
    let configHash = "";
    let attempt = 1;
    if (capsulePart.startsWith("params-")) {
        const capsuleBody = capsulePart.slice("params-".length);
        const attemptMarker = "_attempt-";
        const attemptIndex = capsuleBody.lastIndexOf(attemptMarker);
        if (attemptIndex !== -1) {
            const attemptText = capsuleBody.slice(attemptIndex + attemptMarker.length);
            if (/^\d+$/.test(attemptText)) {
                attempt = parseInt(attemptText, 10);
                const beforeAttempt = capsuleBody.slice(0, attemptIndex);
                const configMarker = "_config-";
                const configIndex = beforeAttempt.indexOf(configMarker);
                if (configIndex !== -1) {
                    paramsProfile = beforeAttempt.slice(0, configIndex);
                    configHash = normalizeConfigHash(beforeAttempt.slice(configIndex + configMarker.length));
                } else {
                    paramsProfile = beforeAttempt;
                }
            }
        }
    }

    return {
        path: runPath,
        dandisetId,
        subject,
        session,
        pipelineName,
        pipelineVersion,
        paramsProfile,
        configHash,
        createdAt: null,
        runDate: null,
        attempt,
    };
}

function sortRuns(runs, sortMode = _sortMode, sortDirection = _sortDirection) {
    return [...runs].sort((a, b) => {
        if (sortMode === "created_at") {
            const createdCompare = String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
            if (createdCompare !== 0) return sortDirection === "asc" ? -createdCompare : createdCompare;
        }
        if (sortMode === "dandiset_id") {
            const dandisetCompare = String(a.dandisetId ?? "").localeCompare(String(b.dandisetId ?? ""));
            if (dandisetCompare !== 0) return sortDirection === "asc" ? dandisetCompare : -dandisetCompare;
        }
        const attemptCompare = (b.attempt ?? 0) - (a.attempt ?? 0);
        if (attemptCompare !== 0) return sortDirection === "asc" ? -attemptCompare : attemptCompare;
        const pathCompare = String(a.path ?? "").localeCompare(String(b.path ?? ""));
        return sortDirection === "asc" ? pathCompare : -pathCompare;
    });
}

/* ─── Trace parsing ─────────────────────────────────────────── */
function parseTrace(text) {
    if (!text) return { status: "unknown", tasks: [] };
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return { status: "unknown", tasks: [] };

    const headers = lines[0].split("\t");
    const idx = (h) => headers.indexOf(h);

    const tasks = lines.slice(1).map((line) => {
        const cols = line.split("\t");
        return {
            name: cols[idx("name")] ?? "",
            status: cols[idx("status")] ?? "",
            exit: cols[idx("exit")] ?? "",
            duration: cols[idx("duration")] ?? "",
            realtime: cols[idx("realtime")] ?? "",
            nativeId: cols[idx("native_id")] ?? "",
        };
    });

    const anyFailed = tasks.some((t) => t.status === "FAILED");
    const allCompleted = tasks.every((t) => t.status === "COMPLETED");
    const status = anyFailed ? "failed" : allCompleted ? "success" : "running";
    return { status, tasks };
}

/* ─── Rendering ─────────────────────────────────────────────── */
function renderSummary(runs) {
    const isArchive = _viewMode === "archive";
    const total = runs.length;
    const success = runs.filter((r) => r.status === "success").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const queued = runs.filter((r) => r.status === "queued").length;
    const stalled = runs.filter(isStalled).length;
    const running = runs.filter((r) => r.status === "running" && !isStalled(r)).length;
    const unknown = total - success - failed - queued - running - stalled;
    const successfulRuns = runs.filter((run) => run.status === "success");
    const runsWithKnownByteCounts = successfulRuns.filter((run) => runByteCount(run) !== null).length;
    const totalBytes = sumRunByteCounts(successfulRuns);
    const filter = parseFilter();
    const successHref = narrowUrl({ ...filterNarrowParams(filter, ["failureStep", "status"]), status: "success" });
    const failedHref = narrowUrl({ ...filterNarrowParams(filter, ["status"]), status: "failed" });
    const runningHref = narrowUrl({ ...filterNarrowParams(filter, ["status"]), status: "running" });
    const stalledHref = narrowUrl({ ...filterNarrowParams(filter, ["status"]), status: "stalled" });

    document.getElementById("summary").innerHTML = `
        <div class="summary-stats">
            <div class="stat-item">
                <span class="stat-value">${total}</span>
                <span class="stat-label">Total Runs</span>
            </div>
            ${
                isArchive
                    ? ""
                    : `<a class="stat-item stat-running" href="${e(runningHref)}" title="Show only running runs">
                <span class="stat-value">${running}</span>
                <span class="stat-label">Running</span>
            </a>`
            }
            ${
                !isArchive && stalled
                    ? `<a class="stat-item stat-stalled" href="${e(stalledHref)}" title="Show only stalled runs (running for more than 24 hours)">
                <span class="stat-value">⚠ ${stalled}</span>
                <span class="stat-label">Stalled</span>
            </a>`
                    : ""
            }
            ${
                isArchive
                    ? ""
                    : `<a class="stat-item stat-success" href="${e(successHref)}" title="Show only successful runs">
                <span class="stat-value">${success}</span>
                <span class="stat-label">Successful</span>
            </a>`
            }
            ${
                isArchive
                    ? ""
                    : `<a class="stat-item stat-failed" href="${e(failedHref)}" title="Show only failed runs">
                <span class="stat-value">${failed}</span>
                <span class="stat-label">Failed</span>
            </a>`
            }
            ${
                !isArchive && queued
                    ? `<div class="stat-item stat-queued">
                <span class="stat-value">${queued}</span>
                <span class="stat-label">Queued</span>
            </div>`
                    : ""
            }
            ${
                unknown
                    ? `<div class="stat-item">
                <span class="stat-value">${unknown}</span>
                <span class="stat-label">Unknown</span>
            </div>`
                    : ""
            }
            ${
                runsWithKnownByteCounts
                    ? `<div class="stat-item stat-bytes">
               <span class="stat-value">${formatByteCount(totalBytes)}</span>
               <span class="stat-label">DATA PROCESSED</span>
           </div>`
                    : ""
            }
        </div>`;
}

/* ─── Queue priorities (top display) ─────────────────────────────
   Fetches dandi-compute/dandi-compute-core's pipeline_configs.json from the raw GitHub CDN
   and renders the current scheduling priorities at the top of the dashboard.
   The config schema isn't fixed here, so rendering adapts: an ordered priority
   list (with any scalar settings) when one can be detected, otherwise a generic
   key/value view. Dandiset-id entries link into the filtered dashboard.       */
async function fetchQueueConfig() {
    try {
        const resp = await cachedFetch(PIPELINE_CONFIGS_URL);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

function isDandisetId(value) {
    return /^\d{6}$/.test(String(value));
}

// Detect an ordered priority list within the config. Returns { list, key }
// where key is the source property (or null for a root array / numeric map).
function extractQueuePriorityList(config) {
    if (Array.isArray(config)) return { list: config, key: null };
    if (config && typeof config === "object") {
        for (const key of ["priorities", "priority", "order", "queue", "ranking", "dandisets", "dandiset_priorities"]) {
            if (Array.isArray(config[key])) return { list: config[key], key };
        }
        // A flat { "<dandiset>": <priority number> } map → sort ascending.
        const keys = Object.keys(config);
        const numeric = Object.entries(config).filter(([, v]) => typeof v === "number");
        if (keys.length > 0 && numeric.length === keys.length) {
            const list = numeric.sort((a, b) => a[1] - b[1]).map(([name, priority]) => ({ name, priority }));
            return { list, key: null };
        }
    }
    return { list: null, key: null };
}

const QUEUE_ITEM_LABEL_KEYS = ["dandiset_id", "dandiset", "id", "name", "key", "label"];
const QUEUE_ITEM_PRIORITY_KEYS = ["priority", "weight", "rank", "score"];

function normalizeQueuePriorityItem(item) {
    if (item === null || item === undefined) return null;
    if (typeof item === "string" || typeof item === "number") {
        return { label: String(item), priority: null, extra: [] };
    }
    if (typeof item === "object") {
        let label = null;
        for (const k of QUEUE_ITEM_LABEL_KEYS) {
            if (item[k] !== undefined && item[k] !== null) {
                label = String(item[k]);
                break;
            }
        }
        let priority = null;
        for (const k of QUEUE_ITEM_PRIORITY_KEYS) {
            if (item[k] !== undefined && item[k] !== null) {
                priority = item[k];
                break;
            }
        }
        const skip = new Set([...QUEUE_ITEM_LABEL_KEYS, ...QUEUE_ITEM_PRIORITY_KEYS]);
        const extra = Object.entries(item)
            .filter(
                ([k, v]) => !skip.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
            )
            .map(([k, v]) => ({ key: k, value: v }));
        return { label: label ?? JSON.stringify(item), priority, extra };
    }
    return null;
}

// Scalar top-level config entries shown as a "settings" strip (excluding the
// property that supplied the priority list).
function queueConfigSettings(config, usedKey) {
    if (!config || typeof config !== "object" || Array.isArray(config)) return [];
    return Object.entries(config)
        .filter(([k, v]) => k !== usedKey && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
        .map(([key, value]) => ({ key, value }));
}

function renderQueueSettingsStrip(settings) {
    if (!settings.length) return "";
    const chips = settings
        .map(
            (s) =>
                `<span class="qp-setting"><span class="qp-setting-key"${fieldTipAttrs(s.key)}>${e(prettyKey(s.key))}</span><span class="qp-setting-val">${e(String(s.value))}</span></span>`
        )
        .join("");
    return `<div class="qp-settings">${chips}</div>`;
}

// Generic fallback when no ordered list can be detected.
function renderQueueConfigGeneric(config) {
    if (config === null || typeof config !== "object") {
        return `<div class="qp-generic"><span class="qp-setting-val">${e(String(config))}</span></div>`;
    }
    const rows = Object.entries(config)
        .map(([k, v]) => {
            let valHtml;
            if (Array.isArray(v)) {
                valHtml = `<span class="qp-setting-val">${e(v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", "))}</span>`;
            } else if (v && typeof v === "object") {
                valHtml = `<span class="qp-setting-val qp-mono">${e(JSON.stringify(v))}</span>`;
            } else {
                valHtml = `<span class="qp-setting-val">${e(String(v))}</span>`;
            }
            return `<div class="qp-generic-row"><span class="qp-setting-key">${e(prettyKey(k))}</span>${valHtml}</div>`;
        })
        .join("");
    return `<div class="qp-generic">${rows}</div>`;
}

// Field descriptions from the queue_config LinkML schema (dandi-compute/dandi-compute-core),
// surfaced as hover tooltips via small info icons.
const QUEUE_CONFIG_DESCRIPTION =
    "A configuration structure for DANDI Compute pipelines, including version priorities, parameter priorities, attempt limits, and asset overrides.";
const QUEUE_FIELD_DESCRIPTIONS = {
    version_priority: "An ordered list of pipeline versions, in priority order (highest priority first).",
    params_priority: "An ordered list of parameter set names, in priority order (highest priority first).",
    max_attempts_per_asset: "The maximum number of times the pipeline should be retried on a single asset.",
    asset_overrides:
        "A mapping of asset identifiers (e.g. UUIDs) to an override value. A null value means there is no limit on the number of failures for that asset.",
    max_fail_per_dandiset:
        "The maximum number of failures permitted per dandiset before the pipeline is considered failed.",
};
const QUEUE_OVERRIDE_NULL_DESCRIPTION = "No limit on the number of failures for this asset.";

function tipAttrs(description) {
    if (!description) return "";
    return ` tabindex="0" role="note" aria-label="${e(description)}" data-tip="${e(description)}"`;
}
function fieldTipAttrs(field) {
    return tipAttrs(QUEUE_FIELD_DESCRIPTIONS[field]);
}

// Ordered priority chips (rank + value), optionally linking each value into the
// dashboard filter named by linkKey (e.g. "pipelineVersion" → ?version=…).
function renderQueuePriorityChips(values, linkKey) {
    const items = (Array.isArray(values) ? values : []).filter((v) => v !== null && v !== undefined);
    if (!items.length) return `<span class="qp-empty">—</span>`;
    const chips = items
        .map((v, i) => {
            const label = e(String(v));
            const inner = linkKey
                ? `<a class="qp-chip-link" href="${e(narrowUrl({ [linkKey]: String(v) }))}" title="Filter dashboard to ${label}">${label}</a>`
                : `<span class="qp-chip-label">${label}</span>`;
            return `<li class="qp-chip"><span class="qp-rank">${i + 1}</span>${inner}</li>`;
        })
        .join("");
    return `<ol class="qp-chips">${chips}</ol>`;
}

function renderQueuePriorityRow(label, values, linkKey, fieldKey) {
    return `<div class="qp-row"><span class="qp-row-label"${fieldTipAttrs(fieldKey)}>${e(label)}</span>${renderQueuePriorityChips(values, linkKey)}</div>`;
}

const QUEUE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-asset overrides as a small collapsible list. Asset keys are content ids,
// so they link into Neurosift like the rest of the app.
function renderQueueAssetOverrides(overrides) {
    const entries =
        overrides && typeof overrides === "object" && !Array.isArray(overrides) ? Object.entries(overrides) : [];
    if (!entries.length) return "";
    const rows = entries
        .map(([assetId, val]) => {
            const idShort = assetId.length > 16 ? `${assetId.slice(0, 8)}…${assetId.slice(-4)}` : assetId;
            const idHtml = QUEUE_UUID_PATTERN.test(assetId)
                ? `<a class="qp-asset qp-asset-link" href="${e(neurosiftBlobUrl(assetId))}" target="_blank" rel="noopener" title="${e(assetId)} — open in Neurosift">${NEUROSIFT_ICON_HTML}${e(idShort)}</a>`
                : `<code class="qp-asset" title="${e(assetId)}">${e(idShort)}</code>`;
            const valHtml =
                val === null || val === undefined
                    ? `<span class="qp-override-val qp-override-unlimited"${tipAttrs(QUEUE_OVERRIDE_NULL_DESCRIPTION)}>no failure limit</span>`
                    : `<span class="qp-override-val">${e(typeof val === "object" ? JSON.stringify(val) : String(val))}</span>`;
            return `<div class="qp-override-row">${idHtml}<span class="qp-override-arrow">→</span>${valHtml}</div>`;
        })
        .join("");
    return `<details class="qp-overrides">
        <summary class="qp-overrides-summary"><span class="qp-overrides-term"${fieldTipAttrs("asset_overrides")}>Asset overrides</span> <span class="count-badge">${entries.length}</span></summary>
        <div class="qp-overrides-body">${rows}</div>
    </details>`;
}

// Tailored renderer for the { pipelines: { "<name>": {…} } } schema.
function renderQueuePipelines(pipelines) {
    const names = Object.keys(pipelines);
    if (!names.length) return "";
    const known = new Set(["version_priority", "params_priority", "asset_overrides"]);
    return names
        .map((name) => {
            const p = pipelines[name];
            if (!p || typeof p !== "object" || Array.isArray(p)) {
                return `<div class="qp-pipeline"><div class="qp-pipeline-name">${e(name)}</div>${renderQueueConfigGeneric(p)}</div>`;
            }
            const rows = [];
            if ("version_priority" in p)
                rows.push(
                    renderQueuePriorityRow(
                        "Version priority",
                        p.version_priority,
                        "pipelineVersion",
                        "version_priority"
                    )
                );
            if ("params_priority" in p)
                rows.push(renderQueuePriorityRow("Params priority", p.params_priority, null, "params_priority"));
            const settings = Object.entries(p)
                .filter(
                    ([k, v]) =>
                        !known.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
                )
                .map(([key, value]) => ({ key, value }));
            return `<div class="qp-pipeline">
        <div class="qp-pipeline-name">${e(name)}</div>
        <div class="qp-rows">${rows.join("")}</div>
        ${renderQueueSettingsStrip(settings)}
        ${renderQueueAssetOverrides(p.asset_overrides)}
    </div>`;
        })
        .join("");
}

// Adaptive fallback body for configs that don't match the pipelines schema.
function renderQueueAdaptiveBody(config) {
    const { list, key } = extractQueuePriorityList(config);
    if (Array.isArray(list) && list.length > 0) {
        const items = list.map(normalizeQueuePriorityItem).filter(Boolean);
        const itemsHtml = items
            .map((it, i) => {
                const labelHtml = isDandisetId(it.label)
                    ? `<a class="qp-label qp-label-link" href="${e(narrowUrl({ dandiset: it.label }))}" title="Filter dashboard to Dandiset ${e(it.label)}">${e(it.label)}</a>`
                    : `<span class="qp-label">${e(it.label)}</span>`;
                const prio =
                    it.priority !== null
                        ? `<span class="qp-priority" title="Priority">${e(String(it.priority))}</span>`
                        : "";
                const extra = it.extra.length
                    ? `<span class="qp-item-meta">${it.extra.map((x) => `${e(prettyKey(x.key))}:&nbsp;${e(String(x.value))}`).join(" · ")}</span>`
                    : "";
                return `<li class="qp-item">
            <span class="qp-rank">${i + 1}</span>
            <span class="qp-item-body">
                <span class="qp-item-head">${labelHtml}${prio}</span>
                ${extra}
            </span>
        </li>`;
            })
            .join("");
        return `<ol class="qp-list">${itemsHtml}</ol>${renderQueueSettingsStrip(queueConfigSettings(config, key))}`;
    }
    return renderQueueConfigGeneric(config);
}

function renderQueuePriorities(config) {
    if (config === null || config === undefined) return "";
    const source = `<a class="qp-source" href="${e(PIPELINE_CONFIGS_SOURCE_URL)}" target="_blank" rel="noopener">pipeline_configs.json ↗</a>`;

    const body =
        config.pipelines && typeof config.pipelines === "object" && !Array.isArray(config.pipelines)
            ? renderQueuePipelines(config.pipelines)
            : renderQueueAdaptiveBody(config);
    if (!body) return "";

    return `
<div class="queue-priorities-header">
    <span class="queue-priorities-title"${tipAttrs(QUEUE_CONFIG_DESCRIPTION)}>Queue priorities</span>
    ${source}
</div>
${body}`;
}

// Insert the queue-priorities container at the top of the page content (once).
function mountQueuePriorities() {
    let el = document.getElementById("queue-priorities");
    if (el) return el;
    const pageContent = document.querySelector(".page-content");
    if (!pageContent) return null;
    el = document.createElement("section");
    el.id = "queue-priorities";
    el.className = "queue-priorities";
    el.style.display = "none";
    const banner = document.getElementById("filter-banner");
    pageContent.insertBefore(el, banner ?? pageContent.firstChild);
    return el;
}

async function initQueuePriorities() {
    const el = mountQueuePriorities();
    if (!el) return;
    const config = await fetchQueueConfig();
    const html = renderQueuePriorities(config);
    if (!html) {
        el.style.display = "none";
        return;
    }
    el.innerHTML = html;
    el.style.display = "";
}

/* Log files rendered as always-open inline iframes (not modal buttons) */
const INLINE_REPORT_FILES = new Set(["report.html", "timeline.html"]);
const INLINE_REPORT_ORDER = ["timeline.html", "report.html"];

/* Standard log files present whenever has_logs is true (Nextflow output) */
const STANDARD_LOG_FILES = ["dag.html", "nextflow.log", "report.html", "timeline.html", "trace.txt"];

/* Pretty-print a log file name */
const LOG_LABELS = {
    "dag.html": "Pipeline DAG",
    "nextflow.log": "Nextflow Log",
    "report.html": "Execution Report",
    "timeline.html": "Execution Timeline",
    "trace.txt": "Task Trace",
};
// Matches rotated Nextflow logs such as "nextflow.log.1", "nextflow.log.2".
const ROTATED_NEXTFLOW_LOG_PATTERN = /^nextflow\.log\.\d+$/;

function logLabel(fileName) {
    if (LOG_LABELS[fileName]) return LOG_LABELS[fileName];
    if (ROTATED_NEXTFLOW_LOG_PATTERN.test(fileName)) {
        return `Nextflow Log (${fileName.slice("nextflow.log.".length)})`;
    }
    if (fileName.includes("_slurm.log")) return "SLURM Job Log";
    return fileName;
}

// Split a run's discovered log files (run.logFiles, sourced from the S3 blob
// map) into inline reports (rendered as iframes) and button logs (opened in the
// modal). Standard Nextflow logs are ordered first (rotated nextflow.log.N files
// cluster with nextflow.log), with remaining files (e.g. SLURM job logs)
// following alphabetically.
function splitRunLogFiles(run) {
    const logFiles = run.logFiles ?? [];
    const orderIndex = (f) => {
        // Treat rotated nextflow.log.N like nextflow.log for primary ordering so
        // the rotations sit next to the base log rather than at the end.
        const key = ROTATED_NEXTFLOW_LOG_PATTERN.test(f) ? "nextflow.log" : f;
        const i = STANDARD_LOG_FILES.indexOf(key);
        return i === -1 ? STANDARD_LOG_FILES.length : i;
    };
    const sorted = [...logFiles].sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b));
    const inlineLogs = sorted
        .filter((f) => INLINE_REPORT_FILES.has(f))
        .sort((a, b) => {
            const ai = INLINE_REPORT_ORDER.indexOf(a);
            const bi = INLINE_REPORT_ORDER.indexOf(b);
            return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
        });
    const buttonLogs = sorted.filter((f) => !INLINE_REPORT_FILES.has(f));
    return { inlineLogs, buttonLogs };
}

/* Build a raw CDN URL for a repo file path (legacy; retained for non-001697 repos) */
function cdnUrl(filePath) {
    return `${CDN_BASE}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

/* ─── DANDI S3 blob helpers ─────────────────────────────────────
   The retired dandi-compute/001697 GitHub mirror has been replaced by direct
   reads from the DANDI S3 bucket. Each successful queue entry carries an
   output_paths map whose keys are repo-relative paths within the 001697
   derivatives dandiset and whose values are the content blob IDs used to locate
   the object in S3. Blobs are nested under the first two length-3 segments of
   the hash: blobs/abc/def/abcdef123...                                       */
const S3_BLOB_BASE = "https://dandiarchive.s3.amazonaws.com/blobs";

function blobUrl(blobId) {
    const id = String(blobId ?? "");
    if (id.length < 6) return null;
    return `${S3_BLOB_BASE}/${id.slice(0, 3)}/${id.slice(3, 6)}/${id}`;
}

/* Resolve a repo-relative file path within a run to its S3 blob URL using the
   run's output_paths → blob-id map. Returns null when the path is unknown. */
function resolveBlobUrl(run, repoPath) {
    const id = run?.outputPaths?.[repoPath];
    return id ? blobUrl(id) : null;
}

/* Build a GitHub tree URL for a repo directory path */
function treeUrl(filePath) {
    return `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

/* Build a DANDI derivatives URL for a run capsule path */
function derivativesUrl(filePath) {
    const baseUrl = dandiBaseUrl(DERIVATIVES_DANDISET_ID);
    const location = String(filePath ?? "")
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
    return `${baseUrl}/dandiset/${DERIVATIVES_DANDISET_ID}/draft/files?location=${location}&page=1`;
}

/* Build a Neurosift NWB URL from a DANDI S3 content hash */
function neurosiftBlobUrl(contentHash) {
    const blobFileUrl = blobUrl(contentHash);
    return `https://neurosift.app/nwb?url=${encodeURIComponent(blobFileUrl)}`;
}

/* Build a Neurosift NWB URL from the run's S3 content hash (no API call needed) */
function neurosiftSessionUrl(dandisetId, contentHash) {
    if (contentHash) {
        return neurosiftBlobUrl(contentHash);
    }
    return null;
}

/* Build a Neurosift dandiset URL */
function neurosiftDandisetUrl(dandisetId) {
    return `https://neurosift.app/dandiset/${encodeURIComponent(dandisetId)}`;
}

function renderRunEntry(run) {
    const stalled = isStalled(run);
    const sc =
        run.status === "success"
            ? "status-success"
            : run.status === "failed"
              ? "status-failed"
              : stalled
                ? "status-stalled"
                : run.status === "running"
                  ? "status-running"
                  : run.status === "queued"
                    ? "status-queued"
                    : "status-unknown";
    const slbl =
        run.status === "success"
            ? "✓ Success"
            : run.status === "failed"
              ? "✗ Failed"
              : stalled
                ? "⚠ Stalled"
                : run.status === "running"
                  ? "▶ Running"
                  : run.status === "queued"
                    ? "⧗ Queued"
                    : "? Unknown";

    // Log files present for this run, sourced from the S3 blob map (run.logFiles).
    const { inlineLogs, buttonLogs } = splitRunLogFiles(run);
    const hasLogs = buttonLogs.length > 0;
    const hasInline = inlineLogs.length > 0;
    const hasTasks = run.tasks && run.tasks.length > 0;
    const hasSourceVersions = run.generatedBy && run.generatedBy.length > 0;
    const hasViz = (run.vizData && run.vizData.length > 0) || (run.vizLinks && Object.keys(run.vizLinks).length > 0);
    const bytes = runByteCount(run);
    const bytesHtml =
        bytes === null
            ? ""
            : `<span class="run-sep">·</span><span class="run-bytes">Asset size:&nbsp;${formatByteCount(bytes)}</span>`;

    return `
<div class="run-entry ${sc}" data-run-key="${e(run.path)}">
    <div class="run-entry-header">
        <span class="status-badge ${sc}${run.statusProvisional ? " status-provisional" : ""}"${run.statusProvisional ? ' title="Pass/fail pending trace confirmation"' : ""}>${slbl}</span>
        ${run.runDate ? `<span class="run-date">${e(run.runDate)}</span><span class="run-sep">·</span>` : ""}
        ${run.paramsProfile ? `<span class="run-sep">·</span><span class="run-params">${renderRegistryLink("Params", run.paramsProfile, PARAMS_REGISTRY, "params")}</span>` : ""}
        ${run.configHash ? `<span class="run-sep">·</span><span class="run-config">${renderRegistryLink("Config", run.configHash, CONFIG_REGISTRY, "configs")}</span>` : ""}
        ${bytesHtml}
        <span class="run-attempt">${runIdentityLabel(run)}</span>
        <a class="run-entry-derivatives-link" href="${e(derivativesUrl(run.path))}" target="_blank" rel="noopener">↗ Derivatives${DANDI_ICON_HTML}</a>
        ${renderCurationLink(run)}
    </div>

    ${hasSourceVersions ? renderSourceVersionsSection(run.generatedBy) : ""}
    ${run.datasetDescription ? renderProvenanceSection(run.datasetDescription) : !run.detailsLoaded && run.datasetDescriptionPath ? renderSectionPlaceholder("provenance", "Provenance") : ""}
    ${hasTasks ? renderTraceSection(run.tasks) : ""}
    ${hasViz ? renderVisualizationSection(run.vizData, run.vizLinks) : ""}
    ${run.qualityControl ? renderQualityControlSection(run.qualityControl) : !run.qcLoaded && runHasQualityControl(run) ? renderSectionPlaceholder("qc", "Quality Control") : ""}
    ${hasLogs ? renderLogSection(run, buttonLogs) : ""}
    ${hasInline ? renderReportSection(run, inlineLogs) : ""}
</div>`;
}

function renderPipelineInfo(pipelineName, pipelineVersion) {
    const commitHash = pipelineCompareRef(pipelineVersion);
    const hasCommit = commitHash !== pipelineVersion;

    const displayName = e(pipelineName.replace(/\+/g, "-"));

    if (hasCommit) {
        const displayVer = e(pipelineVersion.replace(/\+/g, "-"));
        const url = e(`${PIPELINE_REPO_URL}/commit/${commitHash}`);
        return (
            `<a class="pipeline-link" href="${url}" target="_blank" rel="noopener">` +
            `<span class="pipeline-name">${displayName}</span>` +
            `<span class="pipeline-version">${displayVer}</span>` +
            `</a>`
        );
    }

    const displayVer = e(pipelineVersion.replace(/\+/g, "-"));
    return `<span class="pipeline-name">${displayName}</span>` + `<span class="pipeline-version">${displayVer}</span>`;
}

// Canonicalize known pipeline repo forks to their upstream organization so links
// point at the canonical source (e.g. a CodyCBakerPhD fork of aind-ephys-pipeline
// → AllenNeuralDynamics). Any trailing path (e.g. /tree/v1.2.2) is preserved.
function canonicalizeCodeUrl(url) {
    if (!url) return url;
    return url.replace(/(https?:\/\/github\.com\/)[^/]+(\/aind-ephys-pipeline)(?=$|[/?#])/i, "$1AllenNeuralDynamics$2");
}

function resolveCodeUrl(codeUrl, version) {
    codeUrl = canonicalizeCodeUrl(codeUrl);
    if (!codeUrl) return null;

    // For the AIND ephys pipeline, a /tree/v<semver> CodeURL should link to the
    // matching GitHub release page; the upstream release tags omit the leading "v"
    // (e.g. /tree/v1.2.2 → /releases/tag/1.2.2).
    const releaseMatch = codeUrl.match(/^(https?:\/\/github\.com\/[^/]+\/aind-ephys-pipeline)\/tree\/v(.+)$/i);
    if (releaseMatch) return `${releaseMatch[1]}/releases/tag/${releaseMatch[2]}`;

    if (!version) return codeUrl;
    // If the version looks like a bare commit hash and the CodeURL doesn't already
    // point to a specific commit/tree/tag, append /tree/<hash> so the link goes
    // directly to the commit rather than the repository root.
    const isCommitHash = /^[0-9a-f]{6,40}$/i.test(version);
    const alreadySpecific = /\/(commit|tree|blob|releases\/tag)\//i.test(codeUrl);
    if (isCommitHash && !alreadySpecific) {
        let end = codeUrl.length;
        while (end > 0 && codeUrl.charCodeAt(end - 1) === 47 /* "/" */) end--;
        return codeUrl.slice(0, end) + "/tree/" + version;
    }
    return codeUrl;
}

// Extract a full/abbreviated git commit hash from a Version string. The pipeline
// records versions as "<tag-or-shortsha>+<full-commit-hash>" (e.g.
// "v1.2.2+d2b6aef…"), so prefer the segment after the last "+"; also accept a
// bare hash. Returns null when no hash-like token is present.
function extractCommitHash(version) {
    if (!version) return null;
    const v = String(version);
    const candidate = v.includes("+") ? v.slice(v.lastIndexOf("+") + 1) : v;
    return /^[0-9a-f]{7,40}$/i.test(candidate) ? candidate : null;
}

// Build a link to a GitHub repo at a specific commit state
// (https://github.com/<owner>/<repo>/tree/<hash>) from a CodeURL + Version.
// Owner is canonicalized like resolveCodeUrl. Returns null when no GitHub repo or
// commit hash can be determined.
function resolveCommitUrl(codeUrl, version) {
    const url = canonicalizeCodeUrl(codeUrl);
    const hash = extractCommitHash(version);
    if (!url || !hash) return null;
    const repoBase = url.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+?)(?:\.git)?(?:[/?#]|$)/i);
    if (!repoBase) return null;
    return `${repoBase[1]}/tree/${hash}`;
}

function renderSourceVersionsSection(generatedBy) {
    const items = generatedBy
        .map((entry) => {
            const name = e(entry.Name ?? "");
            const version = e(entry.Version ?? "");
            const rawUrl = entry.CodeURL ?? null;
            const resolvedUrl = resolveCodeUrl(rawUrl, entry.Version ?? "");
            const codeUrl = resolvedUrl ? e(resolvedUrl) : null;
            const commitUrl = resolveCommitUrl(rawUrl, entry.Version ?? "");
            const versionHtml = version
                ? commitUrl
                    ? `<a class="src-version src-version-link" href="${e(commitUrl)}" target="_blank" rel="noopener" title="Open repository at this commit">${version}</a>`
                    : `<span class="src-version">${version}</span>`
                : "";
            const nameHtml = codeUrl
                ? `<a class="src-link" href="${codeUrl}" target="_blank" rel="noopener">${name}</a>`
                : `<span class="src-name">${name}</span>`;
            return `<span class="src-entry">${nameHtml}${versionHtml}</span>`;
        })
        .join("");

    return `
<div class="source-versions">
    <span class="source-versions-label">Source versions:</span>
    <span class="source-versions-list">${items}</span>
</div>`;
}

/* ─── Provenance (dataset_description.json) ─────────────────────
   Surfaces the fuller content of dataset_description.json: top-level metadata,
   each GeneratedBy pipeline step with its version hash / description / container,
   and any SourceDatasets. Resilient to missing/extra fields.                   */
function prettyKey(key) {
    return String(key)
        .replace(/_/g, " ")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase());
}

function renderProvenanceGeneratedBy(entry) {
    if (entry == null) return "";
    if (typeof entry !== "object")
        return `<div class="prov-card"><span class="prov-name">${e(String(entry))}</span></div>`;
    const name = entry.Name ?? entry.name ?? "Step";
    const version = entry.Version ?? entry.version ?? null;
    const rawUrl = entry.CodeURL ?? entry.codeURL ?? entry.url ?? null;
    const codeUrl = resolveCodeUrl(rawUrl, version ?? "");
    const description = entry.Description ?? entry.description ?? null;
    const nameHtml = codeUrl
        ? `<a class="prov-name src-link" href="${e(codeUrl)}" target="_blank" rel="noopener">${e(name)}</a>`
        : `<span class="prov-name">${e(name)}</span>`;
    const commitUrl = resolveCommitUrl(rawUrl, version ?? "");
    const versionHtml = version
        ? commitUrl
            ? `<a class="prov-hash prov-hash-link" href="${e(commitUrl)}" target="_blank" rel="noopener" title="Open repository at this commit">${e(String(version))}</a>`
            : `<code class="prov-hash">${e(String(version))}</code>`
        : "";
    const descHtml = description ? `<p class="prov-card-desc">${e(String(description))}</p>` : "";

    // Container/image details (e.g. BIDS GeneratedBy[].Container { Type, Tag, URI }).
    const container = entry.Container ?? entry.container ?? null;
    let containerHtml = "";
    if (container && typeof container === "object") {
        const parts = Object.entries(container)
            .filter(([, v]) => v != null && typeof v !== "object")
            .map(([k, v]) => `${prettyKey(k)}: ${v}`);
        if (parts.length) containerHtml = `<p class="prov-card-meta">${e(parts.join(" · "))}</p>`;
    } else if (typeof container === "string") {
        containerHtml = `<p class="prov-card-meta">${e(container)}</p>`;
    }

    return `<div class="prov-card">
    <div class="prov-card-head">${nameHtml}${versionHtml}</div>
    ${descHtml}
    ${containerHtml}
</div>`;
}

function renderProvenanceSource(entry) {
    if (entry == null) return "";
    if (typeof entry !== "object")
        return `<div class="prov-card"><span class="prov-name">${e(String(entry))}</span></div>`;
    const url = entry.URL ?? entry.url ?? null;
    const doi = entry.DOI ?? entry.doi ?? null;
    const version = entry.Version ?? entry.version ?? null;
    const head = url
        ? `<a class="prov-name src-link" href="${e(url)}" target="_blank" rel="noopener">${e(url)}</a>`
        : `<span class="prov-name">${e(url ?? doi ?? "Source")}</span>`;
    const versionHtml = version ? `<code class="prov-hash">${e(String(version))}</code>` : "";
    const doiHtml = doi && doi !== url ? `<p class="prov-card-meta">DOI: ${e(String(doi))}</p>` : "";
    return `<div class="prov-card"><div class="prov-card-head">${head}${versionHtml}</div>${doiHtml}</div>`;
}

function renderProvenanceSection(desc) {
    if (!desc || typeof desc !== "object") return "";

    // 1) Top-level scalar metadata: a curated order first, then any other
    //    primitive fields so nothing useful is hidden.
    const preferred = ["Name", "DatasetType", "BIDSVersion", "schema_version", "schemaVersion", "License", "license"];
    const skip = new Set(["GeneratedBy", "SourceDatasets", "describedBy", "object_type"]);
    const metaRows = [];
    const seen = new Set();
    const addRow = (key) => {
        const v = desc[key];
        if (seen.has(key) || v == null || typeof v === "object") return;
        seen.add(key);
        metaRows.push([key, String(v)]);
    };
    for (const k of preferred) if (k in desc) addRow(k);
    for (const k of Object.keys(desc)) if (!skip.has(k)) addRow(k);

    const metaHtml = metaRows.length
        ? `<dl class="prov-meta">${metaRows
              .map(([k, v]) => `<div class="prov-row"><dt>${e(prettyKey(k))}</dt><dd>${e(v)}</dd></div>`)
              .join("")}</dl>`
        : "";

    const gb = Array.isArray(desc.GeneratedBy) ? desc.GeneratedBy : [];
    const gbHtml = gb.length
        ? `<div class="prov-group">
        <div class="prov-group-title">Generated by</div>
        <div class="prov-cards">${gb.map(renderProvenanceGeneratedBy).join("")}</div>
    </div>`
        : "";

    const sd = Array.isArray(desc.SourceDatasets) ? desc.SourceDatasets : [];
    const sdHtml = sd.length
        ? `<div class="prov-group">
        <div class="prov-group-title">Source datasets</div>
        <div class="prov-cards">${sd.map(renderProvenanceSource).join("")}</div>
    </div>`
        : "";

    if (!metaHtml && !gbHtml && !sdHtml) return "";
    const count = metaRows.length + gb.length + sd.length;

    return `
<details class="run-section" data-section="provenance">
    <summary class="run-section-title">
        Provenance
        <span class="count-badge">${count}</span>
    </summary>
    <div class="prov-body">
        ${metaHtml}
        ${gbHtml}
        ${sdHtml}
    </div>
</details>`;
}

function renderTraceSection(tasks) {
    const rows = tasks
        .map((t) => {
            const sc = t.status === "COMPLETED" ? "task-ok" : t.status === "FAILED" ? "task-fail" : "task-other";
            return `<tr>
            <td>${e(t.name)}</td>
            <td><span class="task-status ${sc}">${e(t.status)}</span></td>
            <td class="mono">${e(t.exit)}</td>
            <td class="mono">${e(t.duration)}</td>
            <td class="mono">${e(t.realtime)}</td>
        </tr>`;
        })
        .join("");

    return `
<details class="run-section" data-section="trace">
    <summary class="run-section-title">
        Pipeline Steps
        <span class="count-badge">${tasks.length}</span>
    </summary>
    <div class="trace-table-wrap">
        <table class="trace-table">
            <thead><tr>
                <th>Step</th><th>Status</th><th>Exit</th><th>Wall time</th><th>CPU time</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
</details>`;
}

function renderLogSection(run, logFiles) {
    const buttons = logFiles
        .map((fname) => {
            const url = resolveBlobUrl(run, `${run.path}/logs/${fname}`);
            if (!url) return "";
            const isHtml = fname.endsWith(".html");
            const isTsv = fname === "trace.txt";
            const label = logLabel(fname);
            return `<button class="log-link"
            data-log-url="${e(url)}"
            data-log-label="${e(label)}"
            data-log-html="${isHtml}"
            data-log-table="${isTsv}"
            data-log-external="${e(url)}">${e(label)}</button>`;
        })
        .filter(Boolean)
        .join("");

    return `
<details class="run-section" data-section="logs">
    <summary class="run-section-title">
        Logs
        <span class="count-badge">${logFiles.length}</span>
    </summary>
    <div class="log-links">${buttons}</div>
</details>`;
}

function renderReportSection(run, reportFiles) {
    const frames = reportFiles
        .map((fname) => {
            const url = resolveBlobUrl(run, `${run.path}/logs/${fname}`);
            if (!url) return "";
            const label = logLabel(fname);
            return `<div class="inline-report-wrap">
            <div class="inline-report-header">
                <span class="inline-report-label">${e(label)}</span>
            </div>
            <iframe class="inline-report-iframe"
                data-srcdoc-url="${e(url)}"
                data-srcdoc-name="${e(fname)}"
                sandbox="allow-scripts"
                title="${e(label)}"></iframe>
        </div>`;
        })
        .filter(Boolean)
        .join("");

    return `
<details class="run-section" data-section="reports">
    <summary class="run-section-title">
        Reports
        <span class="count-badge">${reportFiles.length}</span>
    </summary>
    <div class="inline-reports">${frames}</div>
</details>`;
}

// Friendly labels for the interactive views in visualization_output.json.
const KACHERY_VIEW_LABELS = { timeseries: "Timeseries", sorting_summary: "Sorting Summary" };
function kacheryViewLabel(name) {
    return (
        KACHERY_VIEW_LABELS[name] ??
        String(name)
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
    );
}

// recordings: [{ name, images: [{name, url}] }] (static PNGs)
// vizLinks:   { "<recording>": { "<view>": "<figurl/kachery url>" } } (interactive)
function renderVisualizationSection(recordings, vizLinks) {
    const recs = Array.isArray(recordings) ? recordings : [];
    const links = vizLinks && typeof vizLinks === "object" && !Array.isArray(vizLinks) ? vizLinks : {};
    const imagesByRec = new Map(recs.map((r) => [r.name, r.images]));

    // Merge recording names: image groups first (their order), then any
    // recordings that only have interactive links.
    const order = [];
    const seen = new Set();
    for (const r of recs) if (!seen.has(r.name)) (seen.add(r.name), order.push(r.name));
    for (const name of Object.keys(links)) if (!seen.has(name)) (seen.add(name), order.push(name));

    let totalImages = 0;
    let totalLinks = 0;

    const recordingHtml = order
        .map((name) => {
            const images = imagesByRec.get(name) ?? [];
            totalImages += images.length;
            const imgHtml = images
                .map((img) => {
                    const href = e(img.url);
                    const caption = e(img.name.replace(/\.png$/i, "").replace(/_/g, " "));
                    return `<figure class="viz-figure">
                <a class="viz-link" data-viz-url="${href}" data-viz-label="${caption}" href="${href}" rel="noopener" aria-haspopup="dialog">
                    <img class="viz-img" src="${href}" loading="lazy" alt="${e(img.name)}">
                </a>
                <figcaption>${caption}</figcaption>
            </figure>`;
                })
                .join("");
            const gridHtml = imgHtml ? `<div class="viz-grid">${imgHtml}</div>` : "";

            const recLinks = links[name] && typeof links[name] === "object" ? links[name] : null;
            let linksHtml = "";
            if (recLinks) {
                const buttons = Object.entries(recLinks)
                    .filter(([, url]) => typeof url === "string" && /^https?:\/\//i.test(url))
                    .map(([view, url]) => {
                        totalLinks += 1;
                        return `<a class="viz-kachery-link" href="${e(url)}" target="_blank" rel="noopener"
                    title="Open interactive view in Figurl">↗ ${e(kacheryViewLabel(view))}</a>`;
                    })
                    .join("");
                if (buttons) linksHtml = `<div class="viz-kachery-links">${buttons}</div>`;
            }

            if (!gridHtml && !linksHtml) return "";
            return `<div class="viz-recording">
        <div class="viz-recording-label">${e(name)}</div>
        ${gridHtml}
        ${linksHtml}
    </div>`;
        })
        .filter(Boolean)
        .join("");

    if (!recordingHtml) return "";
    const count = totalImages + totalLinks;

    return `
<details class="run-section" data-section="viz">
    <summary class="run-section-title">
        Visualizations
        <span class="count-badge">${count}</span>
    </summary>
    ${recordingHtml}
</details>`;
}

/* ─── Quality control rendering ─────────────────────────────────
   Renders the aind-data-schema QualityControl object (quality_control.json) as a
   collapsible panel of per-metric cards grouped into nested per-stage
   dropdowns (Raw data, Processed data, …), each card showing the metric's
   name, description (with any markdown links), the selected picker value(s),
   and a link to the referenced visualization image when it can be matched to
   a known PNG. The object's Pass/Fail/Pending statuses (per-metric
   status_history and the top-level status map) are evaluation bookkeeping,
   not results of this run — they are not rendered; nor is the modality
   abbreviation, redundant for single-modality runs.                          */

// Convert a description containing markdown links into safe HTML: escape first,
// then turn [label](http…) into anchors.
function qcLinkifyDescription(text) {
    if (!text) return "";
    return e(text).replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_match, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`
    );
}

// Best-effort match of a metric "reference" (e.g.
// "quality_control/<probe>/traces_raw.png") to one of the run's known viz images,
// preferring an image whose recording group matches the probe segment.
function qcResolveReference(reference, vizData) {
    if (!reference || !Array.isArray(vizData)) return null;
    const segments = reference.split("/").filter(Boolean);
    const fileName = segments[segments.length - 1];
    const probe = segments.length >= 2 ? segments[segments.length - 2] : null;
    const candidates = [];
    for (const rec of vizData) {
        for (const img of rec.images) {
            if (img.name === fileName) candidates.push({ recording: rec.name, ...img });
        }
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1 || !probe) return candidates[0];
    const preferred = candidates.find((c) => c.recording.includes(probe) || probe.includes(c.recording));
    return preferred ?? candidates[0];
}

// Partition QC plots out of the visualization set: resolve each metric's
// referenced image against the full viz data, attach it to the metric as
// `.plot`, and return a filtered vizData with those plots removed. Removal is by
// file name, so a duplicate copy of a QC plot living elsewhere in the gallery
// (e.g. a top-level "summary" drift_map alongside the per-probe one) is dropped
// too — each plot then appears only in its QC card. Empty recording groups are
// dropped; returns null if nothing remains for the visualization section.
function partitionQcPlots(qc, vizData) {
    const metrics = Array.isArray(qc?.metrics) ? qc.metrics : [];
    const claimedNames = new Set();
    for (const metric of metrics) {
        const img = qcResolveReference(metric?.reference, vizData);
        metric.plot = img ? { name: img.name, url: img.url } : null;
        if (img) claimedNames.add(img.name);
    }
    if (!Array.isArray(vizData) || claimedNames.size === 0) return vizData;
    const filtered = vizData
        .map((rec) => ({ name: rec.name, images: rec.images.filter((img) => !claimedNames.has(img.name)) }))
        .filter((rec) => rec.images.length > 0);
    return filtered.length > 0 ? filtered : null;
}

function renderQcMetric(metric) {
    const descHtml = metric?.description
        ? `<p class="qc-metric-desc">${qcLinkifyDescription(metric.description)}</p>`
        : "";

    // Embedded plot (clickable to open full size in the image modal).
    const plot = metric?.plot;
    const label = metric?.name ?? plot?.name ?? "Plot";
    const plotHtml = plot
        ? `<a class="viz-link qc-plot" data-viz-url="${e(plot.url)}" data-viz-label="${e(label)}" href="${e(plot.url)}" rel="noopener" aria-haspopup="dialog">
        <img class="qc-plot-img" src="${e(plot.url)}" loading="lazy" alt="${e(label)}">
    </a>`
        : "";

    // Picker-style values (dropdown/checkbox) carry the widget's arguments —
    // the selectable `options` and the status each choice maps to — alongside
    // the actual selection in `value`. Only the selection is a result; show it
    // as-is and leave the argument arrays unrendered.
    let valueHtml = "";
    const value = metric?.value;
    if (value && typeof value === "object" && Array.isArray(value.options)) {
        const selections = (Array.isArray(value.value) ? value.value : [value.value]).filter(
            (v) => v != null && String(v) !== ""
        );
        valueHtml = selections.length
            ? `<div class="qc-values">${selections.map((v) => `<span class="qc-value">${e(String(v))}</span>`).join("")}</div>`
            : "";
    }

    return `<div class="qc-metric">
    <div class="qc-metric-head">
        <span class="qc-metric-name">${e(metric?.name ?? "Metric")}</span>
    </div>
    ${descHtml}
    ${plotHtml}
    ${valueHtml}
</div>`;
}

function renderQualityControlSection(qc) {
    const metrics = Array.isArray(qc?.metrics) ? qc.metrics : [];
    if (metrics.length === 0) return "";

    // Group metrics by processing stage (preserving first-seen order), each
    // stage its own nested dropdown. The data-section key (stage name
    // URI-encoded so it is safe inside an attribute selector) lets an open
    // stage survive the in-place card re-renders of updateRunCard.
    const byStage = groupBy(metrics, (m) => m.stage || "Other");
    const stagesHtml = Array.from(byStage.entries())
        .map(([stage, stageMetrics]) => {
            const cards = stageMetrics.map((m) => renderQcMetric(m)).join("");
            return `<details class="qc-stage" data-section="qc-stage-${encodeURIComponent(stage)}">
        <summary class="qc-stage-title">${e(stage)}<span class="count-badge">${stageMetrics.length}</span></summary>
        <div class="qc-metrics">${cards}</div>
    </details>`;
        })
        .join("");

    return `
<details class="run-section" data-section="qc">
    <summary class="run-section-title">
        Quality Control
        <span class="count-badge">${metrics.length}</span>
    </summary>
    ${stagesHtml}
</details>`;
}

/* ─── Curation (SpikeInterface GUI) ─────────────────────────────
   A successful run's postprocessed output is one SortingAnalyzer per
   recording, each a DANDI Zarr asset under
   "{run.path}/derivatives/postprocessed/<recording>.zarr". A Zarr asset's
   content id in paths.tsv is its DANDI Zarr ID (not a blob id), and its store
   lives at s3://dandiarchive/zarr/<zarr_id>/ -- which spikeinterface can open
   directly (anonymously), so the GUI streams only the pieces it needs instead
   of downloading the whole analyzer. The Curation page (?view=curation)
   shows the script with placeholders; a run card's ✎ Curate opens it in a
   new tab with that job's values filled in (&job=<id>).                     */
const DANDI_ZARR_S3_BASE = "s3://dandiarchive/zarr";
const SPIKEINTERFACE_GUI_URL = "https://github.com/SpikeInterface/spikeinterface-gui";
const SPIKEINTERFACE_GUI_INSTALL = 'pip install "spikeinterface-gui[desktop]" s3fs';

function dandiZarrS3Url(zarrId) {
    return `${DANDI_ZARR_S3_BASE}/${zarrId}/`;
}

// The run's postprocessed analyzers, sorted by recording name:
// [{ name, zarrId, url }]. Only direct children of the postprocessed/
// directory count (a Zarr asset's store is a single paths.tsv row).
function runPostprocessedAnalyzers(run) {
    const outputPaths = run?.outputPaths;
    if (!outputPaths || !run.path) return [];
    const prefix = `${run.path}/derivatives/postprocessed/`;
    const analyzers = [];
    for (const [repoPath, zarrId] of Object.entries(outputPaths)) {
        if (!repoPath.startsWith(prefix) || !zarrId) continue;
        const fileName = repoPath.slice(prefix.length);
        if (fileName.includes("/") || !fileName.toLowerCase().endsWith(".zarr")) continue;
        analyzers.push({ name: fileName.slice(0, -".zarr".length), zarrId, url: dandiZarrS3Url(zarrId) });
    }
    return analyzers.sort((a, b) => a.name.localeCompare(b.name));
}

// Job ID of a run: the queue's job_id, else its capsule directory name.
function runJobLabel(run) {
    if (run.jobId) return String(run.jobId);
    const parts = String(run.path ?? "")
        .split("/")
        .filter(Boolean);
    return parts[parts.length - 1] ?? "job";
}

// Placeholders of the generic script on the Curation page (no job given);
// the page's instructions explain where to find each value.
const CURATION_PLACEHOLDERS = {
    jobId: "<JOB_ID>",
    capsulePath: "<JOB_CAPSULE_PATH>",
    recording: "<RECORDING_NAME>",
    zarrId: "<ZARR_ID>",
};

// Values filled into the curation script: a run's own, or the placeholders.
function curationScriptValues(run = null) {
    if (!run) {
        return {
            jobLabel: CURATION_PLACEHOLDERS.jobId,
            capsulePath: CURATION_PLACEHOLDERS.capsulePath,
            analyzers: [{ name: CURATION_PLACEHOLDERS.recording, url: dandiZarrS3Url(CURATION_PLACEHOLDERS.zarrId) }],
        };
    }
    return { jobLabel: runJobLabel(run), capsulePath: run.path, analyzers: runPostprocessedAnalyzers(run) };
}

// Python script that opens one of a job's analyzers in the SpikeInterface
// GUI with the curation panel on. The DANDI copy is read-only, so the GUI's
// "Save curation" button writes (and a re-run resumes from) a local JSON file
// in the spikeinterface curation format. JSON string literals are valid
// Python string literals, so JSON.stringify quotes every interpolated value.
function curationScript({ jobLabel, capsulePath, analyzers }) {
    const py = (value) => JSON.stringify(String(value));
    const analyzerLines = analyzers.map((a) => `    ${py(a.name)}: ${py(a.url)},`).join("\n");
    const choice =
        analyzers.length > 1
            ? `# This job has ${analyzers.length} recordings; pick the one to curate.\nRECORDING = ${py(analyzers[0].name)}`
            : `RECORDING = ${py(analyzers[0].name)}`;
    return `# Curate ${jobLabel} with SpikeInterface GUI, streaming its postprocessed
# SortingAnalyzer from the DANDI Archive (nothing is downloaded up front).
#
#   ${SPIKEINTERFACE_GUI_INSTALL}
#
# Job capsule: ${capsulePath}
import json
from pathlib import Path

import spikeinterface as si
from spikeinterface_gui import run_mainwindow

# Postprocessed recordings of this job (DANDI Zarr asset IDs on the public S3 bucket)
ANALYZERS = {
${analyzerLines}
}
${choice}

# The DANDI copy is read-only: "Save curation" writes to (and a re-run resumes from) this file.
CURATION_FILE = Path(f"${jobLabel}_{RECORDING}_curation.json")

analyzer = si.load_sorting_analyzer(ANALYZERS[RECORDING], load_extensions=False)

if CURATION_FILE.exists():
    curation = json.loads(CURATION_FILE.read_text())
else:
    curation = {
        "format_version": "2",
        "unit_ids": analyzer.unit_ids.tolist(),
        "manual_labels": [],
        "merges": [],
        "splits": [],
        "removed": [],
    }


def save_curation(curation_data):
    CURATION_FILE.write_text(json.dumps(curation_data, indent=4, default=str))
    print(f"Saved curation to {CURATION_FILE.resolve()}")


run_mainwindow(
    analyzer,
    mode="desktop",  # or "web" (pip install "spikeinterface-gui[web]") to curate in a browser tab
    curation=True,
    curation_dict=curation,
    curation_callback=save_curation,
    with_traces=False,  # the postprocessed output does not include the recording's traces
)
`;
}

// Code block with a copy button (wired up by initCopyCodeButtons). Each of
// *placeholders* is highlighted in the rendered code; the copied text is the
// plain code.
function renderCopyableCode(code, placeholders = []) {
    let html = e(code);
    for (const token of placeholders) {
        html = html.split(e(token)).join(`<mark class="code-placeholder">${e(token)}</mark>`);
    }
    return `<div class="code-block">
    <button type="button" class="copy-code-btn" aria-label="Copy code to clipboard" title="Copy">${COPY_ICON}</button>
    <pre class="code-block-pre"><code class="language-python">${html}</code></pre>
</div>`;
}

// Key identifying a run on the Curation page (?job=…): its job ID, else its
// capsule path (older entries without a job_id).
function runCurationKey(run) {
    return run.jobId ?? run.path;
}

function curationPageUrl(run) {
    return `?view=curation&job=${encodeURIComponent(runCurationKey(run))}`;
}

function isCuratableRun(run) {
    return run.status === "success" && runPostprocessedAnalyzers(run).length > 0;
}

// Run-card header indicator: a link opening the Curation page (in a new tab)
// with the script filled in for this run, and a muted marker for successful
// runs whose capsule has no postprocessed output (nothing to curate). Other
// statuses show nothing.
function renderCurationLink(run) {
    if (run.status !== "success") return "";
    if (!isCuratableRun(run)) {
        return `<span class="run-entry-curate-link run-entry-curate-missing" title="This job capsule has no derivatives/postprocessed output, so there is nothing to curate">✎ Not curatable</span>`;
    }
    return `<a class="run-entry-curate-link" href="${e(curationPageUrl(run))}" target="_blank" rel="noopener" title="Open a SpikeInterface GUI curation script for this run in a new tab">✎ Curate</a>`;
}

/* ─── Curation page (?view=curation) ─────────────────────────── */
const CURATION_SETUP_OPEN_KEY = "curationSetupOpen";

// Whether the setup-instructions card starts expanded: open unless this
// viewer collapsed it last time (a per-browser convenience only).
function curationSetupOpen() {
    try {
        return localStorage.getItem(CURATION_SETUP_OPEN_KEY) !== "0";
    } catch {
        return true;
    }
}

function rememberCurationSetupOpen(open) {
    try {
        localStorage.setItem(CURATION_SETUP_OPEN_KEY, open ? "1" : "0");
    } catch {
        /* storage unavailable; the card just starts open next time */
    }
}

function findCurationRun(runs, key) {
    if (!key) return null;
    return runs.find((run) => run.jobId === key || run.path === key) ?? null;
}

// Why a requested ?job= fell back to the placeholder template.
const CURATION_FALLBACK_REASONS = {
    missing: "was not found in the queue",
    uncuratable: "has no <code>derivatives/postprocessed/</code> output to curate",
    error: "could not be loaded",
};

// The Curation page: without a run, the script with placeholders and how to
// find each value; with one (opened from a run card's ✎ Curate), the script
// filled in for that job. *fallback* ({ jobKey, reason, detail? }, reason a
// CURATION_FALLBACK_REASONS key) explains why a requested job fell back to
// placeholders; every part of it is escaped here.
function renderCurationPage(run = null, fallback = null) {
    const P = CURATION_PLACEHOLDERS;
    const values = curationScriptValues(run);
    const code = (text) => `<code>${e(text)}</code>`;
    const dandisetUrl = run ? `${dandiBaseUrl(run.dandisetId)}/dandiset/${encodeURIComponent(run.dandisetId)}` : "";
    const filledHtml = run
        ? `<div class="curation-filled">
        Filled in for ${code(values.jobLabel)}
        <span class="run-sep">·</span>
        <a href="${e(dandisetUrl)}" target="_blank" rel="noopener">Dandiset ${e(run.dandisetId)}</a>
        ${run.dandiPath ? `<span class="run-sep">·</span><span class="curation-filled-asset">${e(run.dandiPath)}</span>` : ""}
        <span class="run-sep">·</span>
        <a href="${e(derivativesUrl(run.path))}" target="_blank" rel="noopener">↗ Derivatives${DANDI_ICON_HTML}</a>
    </div>`
        : "";
    const reasonHtml = fallback ? (CURATION_FALLBACK_REASONS[fallback.reason] ?? CURATION_FALLBACK_REASONS.error) : "";
    const noticeHtml = fallback
        ? `<p class="curation-notice">Job <code>${e(fallback.jobKey)}</code> ${reasonHtml}${fallback.detail ? ` (${e(fallback.detail)})` : ""}, so the script below shows placeholders.</p>`
        : "";
    const placeholders = run ? [] : Object.values(P);

    const findSteps = run
        ? `<div class="params-instructions-step">
            <span class="params-instructions-num">1</span>
            <span>The script below is filled in with this job's postprocessed <code>SortingAnalyzer</code> Zarr asset${values.analyzers.length === 1 ? "" : "s"}, streamed from the DANDI Archive's public S3 bucket instead of being downloaded.${values.analyzers.length > 1 ? " Set <code>RECORDING</code> to the recording you want to curate." : ""}</span>
        </div>`
        : `<div class="params-instructions-step">
            <span class="params-instructions-num">1</span>
            <span>Find the run's job capsule in <a href="${e(derivativesUrl("derivatives"))}" target="_blank" rel="noopener">Dandiset ${e(DERIVATIVES_DANDISET_ID)}'s derivatives</a> (a run card's <strong>↗ Derivatives</strong> button opens it). ${code(P.jobId)} is the capsule's folder name (<code>job-…</code>) and ${code(P.capsulePath)} its full path; both only label the script and name the curation file.</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">2</span>
            <span>Open the capsule's <code>derivatives/postprocessed/</code> folder: each <code>${e(P.recording)}.zarr</code> asset is one recording's <code>SortingAnalyzer</code>. Its ${code(P.zarrId)} is in the asset's metadata, whose <code>contentUrl</code> includes <code>https://dandiarchive.s3.amazonaws.com/zarr/${e(P.zarrId)}/</code>. It is also the asset's <code>content_id</code> in the Dandiset's <code>derivatives/paths.tsv</code>. Add one <code>ANALYZERS</code> entry per recording and set <code>RECORDING</code> to the one to curate.</span>
        </div>`;
    const offset = run ? 1 : 2;

    return `<div class="curation-page">
    <details class="params-instructions curation-setup"${curationSetupOpen() ? " open" : ""}>
        <summary class="params-instructions-title curation-setup-title">How to curate a run</summary>
        ${findSteps}
        <div class="params-instructions-step">
            <span class="params-instructions-num">${offset + 1}</span>
            <span>Install <a href="${e(SPIKEINTERFACE_GUI_URL)}" target="_blank" rel="noopener">SpikeInterface GUI</a> with S3 support: <code>${e(SPIKEINTERFACE_GUI_INSTALL)}</code>.</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">${offset + 2}</span>
            <span>Click the copy button on the script, save it (e.g.&nbsp;<code>curate.py</code>) and run it with Python. Loading the analyzer's extensions takes a minute or two over the network.</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">${offset + 3}</span>
            <span>Label, merge, split or remove units in the curation panel, then click <strong>Save curation</strong>. The archive copy is read-only, so the curation is saved to a local JSON file in the SpikeInterface curation format; re-running the script resumes from it. The traces view is disabled because the postprocessed output does not include the recording.</span>
        </div>
    </details>
    ${noticeHtml}
    ${filledHtml}
    ${
        run
            ? ""
            : `<p class="curation-tip">Tip: click <strong>✎ Curate</strong> on a successful run in the <a href="?view=dashboard">dashboard</a> to open this script with every value filled in for that job.</p>`
    }
    <section class="curation-script">
        <div class="params-output-header">
            <span class="params-output-title">${run ? "Curation script" : "Curation script template"}</span>
        </div>
        ${renderCopyableCode(curationScript(values), placeholders)}
    </section>
</div>`;
}

// ?job=<id> (from a run card's ✎ Curate) fills the script in for that job;
// without it, or when the job can't be resolved, the page shows placeholders.
async function initCurationPage() {
    const jobKey = new URLSearchParams(window.location.search).get("job");
    let run = null;
    let fallback = null;
    if (jobKey) {
        try {
            run = findCurationRun(parseQueueEntries(await fetchQueueState()), jobKey);
            if (!run) {
                fallback = { jobKey, reason: "missing" };
            } else if (runPostprocessedAnalyzers(run).length === 0) {
                fallback = { jobKey, reason: "uncuratable" };
                run = null;
            }
        } catch (err) {
            fallback = { jobKey, reason: "error", detail: err.message || "unknown error" };
        }
    }
    document.getElementById("runs").innerHTML = renderCurationPage(run, fallback);
    showDiffResults();
    document
        .querySelector(".curation-setup")
        ?.addEventListener("toggle", (evt) => rememberCurationSetupOpen(evt.currentTarget.open));
}

const COPY_ICON = `<svg class="copy-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v7A1.5 1.5 0 0 0 4 11.5h.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
const COPIED_ICON = `<svg class="copy-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const COPY_FAILED_ICON = `<svg class="copy-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// Clipboard handler for every .copy-code-btn on the page (one delegated
// listener, so code blocks rendered later need no wiring). The icon briefly
// turns into a check (or a cross on failure) and the title says which.
function initCopyCodeButtons() {
    document.addEventListener("click", (evt) => {
        const btn = evt.target.closest?.(".copy-code-btn");
        if (!btn) return;
        const code = btn.closest(".code-block")?.querySelector("code")?.textContent ?? "";
        const done = (state) => {
            btn.dataset.state = state;
            btn.innerHTML = state === "copied" ? COPIED_ICON : COPY_FAILED_ICON;
            btn.title = state === "copied" ? "Copied!" : "Copy failed";
            setTimeout(() => {
                delete btn.dataset.state;
                btn.innerHTML = COPY_ICON;
                btn.title = "Copy";
            }, 1500);
        };
        if (!navigator.clipboard?.writeText) {
            done("failed");
            return;
        }
        navigator.clipboard.writeText(code).then(
            () => done("copied"),
            () => done("failed")
        );
    });
}

// Collapsed stand-in for a section whose backing artifact has not been
// fetched yet (quality_control.json, dataset_description.json). Without it
// the section is invisible until some other section's expand happens to
// trigger the on-demand hydration and it pops in out of nowhere — expanding
// the placeholder itself is the reveal that enqueues the fetch (see
// initHydrationPromotion), and updateRunCard swaps in the real content. The
// "…" count badge is a geometry stand-in for the real count: without it the
// summary row is a few pixels shorter than the loaded section's, so the page
// would shift when the content lands.
function renderSectionPlaceholder(section, title) {
    return `
<details class="run-section" data-section="${e(section)}">
    <summary class="run-section-title">
        ${e(title)}
        <span class="count-badge">…</span>
    </summary>
    <div class="section-loading">Loading ${e(title.toLowerCase())}…</div>
</details>`;
}

/* ─── Grouping helpers ──────────────────────────────────────── */
function groupBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return map;
}

function renderGroupBadges(runs) {
    const s = runs.filter((r) => r.status === "success").length;
    const f = runs.filter((r) => r.status === "failed").length;
    const q = runs.filter((r) => r.status === "queued").length;
    const st = runs.filter(isStalled).length;
    const r = runs.filter((run) => run.status === "running" && !isStalled(run)).length;
    const u = runs.length - s - f - q - st - r;
    const runsWithKnownByteCounts = runs.filter((run) => runByteCount(run) !== null).length;
    const totalBytes = sumRunByteCounts(runs);
    // A success count is provisional while any counted run's trace could still
    // flip it to failed — render it dimmed so an unconfirmed ✓ can't mislead.
    // Failed counts never need this: hydration can only add failures.
    const provisional = runs.some((r) => r.status === "success" && r.statusProvisional);
    // Fixed left-to-right priority: running → queued → stalled → success →
    // unknown, with failures always furthest right.
    const parts = [];
    if (r)
        parts.push(
            `<span class="gbadge gbadge-running" title="${r} running run${r !== 1 ? "s" : ""}">${r}&thinsp;▶</span>`
        );
    if (q)
        parts.push(
            `<span class="gbadge gbadge-queued" title="${q} queued run${q !== 1 ? "s" : ""}">${q}&thinsp;⧗</span>`
        );
    if (st)
        parts.push(
            `<span class="gbadge gbadge-stalled" title="${st} stalled run${st !== 1 ? "s" : ""} (running for more than 24 hours)">${st}&thinsp;⚠</span>`
        );
    if (s)
        parts.push(
            `<span class="gbadge gbadge-success${provisional ? " status-provisional" : ""}" title="${s} successful run${s !== 1 ? "s" : ""}${provisional ? " (pending trace confirmation)" : ""}">${s}&thinsp;✓</span>`
        );
    if (s) {
        // How many of the group's successful runs have postprocessed output
        // that can be opened on the Curation page.
        const c = runs.filter(isCuratableRun).length;
        parts.push(
            `<span class="gbadge gbadge-curatable${c ? "" : " gbadge-curatable-none"}" title="${c} of ${s} successful run${s !== 1 ? "s" : ""} ha${c === 1 ? "s" : "ve"} postprocessed output to curate">${c}/${s}&thinsp;✎</span>`
        );
    }
    if (u)
        parts.push(
            `<span class="gbadge gbadge-unknown" title="${u} unknown run${u !== 1 ? "s" : ""}">${u}&thinsp;?</span>`
        );
    if (f)
        parts.push(
            `<span class="gbadge gbadge-failed" title="${f} failed run${f !== 1 ? "s" : ""}">${f}&thinsp;✗</span>`
        );
    if (runsWithKnownByteCounts) {
        const totalBytesLabel = formatByteCount(totalBytes);
        parts.push(
            `<span class="gbadge gbadge-bytes" title="DATA PROCESSED: ${totalBytesLabel}">DATA PROCESSED:&nbsp;${totalBytesLabel}</span>`
        );
    }
    return parts.join("");
}

function resolveRegistryAlias(hash, registry) {
    if (!hash) return null;
    const normalizedHash = String(hash).toLowerCase();
    const exactHashMatches = [];
    const prefixHashMatches = [];
    for (const entry of registry) {
        if (entry.md5 === normalizedHash) {
            exactHashMatches.push(entry);
        } else if (entry.md5.startsWith(normalizedHash)) {
            prefixHashMatches.push(entry);
        }
    }
    const candidates = exactHashMatches.length > 0 ? exactHashMatches : prefixHashMatches;
    const FALLBACK_ALIAS_PRIORITY = 1;
    const aliasPriority = (entry) => entry.priority ?? FALLBACK_ALIAS_PRIORITY;
    candidates.sort((a, b) => aliasPriority(b) - aliasPriority(a) || a.alias.localeCompare(b.alias));
    return candidates[0] ?? null;
}

function renderRegistryLink(prefix, hash, registry, subdir) {
    if (!hash) return "";
    const match = resolveRegistryAlias(hash, registry);
    if (!match) return `${prefix}:&nbsp;${e(String(hash))}`;
    const sourceUrl = e(`${AIND_EPHYS_PIPELINE_CODE_URL}/${subdir}/${match.path}`);
    return `${prefix}:&nbsp;<a class="src-link" href="${sourceUrl}" target="_blank" rel="noopener">${e(match.alias)}</a>`;
}

function uniqueRegistryEntries(registry) {
    const entriesByHash = new Map();
    for (const entry of registry) {
        const key = `${entry.md5}\x00${entry.path}`;
        const existing = entriesByHash.get(key);
        const storedPriority = existing?.priority ?? REGISTRY_FALLBACK_ALIAS_PRIORITY;
        const candidatePriority = entry.priority ?? REGISTRY_FALLBACK_ALIAS_PRIORITY;
        if (
            !existing ||
            candidatePriority > storedPriority ||
            (candidatePriority === storedPriority && entry.alias.localeCompare(existing.alias) < 0)
        ) {
            entriesByHash.set(key, entry);
        }
    }
    return [...entriesByHash.values()].sort((a, b) => a.alias.localeCompare(b.alias));
}

function buildParamsCompareEntries() {
    return [...PARAMS_REGISTRY]
        .sort((a, b) => a.alias.localeCompare(b.alias))
        .map((entry) => ({
            key: entry.alias,
            alias: entry.alias,
            path: entry.path,
            sourceUrl: codeRepoBlobUrl(`src/dandi_compute_code/aind_ephys_pipeline/params/${entry.path}`),
        }));
}

function buildPairwiseComparisons(items) {
    const pairs = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            pairs.push([items[i], items[j]]);
        }
    }
    return pairs;
}

function uniquePipelineEntries(runs) {
    return [...groupBy(runs, (run) => run.pipelineVersion).values()]
        .map((versions) => versions[0])
        .sort((a, b) => FILTER_VALUE_COLLATOR.compare(a.pipelineVersion, b.pipelineVersion))
        .map((run) => ({
            key: run.pipelineVersion,
            pipelineName: run.pipelineName,
            pipelineVersion: run.pipelineVersion,
        }));
}

function pipelineCompareRef(version) {
    const versionText = String(version ?? "");
    const hashPart = pipelineCompareRefCandidates(versionText)[0];
    if (hashPart) {
        return hashPart;
    }
    return versionText;
}

function pipelineCompareRefCandidates(version) {
    return String(version ?? "")
        .split("+")
        .slice(1)
        .filter((part) => COMMIT_HASH_PATTERN.test(part));
}

const _pipelineCompareRefCache = new Map();

async function resolvePipelineCompareRef(version) {
    const versionText = String(version ?? "");
    const refs = pipelineCompareRefCandidates(versionText);
    if (refs.length === 0) {
        return versionText;
    }
    for (const ref of refs) {
        if (ref.length === FULL_COMMIT_HASH_LENGTH) {
            return ref;
        }
        if (_pipelineCompareRefCache.has(ref)) {
            const cachedResolved = await _pipelineCompareRefCache.get(ref);
            if (cachedResolved) {
                return cachedResolved;
            }
            continue;
        }
        const request = (async () => {
            try {
                const resp = await cachedFetch(`${PIPELINE_API_BASE}/commits/${encodeURIComponent(ref)}`, {
                    headers: { Accept: "application/vnd.github+json" },
                });
                if (!resp.ok) return null;
                const data = await resp.json();
                return typeof data?.sha === "string" && data.sha ? data.sha : null;
            } catch {
                return null;
            }
        })();
        _pipelineCompareRefCache.set(ref, request);
        const resolved = await request;
        if (resolved) {
            return resolved;
        }
    }
    return refs[0] ?? versionText;
}

async function buildPipelineCompareEntries(runs) {
    const uniqueVersions = uniquePipelineEntries(runs);
    const resolvedEntries = await Promise.all(
        uniqueVersions.map(async (entry) => ({
            ...entry,
            compareRef: await resolvePipelineCompareRef(entry.pipelineVersion),
        }))
    );
    return Array.from(groupBy(resolvedEntries, (entry) => entry.compareRef).values())
        .map(
            (entriesForRef) =>
                [...entriesForRef].sort(
                    (a, b) =>
                        a.pipelineVersion.split("+").length - b.pipelineVersion.split("+").length ||
                        FILTER_VALUE_COLLATOR.compare(a.pipelineVersion, b.pipelineVersion)
                )[0]
        )
        .sort((a, b) => FILTER_VALUE_COLLATOR.compare(a.pipelineVersion, b.pipelineVersion));
}

async function fetchPipelineCompareSummary(baseRef, headRef) {
    if (!baseRef || !headRef || baseRef === headRef) {
        return { kind: "same-ref" };
    }
    try {
        const resp = await cachedFetch(
            `${PIPELINE_API_BASE}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`,
            {
                headers: { Accept: "application/vnd.github+json" },
            }
        );
        if (!resp.ok) {
            return { kind: "error", message: `Unable to load pipeline compare details (HTTP ${resp.status}).` };
        }
        const data = await resp.json();
        return {
            kind: "compare",
            aheadBy: Number(data?.ahead_by ?? 0),
            behindBy: Number(data?.behind_by ?? 0),
            totalCommits: Number(data?.total_commits ?? 0),
            files: Array.isArray(data?.files) ? data.files : [],
            commits: Array.isArray(data?.commits) ? data.commits : [],
        };
    } catch {
        return { kind: "error", message: "Unable to load pipeline compare details." };
    }
}

function renderNamedPairTable(
    rowLabel,
    leftColumnLabel,
    rightColumnLabel,
    leftCellHtml,
    rightCellHtml,
    leftColumnHtml = null,
    rightColumnHtml = null
) {
    return `<div class="diff-detail-table-wrap">
        <table class="diff-detail-table diff-detail-table-pair">
            <thead>
                <tr>
                    <th class="diff-detail-corner" aria-hidden="true"></th>
                    <th scope="col">${leftColumnHtml ?? e(leftColumnLabel)}</th>
                    <th scope="col">${rightColumnHtml ?? e(rightColumnLabel)}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th scope="row" class="diff-detail-key">${e(rowLabel)}</th>
                    <td>${leftCellHtml}</td>
                    <td>${rightCellHtml}</td>
                </tr>
            </tbody>
        </table>
    </div>`;
}

function renderTextPairTable(rowLabel, leftLabel, rightLabel) {
    const leftCellText = e(leftLabel);
    const rightCellText = e(rightLabel);
    return renderNamedPairTable(rowLabel, leftLabel, rightLabel, leftCellText, rightCellText);
}

function renderKeyValueTable(rows) {
    return `<div class="diff-detail-table-wrap">
        <table class="diff-detail-table">
            <thead>
                <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Value</th>
                </tr>
            </thead>
            <tbody>${rows
                .map(
                    (row) => `<tr>
                    <th scope="row" class="diff-detail-key">${e(row.label)}</th>
                    <td>${row.valueHtml}</td>
                </tr>`
                )
                .join("")}</tbody>
        </table>
    </div>`;
}

function renderTwoColumnTable(headers, rows) {
    return `<div class="diff-detail-table-wrap">
        <table class="diff-detail-table">
            <thead>
                <tr>
                    <th scope="col">${e(headers[0])}</th>
                    <th scope="col">${e(headers[1])}</th>
                </tr>
            </thead>
            <tbody>${rows
                .map(
                    (row) => `<tr>
                    <td>${row[0]}</td>
                    <td>${row[1]}</td>
                </tr>`
                )
                .join("")}</tbody>
        </table>
    </div>`;
}

function renderDiffInlineLink(url, label) {
    return `<a class="diff-inline-link" href="${e(url)}" target="_blank" rel="noopener">${e(label)}</a>`;
}

function renderNamedDiffTable(
    parameterLabel,
    leftLabel,
    rightLabel,
    changes,
    leftColumnHtml = null,
    rightColumnHtml = null
) {
    if (changes.length === 0) {
        return '<p class="diff-empty-state diff-empty-state-inline">No JSON differences detected.</p>';
    }
    return `<div class="diff-detail-table-wrap">
        <table class="diff-detail-table">
            <thead>
                <tr>
                    <th scope="col">${e(parameterLabel)}</th>
                    <th scope="col">${leftColumnHtml ?? e(leftLabel)}</th>
                    <th scope="col">${rightColumnHtml ?? e(rightLabel)}</th>
                </tr>
            </thead>
            <tbody>${changes
                .map(
                    (change) => `<tr>
                    <th scope="row" class="diff-detail-key diff-change-path">${e(change.path || ROOT_DIFF_PATH_LABEL)}</th>
                    <td>${renderDiffCellValue(change.left, "diff-change-before")}</td>
                    <td>${renderDiffCellValue(change.right, "diff-change-after")}</td>
                </tr>`
                )
                .join("")}</tbody>
        </table>
    </div>`;
}

function renderDiffCellValue(value, sideClass) {
    if (isPlainObject(value)) {
        return `<pre class="diff-detail-chip ${sideClass} diff-detail-chip-pretty">${e(JSON.stringify(value, null, 2))}</pre>`;
    }

    const compactRenderedValue = renderDiffValue(value);
    const shouldPrettyPrintJson = Array.isArray(value) && compactRenderedValue.length > 60;
    const renderedValue = shouldPrettyPrintJson ? JSON.stringify(value, null, 2) : compactRenderedValue;
    const tagName = shouldPrettyPrintJson ? "pre" : "span";
    const prettyClass = shouldPrettyPrintJson ? " diff-detail-chip-pretty" : "";
    return `<${tagName} class="diff-detail-chip ${sideClass}${prettyClass}">${e(renderedValue)}</${tagName}>`;
}

function renderConfigDiffTable(leftLabel, rightLabel, changes, leftColumnHtml = null, rightColumnHtml = null) {
    if (changes.length === 0) {
        return '<p class="diff-empty-state diff-empty-state-inline">No config differences detected.</p>';
    }
    return `<div class="diff-detail-table-wrap">
        <table class="diff-detail-table">
            <thead>
                <tr>
                    <th scope="col">Config snippet</th>
                    <th scope="col">${leftColumnHtml ?? e(leftLabel)}</th>
                    <th scope="col">${rightColumnHtml ?? e(rightLabel)}</th>
                </tr>
            </thead>
            <tbody>${changes
                .map(
                    (change) => `<tr>
                    <th scope="row" class="diff-detail-key diff-change-path">${e(change.path || ROOT_DIFF_PATH_LABEL)}</th>
                    <td>${renderConfigSnippet(change.left, "before")}</td>
                    <td>${renderConfigSnippet(change.right, "after")}</td>
                </tr>`
                )
                .join("")}</tbody>
        </table>
    </div>`;
}

function renderConfigSnippet(snippetText, side) {
    const lines = (snippetText ?? "").split("\n");
    return `<code class="diff-config-snippet diff-config-snippet-${e(side)}">${lines
        .map((line) => {
            const match = line.match(/^(\s*\d+)\s*([ +-])(.*)$/);
            const lineNumber = match ? match[1] : "";
            const marker = match ? match[2] : " ";
            const content = match ? match[3].replace(/^ /, "") : line;
            const isChanged = marker === "+" || marker === "-";
            return `<span class="diff-config-line${isChanged ? " diff-config-line-changed" : ""}">
                <span class="diff-config-line-number">${e(lineNumber)}</span>
                <span class="diff-config-line-marker">${e(marker === " " ? "·" : marker)}</span>
                <span class="diff-config-line-content">${e(content)}</span>
            </span>`;
        })
        .join("")}</code>`;
}

function renderPipelineCompareBody(baseVersion, headVersion, summary) {
    if (summary?.kind === "same-ref") {
        return '<p class="diff-empty-state diff-empty-state-inline">No distinct pipeline repository commit comparison is available for this version pair.</p>';
    }
    if (summary?.kind === "error") {
        return `<p class="diff-empty-state diff-empty-state-inline">${e(summary.message)}</p>`;
    }
    const summaryRows = [
        {
            label: "Commits",
            valueHtml: e(`${summary.totalCommits} commit${summary.totalCommits !== 1 ? "s" : ""}`),
        },
        {
            label: "Files",
            valueHtml: e(`${summary.files.length} file${summary.files.length !== 1 ? "s" : ""}`),
        },
    ];
    if (summary.aheadBy) {
        summaryRows.push({
            label: "Ahead",
            valueHtml: e(`${summary.aheadBy} commit${summary.aheadBy !== 1 ? "s" : ""} ahead in comparison`),
        });
    }
    if (summary.behindBy) {
        summaryRows.push({
            label: "Behind",
            valueHtml: e(`${summary.behindBy} commit${summary.behindBy !== 1 ? "s" : ""} behind in comparison`),
        });
    }
    const summaryTable = renderKeyValueTable(summaryRows);
    const commitItems =
        summary.commits.length > 0
            ? renderTwoColumnTable(
                  ["Commit", "Message"],
                  summary.commits.map((commit) => {
                      const message = String(commit?.commit?.message ?? "").split("\n")[0] || "(no commit message)";
                      return [
                          `<span class="diff-change-path">${e(String(commit?.sha ?? "").slice(0, 7) || "commit")}</span>`,
                          e(message),
                      ];
                  })
              )
            : '<p class="diff-empty-state diff-empty-state-inline">No commit metadata returned.</p>';
    const fileItems =
        summary.files.length > 0
            ? renderTwoColumnTable(
                  ["File", "Status"],
                  summary.files.map((file) => [
                      `<span class="diff-change-path">${e(file.filename ?? "(unknown file)")}</span>`,
                      e(file.status ?? "changed"),
                  ])
              )
            : '<p class="diff-empty-state diff-empty-state-inline">No changed files were returned.</p>';
    const baseLabel = baseVersion.replace(/\+/g, "-");
    const headLabel = headVersion.replace(/\+/g, "-");
    return `<div class="diff-pair-card">
        ${renderTextPairTable("Pipeline version", baseLabel, headLabel)}
        ${summaryTable}
        ${commitItems}
        ${fileItems}
    </div>`;
}

async function buildPipelineDiffPairs(runs) {
    const compareEntries = await buildPipelineCompareEntries(runs);
    return Promise.all(
        buildPairwiseComparisons(compareEntries).map(async ([base, head]) => {
            const compareUrl = `${PIPELINE_REPO_URL}/compare/${encodeURIComponent(base.compareRef)}...${encodeURIComponent(head.compareRef)}`;
            return {
                pipelineName: base.pipelineName,
                baseVersion: base.pipelineVersion,
                headVersion: head.pipelineVersion,
                compareUrl,
                modalHtml: renderPipelineCompareBody(
                    base.pipelineVersion,
                    head.pipelineVersion,
                    await fetchPipelineCompareSummary(base.compareRef, head.compareRef)
                ),
            };
        })
    );
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

function collectJsonDiffs(left, right, path = []) {
    if (Array.isArray(left) && Array.isArray(right)) {
        const maxLength = Math.max(left.length, right.length);
        return Array.from({ length: maxLength }, (_, index) =>
            collectJsonDiffs(left[index], right[index], [...path, index])
        )
            .flat()
            .filter(Boolean);
    }
    if (isPlainObject(left) && isPlainObject(right)) {
        return [...new Set([...Object.keys(left), ...Object.keys(right)])]
            .sort(FILTER_VALUE_COLLATOR.compare)
            .flatMap((key) => collectJsonDiffs(left[key], right[key], [...path, key]))
            .filter(Boolean);
    }
    const leftText = JSON.stringify(left);
    const rightText = JSON.stringify(right);
    if (leftText === rightText) return [];
    return [{ path: path.join("."), left, right }];
}

function renderDiffValue(value) {
    return value === undefined ? "undefined" : JSON.stringify(value);
}

async function fetchRegistryFile(path, subdir, kindLabel) {
    const resp = await cachedFetch(codeRepoRawUrl(`src/dandi_compute_code/aind_ephys_pipeline/${subdir}/${path}`));
    if (!resp.ok) {
        throw new Error(`Failed to load registered ${kindLabel} file ${path} (HTTP ${resp.status}).`);
    }
    return resp;
}

async function buildParamsDiffPairs() {
    const paramsEntries = buildParamsCompareEntries();
    const paramsWithJson = await Promise.all(
        paramsEntries.map(async (entry) => ({
            ...entry,
            json: await (await fetchRegistryFile(entry.path, "params", "params")).json(),
        }))
    );
    return buildPairwiseComparisons(paramsWithJson).map(([base, head]) => ({
        baseAlias: base.alias,
        headAlias: head.alias,
        baseSourceUrl: base.sourceUrl,
        headSourceUrl: head.sourceUrl,
        changes: collectJsonDiffs(base.json, head.json),
    }));
}

function collectTextDiffs(leftText, rightText) {
    const leftLines = (leftText ?? "").split("\n");
    const rightLines = (rightText ?? "").split("\n");
    const maxLength = Math.max(leftLines.length, rightLines.length);
    const changedLineIndexes = [];
    for (let index = 0; index < maxLength; index += 1) {
        if (leftLines[index] !== rightLines[index]) {
            changedLineIndexes.push(index);
        }
    }
    if (changedLineIndexes.length === 0) return [];
    const contextWindows = changedLineIndexes
        .map((changedLineIndex) => ({
            start: Math.max(0, changedLineIndex - 3),
            end: Math.min(maxLength - 1, changedLineIndex + 3),
        }))
        .sort((a, b) => a.start - b.start);
    const mergedWindows = [];
    for (const window of contextWindows) {
        const previous = mergedWindows[mergedWindows.length - 1];
        if (!previous || window.start > previous.end + 1) {
            mergedWindows.push({ ...window });
            continue;
        }
        previous.end = Math.max(previous.end, window.end);
    }
    return mergedWindows.map(({ start, end }) => {
        const lineNumberWidth = String(end + 1).length;
        const leftSnippet = [];
        const rightSnippet = [];
        for (let index = start; index <= end; index += 1) {
            const left = leftLines[index] ?? "";
            const right = rightLines[index] ?? "";
            const lineNumber = String(index + 1).padStart(lineNumberWidth, " ");
            const isChanged = leftLines[index] !== rightLines[index];
            leftSnippet.push(`${lineNumber} ${isChanged ? "-" : " "} ${left}`);
            rightSnippet.push(`${lineNumber} ${isChanged ? "+" : " "} ${right}`);
        }
        return {
            path: start === end ? `line ${start + 1}` : `lines ${start + 1}-${end + 1}`,
            left: leftSnippet.join("\n"),
            right: rightSnippet.join("\n"),
        };
    });
}

async function buildConfigDiffPairs() {
    const configEntries = uniqueRegistryEntries(CONFIG_REGISTRY);
    const configWithText = await Promise.all(
        configEntries.map(async (entry) => ({
            ...entry,
            sourceUrl: codeRepoBlobUrl(`src/dandi_compute_code/aind_ephys_pipeline/configs/${entry.path}`),
            text: await (await fetchRegistryFile(entry.path, "configs", "config")).text(),
        }))
    );
    return buildPairwiseComparisons(configWithText).map(([base, head]) => ({
        baseAlias: base.alias,
        headAlias: head.alias,
        baseSourceUrl: base.sourceUrl,
        headSourceUrl: head.sourceUrl,
        changes: collectTextDiffs(base.text, head.text),
    }));
}

function renderDiffMatrix(entries, renderHeaderCell, renderBodyCell) {
    if (entries.length < 2) return "";
    const columnEntries = entries.slice(0, -1);
    const columnHeaders = columnEntries
        .map((entry) => `<th scope="col" class="diff-matrix-col-header">${renderHeaderCell(entry)}</th>`)
        .join("");
    const bodyRows = entries
        .map((rowEntry, rowIndex) => {
            const cells = columnEntries
                .map((columnEntry, columnIndex) => {
                    if (rowIndex <= columnIndex) {
                        return '<td class="diff-matrix-cell diff-matrix-cell-empty" aria-hidden="true"></td>';
                    }
                    return `<td class="diff-matrix-cell">${renderBodyCell(columnEntry, rowEntry)}</td>`;
                })
                .join("");
            return `<tr>
                <th scope="row" class="diff-matrix-row-header">${renderHeaderCell(rowEntry)}</th>
                ${cells}
            </tr>`;
        })
        .join("");
    return `<div class="diff-matrix-wrap">
        <table class="diff-matrix">
            <thead>
                <tr>
                    <th class="diff-matrix-corner" aria-hidden="true"></th>
                    ${columnHeaders}
                </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>`;
}

function renderDiffModalTrigger(label, bodyHtml, title = null) {
    const titleAttr = title ? ` data-modal-title="${e(title)}"` : "";
    return `<button type="button" class="diff-cell-trigger" aria-haspopup="dialog" data-modal-html="${e(bodyHtml)}"${titleAttr}>
        <span class="diff-cell-trigger-label">${e(label)}</span>
    </button>`;
}

function renderDiffPage(data) {
    const configEntries = data.configEntries ?? [];
    const configPairMap = data.configPairMap ?? new Map();
    const pipelineHtml =
        data.pipelineEntries.length > 1
            ? renderDiffMatrix(
                  data.pipelineEntries,
                  (entry) => renderPipelineInfo(entry.pipelineName, entry.pipelineVersion),
                  (baseEntry, headEntry) => {
                      const pair = data.pipelinePairMap.get(`${baseEntry.key}\x00${headEntry.key}`);
                      if (!pair) return "";
                      return renderDiffModalTrigger("View compare", pair.modalHtml);
                  }
              )
            : '<p class="diff-empty-state">Only one distinct pipeline repository revision is currently present, so there are no pipeline comparisons to show.</p>';
    const paramsHtml =
        data.paramsEntries.length > 1
            ? renderDiffMatrix(
                  data.paramsEntries,
                  (entry) => renderDiffInlineLink(entry.sourceUrl, entry.alias),
                  (baseEntry, headEntry) => {
                      const pair = data.paramsPairMap.get(`${baseEntry.key}\x00${headEntry.key}`);
                      const pairChanges = pair?.changes ?? [];
                      const baseLinkHtml = renderDiffInlineLink(baseEntry.sourceUrl, baseEntry.alias);
                      const headLinkHtml = renderDiffInlineLink(headEntry.sourceUrl, headEntry.alias);
                      const bodyHtml = `<div class="diff-pair-card">
                            ${renderNamedDiffTable(
                                "Parameter",
                                baseEntry.alias,
                                headEntry.alias,
                                pairChanges,
                                baseLinkHtml,
                                headLinkHtml
                            )}
                        </div>`;
                      const buttonLabel =
                          pairChanges.length > 0
                              ? `View ${pairChanges.length} change${pairChanges.length !== 1 ? "s" : ""}`
                              : "View diff";
                      return renderDiffModalTrigger(buttonLabel, bodyHtml);
                  }
              )
            : '<p class="diff-empty-state">No registered params files were found.</p>';
    const configHtml =
        configEntries.length > 1
            ? renderDiffMatrix(
                  configEntries,
                  (entry) => renderDiffInlineLink(entry.sourceUrl, entry.alias),
                  (baseEntry, headEntry) => {
                      const pair = configPairMap.get(`${baseEntry.key}\x00${headEntry.key}`);
                      const pairChanges = pair?.changes ?? [];
                      const baseLinkHtml = renderDiffInlineLink(baseEntry.sourceUrl, baseEntry.alias);
                      const headLinkHtml = renderDiffInlineLink(headEntry.sourceUrl, headEntry.alias);
                      const bodyHtml = `<div class="diff-pair-card">
                            ${renderConfigDiffTable(
                                baseEntry.alias,
                                headEntry.alias,
                                pairChanges,
                                baseLinkHtml,
                                headLinkHtml
                            )}
                        </div>`;
                      const buttonLabel =
                          pairChanges.length > 0
                              ? `View ${pairChanges.length} change${pairChanges.length !== 1 ? "s" : ""}`
                              : "View diff";
                      return renderDiffModalTrigger(buttonLabel, bodyHtml);
                  }
              )
            : '<p class="diff-empty-state">No registered config files were found.</p>';

    return `<div class="diff-page">
    <section class="diff-section">
        <div class="diff-section-banner">
            Pipeline GitHub compares
        </div>
        ${pipelineHtml}
    </section>
    <section class="diff-section">
        <div class="diff-section-banner">
            Registered params JSON diffs
        </div>
        ${paramsHtml}
    </section>
    <section class="diff-section">
        <div class="diff-section-banner">
            Registered config diffs
        </div>
        ${configHtml}
    </section>
</div>`;
}

/* ─── Nested rendering ──────────────────────────────────────── */
function renderDandisets(runs) {
    const byDandiset = groupBy(runs, (r) => r.dandisetId);
    const dandisetIds = [...byDandiset.keys()].sort((a, b) => {
        if (_sortMode === "dandiset_id") {
            const dandisetCompare = String(a ?? "").localeCompare(String(b ?? ""));
            return _sortDirection === "asc" ? dandisetCompare : -dandisetCompare;
        }
        // Sort dandisets by most recent run (runs are already sorted newest-first)
        const aDate = byDandiset.get(a)[0]?.runDate ?? "";
        const bDate = byDandiset.get(b)[0]?.runDate ?? "";
        return bDate.localeCompare(aDate);
    });
    const autoExpand = dandisetIds.length === 1;
    return dandisetIds.map((id) => renderDandisetGroup(id, byDandiset.get(id), autoExpand)).join("");
}

// The stable data-group-key values a run belongs to, from dandiset down to
// session. Shared by the renderers, badge refresh, and lazy body rendering.
function runGroupKeys(run) {
    return [
        `d:${run.dandisetId}`,
        `s:${run.dandisetId}/${run.subject}`,
        `e:${run.dandisetId}/${run.subject}/${run.session ?? ""}`,
    ];
}

// Group bodies render lazily: a collapsed group contributes only its summary
// row (label, counts, status badges) to the DOM, and its body — ultimately the
// full run cards — is built on first open (see renderLazyGroupBody). This
// keeps page memory proportional to what the user has expanded rather than to
// the total queue size. _openGroupKeys mirrors which groups are open so full
// re-renders (sort/layout toggles, filter-membership flushes) rebuild the same
// expansion state.
function groupIsOpen(key, autoExpand) {
    if (autoExpand) _openGroupKeys.add(key);
    return autoExpand || _openGroupKeys.has(key);
}

function renderDandisetGroupBody(runs, autoExpand = false) {
    const dandisetId = runs[0]?.dandisetId;
    const bySubject = groupBy(runs, (r) => r.subject);
    const subjects = [...bySubject.keys()].sort();
    const autoExpandSubject = autoExpand && subjects.length === 1;
    return subjects.map((s) => renderSubjectGroup(dandisetId, s, bySubject.get(s), autoExpandSubject)).join("");
}

function renderDandisetGroup(dandisetId, runs, autoExpand = false) {
    const bySubject = groupBy(runs, (r) => r.subject);
    const subjects = [...bySubject.keys()].sort();
    const key = `d:${dandisetId}`;
    const open = groupIsOpen(key, autoExpand);
    const subjectHtml = open ? renderDandisetGroupBody(runs, autoExpand) : "";

    return `
<details class="dandiset-group" data-group-key="d:${e(dandisetId)}"${open ? ' open data-body-rendered="1"' : ""}>
    <summary class="dandiset-summary">
        <span class="dandiset-summary-inner">
            <a class="dandiset-link" href="${e(neurosiftDandisetUrl(dandisetId))}"
               target="_blank" rel="noopener" onclick="event.stopPropagation()">${NEUROSIFT_ICON_HTML}Dandiset&nbsp;${e(dandisetId)}</a>
            <a class="dandi-view-link" href="${dandiBaseUrl(dandisetId)}/dandiset/${e(dandisetId)}"
               target="_blank" rel="noopener" onclick="event.stopPropagation()">${DANDI_ICON_HTML}Sourcedata&nbsp;↖</a>
            <span class="group-meta">
                <span class="group-count">${subjects.length}&nbsp;subject${subjects.length !== 1 ? "s" : ""}</span>
                <span class="run-sep">·</span>
                <span class="group-count">${runs.length}&nbsp;run${runs.length !== 1 ? "s" : ""}</span>
            </span>
            <span class="group-badges">${renderGroupBadges(runs)}</span>
            <a class="narrow-link" href="${narrowUrl({ dandiset: dandisetId })}"
               title="Narrow view to Dandiset ${e(dandisetId)}" onclick="event.stopPropagation()">⊕ Narrow</a>
        </span>
    </summary>
    <div class="dandiset-body" data-group-body>
        ${subjectHtml}
    </div>
</details>`;
}

function renderSubjectGroupBody(runs, autoExpand = false) {
    const dandisetId = runs[0]?.dandisetId;
    const subject = runs[0]?.subject;
    const bySession = groupBy(runs, (r) => r.session);
    // Sort sessions; null (no session) sorts last
    const sessions = [...bySession.keys()].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return String(a).localeCompare(String(b));
    });
    const autoExpandSession = autoExpand && sessions.length === 1;
    return sessions
        .map((ses) => renderSessionGroup(dandisetId, subject, ses, bySession.get(ses), autoExpandSession))
        .join("");
}

function renderSubjectGroup(dandisetId, subject, runs, autoExpand = false) {
    // Whether the subject lives under sourcedata/ (derived from each run's dandi_path).
    const inSourcedata = runs.some((r) => r.inSourcedata);
    const location = inSourcedata ? `sourcedata/sub-${subject}` : `sub-${subject}`;
    const subjectUrl = `${dandiBaseUrl(dandisetId)}/dandiset/${e(dandisetId)}/draft/files?location=${e(location)}`;

    const bySession = groupBy(runs, (r) => r.session);
    const sessions = [...bySession.keys()];
    const key = `s:${dandisetId}/${subject}`;
    const open = groupIsOpen(key, autoExpand);
    const sessionHtml = open ? renderSubjectGroupBody(runs, autoExpand) : "";

    return `
<details class="subject-group" data-group-key="s:${e(dandisetId)}/${e(subject)}"${open ? ' open data-body-rendered="1"' : ""}>
    <summary class="subject-summary">
        <span class="group-summary-inner">
            <a class="group-link" href="${e(subjectUrl)}" target="_blank" rel="noopener"
               onclick="event.stopPropagation()">${DANDI_ICON_HTML}Sub:&nbsp;<strong>${e(subject)}</strong></a>
            <span class="group-meta">
                <span class="group-count">${sessions.length}&nbsp;session${sessions.length !== 1 ? "s" : ""}</span>
            </span>
            <span class="group-badges">${renderGroupBadges(runs)}</span>
            <a class="narrow-link" href="${narrowUrl({ dandiset: dandisetId, subject })}"
               title="Narrow view to Sub: ${e(subject)}" onclick="event.stopPropagation()">⊕ Narrow</a>
        </span>
    </summary>
    <div class="subject-body" data-group-body>
        ${sessionHtml}
    </div>
</details>`;
}

function renderSessionGroupBody(runs) {
    return runs.map(renderRunEntry).join("");
}

function renderSessionGroup(dandisetId, subject, session, runs, autoExpand = false) {
    const rep = runs.find((r) => r.contentHash) ?? runs[0];
    const sessionLabel = session !== null ? session : "—";
    const sessionHref = neurosiftSessionUrl(dandisetId, rep.contentHash);
    const sessionLinkHtml = sessionHref
        ? `<a class="group-link" href="${e(sessionHref)}"
              target="_blank" rel="noopener" onclick="event.stopPropagation()">${NEUROSIFT_ICON_HTML}Ses:&nbsp;<strong>${e(sessionLabel)}</strong></a>`
        : `<span class="group-label">Ses:&nbsp;<strong>${e(sessionLabel)}</strong></span>`;

    const key = `e:${dandisetId}/${subject}/${session ?? ""}`;
    const open = groupIsOpen(key, autoExpand);
    const runsHtml = open ? renderSessionGroupBody(runs) : "";

    return `
<details class="session-group" data-group-key="e:${e(dandisetId)}/${e(subject)}/${e(session ?? "")}"${open ? ' open data-body-rendered="1"' : ""}>
    <summary class="session-summary">
        <span class="group-summary-inner">
            ${sessionLinkHtml}
            <span class="group-meta">
                <span class="group-count">${runs.length}&nbsp;job${runs.length !== 1 ? "s" : ""}</span>
            </span>
            <span class="group-badges">${renderGroupBadges(runs)}</span>
            <a class="narrow-link" href="${narrowUrl({ dandiset: dandisetId, subject, session })}"
               title="Narrow view to Ses: ${e(session)}" onclick="event.stopPropagation()">⊕ Narrow</a>
        </span>
    </summary>
    <div class="session-body" data-group-body>
        ${runsHtml}
    </div>
</details>`;
}

function renderPipelineVersionGroup(dandisetId, subject, session, pipelineName, pipelineVersion, runs) {
    const byParams = groupBy(runs, (r) => `${r.paramsProfile}\x00${r.configHash}`);
    const paramKeys = [...byParams.keys()].sort();
    const paramsHtml = paramKeys
        .map((key) => {
            const sep = key.indexOf("\x00");
            const paramsProfile = key.slice(0, sep);
            const configHash = key.slice(sep + 1);
            return renderParamsGroup(paramsProfile, configHash, byParams.get(key));
        })
        .join("");

    return `
<details class="pipeline-version-group" data-group-key="v:${e(dandisetId)}/${e(subject)}/${e(session ?? "")}/${e(pipelineVersion)}">
    <summary class="pipeline-version-summary">
        <span class="group-summary-inner">
            <span class="group-pipeline">${renderPipelineInfo(pipelineName, pipelineVersion)}</span>
            <span class="group-meta">
                <span class="group-count">${paramKeys.length}&nbsp;configuration${paramKeys.length !== 1 ? "s" : ""}</span>
            </span>
            <span class="group-badges">${renderGroupBadges(runs)}</span>
            <a class="narrow-link" href="${e(narrowUrl({ dandiset: dandisetId, subject, session, pipelineVersion }))}"
               title="Narrow view to version: ${e(pipelineVersion)}" onclick="event.stopPropagation()">⊕ Narrow</a>
        </span>
    </summary>
    <div class="pipeline-version-body">
        ${paramsHtml}
    </div>
</details>`;
}

function renderParamsGroup(paramsProfile, configHash, runs) {
    const runsHtml = runs.map(renderRunEntry).join("");
    const paramsLabel = renderRegistryLink("Params", paramsProfile, PARAMS_REGISTRY, "params");
    const configLabel = configHash
        ? `&nbsp;·&nbsp;${renderRegistryLink("Config", configHash, CONFIG_REGISTRY, "configs")}`
        : "";

    return `
<details class="params-group" data-group-key="p:${e(paramsProfile ?? "")}/${e(configHash ?? "")}">
    <summary class="params-summary">
        <span class="group-summary-inner">
            <span class="group-label">${paramsLabel}${configLabel}</span>
            <span class="group-meta">
                <span class="group-count">${runs.length}&nbsp;run${runs.length !== 1 ? "s" : ""}</span>
            </span>
            <span class="group-badges">${renderGroupBadges(runs)}</span>
        </span>
    </summary>
    <div class="params-body">
        ${runsHtml}
    </div>
</details>`;
}

/* ─── Flat view rendering ───────────────────────────────────── */
function renderFlatRunEntry(run) {
    const stalled = isStalled(run);
    const sc =
        run.status === "success"
            ? "status-success"
            : run.status === "failed"
              ? "status-failed"
              : stalled
                ? "status-stalled"
                : run.status === "running"
                  ? "status-running"
                  : run.status === "queued"
                    ? "status-queued"
                    : "status-unknown";
    const slbl =
        run.status === "success"
            ? "✓ Success"
            : run.status === "failed"
              ? "✗ Failed"
              : stalled
                ? "⚠ Stalled"
                : run.status === "running"
                  ? "▶ Running"
                  : run.status === "queued"
                    ? "⧗ Queued"
                    : "? Unknown";

    const { inlineLogs, buttonLogs } = splitRunLogFiles(run);
    const hasLogs = buttonLogs.length > 0;
    const hasInline = inlineLogs.length > 0;
    const hasTasks = run.tasks && run.tasks.length > 0;
    const hasSourceVersions = run.generatedBy && run.generatedBy.length > 0;
    const hasViz = (run.vizData && run.vizData.length > 0) || (run.vizLinks && Object.keys(run.vizLinks).length > 0);
    const bytes = runByteCount(run);
    const bytesHtml =
        bytes === null
            ? ""
            : `<span class="run-sep">·</span><span class="run-bytes">Asset size:&nbsp;${formatByteCount(bytes)}</span>`;

    const dandiPath = String(run.dandiPath ?? "").trim();
    const dandiPathParts = String(dandiPath).split("/").filter(Boolean);
    const terminalPart = dandiPathParts[dandiPathParts.length - 1] ?? "";
    const dandiDirectoryParts = terminalPart.toLowerCase().endsWith(".nwb")
        ? dandiPathParts.slice(0, -1)
        : dandiPathParts;
    const dandiDirectory = dandiDirectoryParts.join("/");
    const fallbackLocation = run.inSourcedata ? `sourcedata/sub-${run.subject}` : `sub-${run.subject}`;
    const location = dandiDirectory ? `${dandiDirectory}/` : fallbackLocation;
    const dandiPathLabel = dandiPath || location;
    const dandiPathUrl = `${dandiBaseUrl(run.dandisetId)}/dandiset/${e(run.dandisetId)}/draft/files?location=${encodeURIComponent(location)}`;

    return `
<div class="run-entry flat-run-entry ${sc}" data-run-key="${e(run.path)}">
    <div class="run-entry-header flat-run-header">
        <a class="dandi-view-link" href="${dandiBaseUrl(run.dandisetId)}/dandiset/${e(run.dandisetId)}" target="_blank" rel="noopener">${DANDI_ICON_HTML}Sourcedata&nbsp;↖</a>
        <span class="status-badge ${sc}${run.statusProvisional ? " status-provisional" : ""}"${run.statusProvisional ? ' title="Pass/fail pending trace confirmation"' : ""}>${slbl}</span>
        <span class="flat-run-context">
            <a class="flat-ctx-link" href="${e(neurosiftDandisetUrl(run.dandisetId))}" target="_blank" rel="noopener">${NEUROSIFT_ICON_HTML}Dandiset&nbsp;${e(run.dandisetId)}</a>
            <span class="run-sep">·</span>
            <a class="flat-ctx-link flat-ctx-path" href="${e(dandiPathUrl)}" target="_blank" rel="noopener">${DANDI_ICON_HTML}Path:&nbsp;<strong>${e(dandiPathLabel)}</strong></a>
            ${run.runDate ? `<span class="flat-ctx-break"></span><span class="flat-ctx-text flat-ctx-date">${e(run.runDate)}</span>` : ""}
            <span class="run-sep">·</span>
            <span class="flat-ctx-text">${renderRegistryLink("Params", run.paramsProfile, PARAMS_REGISTRY, "params")}</span>
            ${run.configHash ? `<span class="run-sep">·</span><span class="flat-ctx-text">${renderRegistryLink("Config", run.configHash, CONFIG_REGISTRY, "configs")}</span>` : ""}
        </span>
        ${bytesHtml}
        <span class="run-attempt">${runIdentityLabel(run)}</span>
        <a class="run-entry-derivatives-link" href="${e(derivativesUrl(run.path))}" target="_blank" rel="noopener">↗ Derivatives${DANDI_ICON_HTML}</a>
        ${renderCurationLink(run)}
    </div>

    ${hasSourceVersions ? renderSourceVersionsSection(run.generatedBy) : ""}
    ${run.datasetDescription ? renderProvenanceSection(run.datasetDescription) : !run.detailsLoaded && run.datasetDescriptionPath ? renderSectionPlaceholder("provenance", "Provenance") : ""}
    ${hasTasks ? renderTraceSection(run.tasks) : ""}
    ${hasViz ? renderVisualizationSection(run.vizData, run.vizLinks) : ""}
    ${run.qualityControl ? renderQualityControlSection(run.qualityControl) : !run.qcLoaded && runHasQualityControl(run) ? renderSectionPlaceholder("qc", "Quality Control") : ""}
    ${hasLogs ? renderLogSection(run, buttonLogs) : ""}
    ${hasInline ? renderReportSection(run, inlineLogs) : ""}
</div>`;
}

// Flat layout materializes cards in chunks: the DOM (and its memory) grows via
// the "Show more" button rather than scaling with the whole queue up front.
function renderFlatList(runs) {
    const sorted = sortRuns(runs);
    const visible = sorted.slice(0, _flatRenderLimit);
    const hidden = sorted.length - visible.length;
    const moreHtml =
        hidden > 0
            ? `<button class="layout-btn flat-show-more" type="button" data-flat-more>
        Show ${Math.min(hidden, FLAT_RENDER_CHUNK)} more (${hidden} not shown)
    </button>`
            : "";
    return `<div class="flat-list">${visible.map(renderFlatRunEntry).join("")}</div>${moreHtml}`;
}

function initFlatShowMore() {
    const runsEl = document.getElementById("runs");
    if (!runsEl || runsEl.dataset.flatMoreInit) return;
    runsEl.dataset.flatMoreInit = "1";
    runsEl.addEventListener("click", (evt) => {
        if (!evt.target.closest("[data-flat-more]")) return;
        _flatRenderLimit += FLAT_RENDER_CHUNK;
        rerenderRuns();
    });
}

/* ─── Layout toggle ─────────────────────────────────────────── */
function renderLayoutBar() {
    const isFlat = _layoutMode === "flat";
    const isAscending = _sortDirection === "asc";
    return `<div class="layout-bar">
    <div class="layout-bar-group">
        <span class="layout-bar-label">View:</span>
        <button class="layout-btn${!isFlat ? " layout-btn-active" : ""}" data-layout="tree" aria-pressed="${!isFlat}">Tree</button>
        <button class="layout-btn${isFlat ? " layout-btn-active" : ""}" data-layout="flat" aria-pressed="${isFlat}">Flat</button>
    </div>
    <div class="layout-bar-group layout-bar-group-sort">
        <label class="layout-sort-wrap">
            <span class="layout-bar-label">Sort by:</span>
            <select class="layout-sort-select" data-sort-mode aria-label="Sort runs">
                <option value="attempt"${_sortMode === "attempt" ? " selected" : ""}>Attempt</option>
                <option value="created_at"${_sortMode === "created_at" ? " selected" : ""}>Created</option>
                <option value="dandiset_id"${_sortMode === "dandiset_id" ? " selected" : ""}>Dandiset ID</option>
            </select>
        </label>
        <button
            class="layout-btn layout-sort-direction-btn"
            type="button"
            data-sort-direction
            aria-label="${isAscending ? "Sort ascending" : "Sort descending"}"
            aria-pressed="${isAscending}"
            title="${isAscending ? "Sort ascending" : "Sort descending"}"
        >${isAscending ? "↑" : "↓"}</button>
    </div>
    <button
        class="layout-btn layout-btn-refresh"
        type="button"
        data-refresh-queue
        aria-label="Refresh queue state"
        title="Clear cache and reload queue state"
    >↺ Refresh</button>
</div>`;
}

function rerenderRuns() {
    const sortedRuns = sortRuns(_filteredRuns);
    document.getElementById("runs").innerHTML =
        _layoutMode === "flat" ? renderFlatList(sortedRuns) : renderDandisets(sortedRuns);
    initInlineHtmlFrames();
}

function initLayoutToggle() {
    const bar = document.getElementById("layout-bar");
    if (!bar) return;
    // Always sync the bar HTML with the current layout/sort state (e.g. after a data reload).
    bar.innerHTML = renderLayoutBar();
    // Attach event listeners only once per element; subsequent calls only need the HTML update above.
    if (bar.dataset.initialized) return;
    bar.dataset.initialized = "1";
    bar.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-layout]");
        if (btn) {
            const mode = btn.dataset.layout;
            if (mode === _layoutMode) return;
            _layoutMode = mode;
            localStorage.setItem("layoutMode", mode);
            updateLayoutModeUrl(mode);
            bar.innerHTML = renderLayoutBar();
            rerenderRuns();
            return;
        }
        const directionBtn = ev.target.closest("[data-sort-direction]");
        if (directionBtn) {
            _sortDirection = _sortDirection === "desc" ? "asc" : "desc";
            localStorage.setItem("sortDirection", _sortDirection);
            updateSortDirectionUrl(_sortDirection);
            bar.innerHTML = renderLayoutBar();
            rerenderRuns();
            return;
        }
        const refreshBtn = ev.target.closest("[data-refresh-queue]");
        if (!refreshBtn) return;
        // Only the queue/archive state caches are cleared: per-run S3 blobs are
        // content-addressed (immutable), so new results always arrive as new
        // blob URLs in the freshly fetched state.
        clearQueueStateCache();
        loadQueueData();
    });
    bar.addEventListener("change", (ev) => {
        const select = ev.target.closest("[data-sort-mode]");
        if (!select) return;
        const mode = select.value;
        if (mode === _sortMode) return;
        _sortMode = mode;
        localStorage.setItem("sortMode", mode);
        updateSortModeUrl(mode);
        bar.innerHTML = renderLayoutBar();
        rerenderRuns();
    });
}
/* ─── Log modal ─────────────────────────────────────────────── */
let _modalGeneration = 0;

/* ─── Inline "Open" object URLs ─────────────────────────────────
   S3 blob objects are content-addressed and extension-less, so linking the
   "↗ Open" button directly at the blob URL makes the browser download the file
   instead of rendering it. Instead we wrap the already-fetched bytes in a Blob
   with an explicit MIME type and point "Open" at the resulting object URL, which
   opens inline in a new tab. Tracked URLs are revoked when the next modal opens
   (an already-opened tab keeps its loaded copy).                              */
let _modalObjectUrls = [];

function makeObjectUrl(parts, type) {
    try {
        const blob = new Blob(parts, type ? { type } : undefined);
        const objUrl = URL.createObjectURL(blob);
        _modalObjectUrls.push(objUrl);
        return objUrl;
    } catch {
        return null;
    }
}

function revokeModalObjectUrls() {
    for (const objUrl of _modalObjectUrls) {
        try {
            URL.revokeObjectURL(objUrl);
        } catch {
            /* already revoked or unsupported */
        }
    }
    _modalObjectUrls = [];
}

// Build a tiny self-contained HTML document that embeds an image by URL, and
// return it as an object URL. Opening this in a new tab renders the image inline
// (an <img> element displays a resource regardless of its content-disposition,
// unlike a top-level navigation to the raw blob, which S3 serves as a download).
// No fetch of the image bytes is required, so this works even without CORS.
function makeImageViewerObjectUrl(url, label) {
    const safeUrl = e(url);
    const safeLabel = e(label || "Image");
    const viewerHtml =
        `<!doctype html><html><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${safeLabel}</title></head>` +
        `<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh">` +
        `<img src="${safeUrl}" alt="${e(label || "")}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`;
    return makeObjectUrl([viewerHtml], "text/html");
}

function initModal() {
    document.getElementById("log-modal-close").addEventListener("click", closeLogModal);
    document.getElementById("log-modal").addEventListener("click", (evt) => {
        if (evt.target === document.getElementById("log-modal")) closeLogModal();
    });
    document.addEventListener("keydown", (evt) => {
        if (evt.key === "Escape" && !document.getElementById("log-modal").hidden) closeLogModal();
    });

    document.getElementById("runs").addEventListener("click", (evt) => {
        const btn = evt.target.closest(".log-link");
        if (!btn) return;
        openLogModal(
            btn.dataset.logUrl,
            btn.dataset.logLabel,
            btn.dataset.logHtml === "true",
            btn.dataset.logExternal,
            btn.dataset.logTable === "true"
        );
    });

    const runsEl = document.getElementById("runs");
    if (runsEl) {
        runsEl.addEventListener("click", (evt) => {
            const diffTrigger = evt.target.closest(".diff-cell-trigger");
            if (diffTrigger) {
                evt.preventDefault();
                openHtmlModal(
                    diffTrigger.dataset.modalTitle,
                    diffTrigger.dataset.modalHtml,
                    diffTrigger.dataset.modalExternal || null,
                    diffTrigger.dataset.modalExternalLabel || "↗ Open"
                );
                return;
            }
            const link = evt.target.closest(".viz-link");
            if (!link) return;
            evt.preventDefault();
            openVizModal(link.dataset.vizUrl, link.dataset.vizLabel);
        });
    }
}

function setModalExternalLink(externalHref, externalLabel = "↗ Open") {
    const extLink = document.getElementById("log-modal-external");
    extLink.textContent = externalLabel;
    if (externalHref) {
        extLink.href = externalHref;
        extLink.hidden = false;
    } else {
        extLink.hidden = true;
        extLink.removeAttribute("href");
    }
}

function setModalTitle(title) {
    const modalBox = document.querySelector("#log-modal .log-modal-box");
    const titleEl = document.getElementById("log-modal-title");
    titleEl.textContent = title ?? "";
    titleEl.hidden = !title;
    if (title) {
        modalBox?.setAttribute("aria-labelledby", "log-modal-title");
        modalBox?.removeAttribute("aria-label");
    } else {
        modalBox?.removeAttribute("aria-labelledby");
        modalBox?.setAttribute("aria-label", "Details");
    }
}

function openLogModal(fileUrl, label, isHtml, externalHref, asTable) {
    const overlay = document.getElementById("log-modal");
    const bodyEl = document.getElementById("log-modal-body");

    const generation = ++_modalGeneration;
    revokeModalObjectUrls();

    setModalTitle(label);
    // Hide "Open" until the content is loaded; we then point it at an inline
    // object URL so the browser renders the file instead of downloading it.
    setModalExternalLink(null);
    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    bodyEl.innerHTML = `<div class="log-modal-loading"><div class="spinner"></div> Loading…</div>`;
    fetchLogText(fileUrl).then((content) => {
        if (_modalGeneration !== generation) return;
        if (content === null) {
            // Fall back to the raw URL so the user can still try to retrieve it.
            setModalExternalLink(externalHref);
            bodyEl.innerHTML = `<p class="log-modal-error">Failed to load log file.</p>`;
            return;
        }
        setModalExternalLink(makeObjectUrl([content], isHtml ? "text/html" : "text/plain") ?? externalHref);
        bodyEl.innerHTML = "";
        if (isHtml) {
            // Use srcdoc so the report renders inline regardless of the source
            // host's framing headers.
            const iframe = document.createElement("iframe");
            iframe.className = "log-modal-iframe";
            iframe.setAttribute("sandbox", "allow-scripts");
            iframe.setAttribute("title", label);
            iframe.srcdoc = content;
            bodyEl.appendChild(iframe);
        } else if (asTable) {
            // Render tab-separated content (e.g. Nextflow trace.txt) as a table,
            // falling back to plain text if it doesn't parse into rows.
            const tableHtml = tsvToTableHtml(content);
            if (tableHtml) {
                bodyEl.innerHTML = tableHtml;
            } else {
                const pre = document.createElement("pre");
                pre.className = "log-modal-text";
                pre.textContent = content;
                bodyEl.appendChild(pre);
            }
        } else {
            const pre = document.createElement("pre");
            pre.className = "log-modal-text";
            pre.textContent = content;
            bodyEl.appendChild(pre);
        }
    });
}

// Convert tab-separated text into a themed table. Returns null when there isn't
// at least a header plus one data row.
function tsvToTableHtml(text) {
    const rows = String(text)
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => line.split("\t"));
    if (rows.length < 2) return null;
    const [header, ...body] = rows;
    const thead = `<thead><tr>${header.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${body
        .map((cells) => `<tr>${cells.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
    return `<div class="log-modal-table-wrap"><table class="trace-table log-modal-table">${thead}${tbody}</table></div>`;
}

function closeLogModal() {
    _modalGeneration++;
    const overlay = document.getElementById("log-modal");
    overlay.hidden = true;
    document.body.style.overflow = "";
    document.getElementById("log-modal-body").innerHTML = "";
}

function openHtmlModal(title, html, externalHref = null, externalLabel = "↗ Open") {
    const overlay = document.getElementById("log-modal");
    const bodyEl = document.getElementById("log-modal-body");

    _modalGeneration++;
    revokeModalObjectUrls();

    setModalTitle(title);
    setModalExternalLink(externalHref, externalLabel);
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    bodyEl.innerHTML = html;
}

function openVizModal(url, label) {
    const overlay = document.getElementById("log-modal");
    const bodyEl = document.getElementById("log-modal-body");

    _modalGeneration++;
    revokeModalObjectUrls();

    setModalTitle(label);
    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    // The image itself loads from the direct S3 URL: <img> renders a resource
    // inline regardless of its content-disposition.
    bodyEl.innerHTML = "";
    const img = document.createElement("img");
    img.className = "viz-modal-img";
    img.src = url;
    img.alt = label;
    bodyEl.appendChild(img);

    // "Open" points at a self-contained HTML viewer (not the raw blob), so the
    // new tab renders the image inline instead of downloading it.
    setModalExternalLink(makeImageViewerObjectUrl(url, label) ?? url);
}

async function fetchLogText(fileUrl) {
    if (!fileUrl) return null;
    try {
        const resp = await cachedFetch(fileUrl);
        if (!resp.ok) return null;
        return resp.text();
    } catch {
        return null;
    }
}

// Every inline-report iframe ever registered for height messages. A single
// module-level "message" listener sizes whichever registered frame reported;
// frames that have left the DOM (e.g. replaced by a hydration update) are
// pruned as messages arrive. One shared listener (instead of one per
// invocation) keeps per-card hydration updates from accumulating listeners.
const _inlineFrameSet = new Set();
let _inlineFrameListenerInstalled = false;

// _framePatchedContent holds the fully-patched HTML for each iframe, populated
// asynchronously; _frameInjected tracks which iframes already had their srcdoc
// set; _frameFetching dedups in-flight content fetches. Report HTML is fetched
// AND injected lazily — only once the iframe is no longer inside a closed
// <details>. Fetch-on-reveal matters as much as inject-on-reveal: Nextflow
// report/timeline files run to megabytes each, so eagerly fetching them for
// every run both floods the S3 connection pool (starving the trace/status
// hydration passes) and pins the whole queue's report HTML in memory at once —
// enough to OOM the tab on large queues. Injection additionally waits for
// visibility so chart libraries (e.g. Highcharts in timeline.html) render in a
// non-zero container and avoid invalid negative <rect> widths. Module-level
// (weak, so replaced cards' frames drop out) because toggle listeners and
// content fetches can come from different initInlineHtmlFrames invocations.
const _framePatchedContent = new WeakMap();
const _frameInjected = new WeakSet();
const _frameFetching = new WeakSet();

function maybeInjectFrame(iframe) {
    if (_frameInjected.has(iframe)) return;
    if (!_framePatchedContent.has(iframe)) return; // content not yet fetched
    if (iframe.closest("details:not([open])")) return; // still inside a closed <details>
    _frameInjected.add(iframe);
    iframe.srcdoc = _framePatchedContent.get(iframe);
}

// The injected script reports scrollHeight on load AND responds to a
// 'requestHeight' message from the parent. The parent re-requests when a
// collapsed <details> is opened, because the iframe layout is zero-height
// while the section is hidden. Sandboxed srcdoc iframes have opaque origin so
// evt.origin === 'null'; we also verify evt.source is one of our known iframe
// windows as an additional guard.
const INLINE_FRAME_HEIGHT_SCRIPT = `<script>
(function(){
function send(){window.parent.postMessage({type:'iframeHeight',h:document.documentElement.scrollHeight},'*');}
if(document.readyState==='complete'){send();}else{window.addEventListener('load',send);}
window.addEventListener('message',function(e){if(e.source===window.parent&&e.data&&e.data.type==='requestHeight')send();});
})();
</script>`;

// Injected into <head> for most reports: nudge the browser's default
// color-scheme to light so any unset colors pick up readable dark-on-white
// defaults. timeline.html (Nextflow-generated) has an *explicit* dark navy
// background in its own CSS, so color-scheme alone cannot help — override
// background + text explicitly for it.
const INLINE_FRAME_LIGHT_STYLE = "<style>html{color-scheme:light;}</style>";
const INLINE_FRAME_TIMELINE_LIGHT_STYLE =
    "<style>html,body{background:#ffffff!important;color:#333333!important;color-scheme:light;}</style>";

// Fetch, patch, and (once visible) inject one report iframe's content. Safe to
// call repeatedly — in-flight and already-fetched frames are no-ops.
async function ensureFrameContent(iframe) {
    if (_frameInjected.has(iframe) || _frameFetching.has(iframe)) return;
    if (_framePatchedContent.has(iframe)) return maybeInjectFrame(iframe);
    _frameFetching.add(iframe);
    try {
        const content = await fetchLogText(iframe.dataset.srcdocUrl);
        const html =
            content !== null
                ? content
                : '<body style="font-family:sans-serif;padding:20px;color:#e05c5c">Failed to load report.</body>';
        // Insert the light-mode override and height-reporter into the document.
        // Prefer inserting the style in <head> and the script before </body>.
        const isTimeline = iframe.dataset.srcdocName === "timeline.html";
        const styleToInject = isTimeline ? INLINE_FRAME_TIMELINE_LIGHT_STYLE : INLINE_FRAME_LIGHT_STYLE;
        const lcHtml = html.toLowerCase();
        const headClose = lcHtml.indexOf("</head>");
        const bodyClose = lcHtml.lastIndexOf("</body>");
        let patched =
            headClose !== -1 ? html.slice(0, headClose) + styleToInject + html.slice(headClose) : styleToInject + html;
        // styleToInject was inserted at or before bodyClose, so adjust the position by its length.
        const adjustedBodyClose = bodyClose !== -1 ? bodyClose + styleToInject.length : -1;
        patched =
            adjustedBodyClose !== -1
                ? patched.slice(0, adjustedBodyClose) + INLINE_FRAME_HEIGHT_SCRIPT + patched.slice(adjustedBodyClose)
                : patched + INLINE_FRAME_HEIGHT_SCRIPT;
        _framePatchedContent.set(iframe, patched);
    } finally {
        _frameFetching.delete(iframe);
    }
    maybeInjectFrame(iframe);
}

function ensureInlineFrameListener() {
    if (_inlineFrameListenerInstalled) return;
    _inlineFrameListenerInstalled = true;
    window.addEventListener("message", (evt) => {
        if (typeof evt.origin !== "string" || (evt.origin !== "null" && evt.origin !== window.location.origin)) return;
        if (!evt.data || evt.data.type !== "iframeHeight") return;
        for (const iframe of _inlineFrameSet) {
            if (!iframe.isConnected) {
                _inlineFrameSet.delete(iframe);
                continue;
            }
            if (iframe.contentWindow === evt.source && evt.data.h > 0) {
                iframe.style.height = evt.data.h + "px";
            }
        }
    });
}

/* Wire lazy fetch-and-inject for inline report iframes under `root` — the
   whole document by default, or a single replaced run card during hydration.
   Content is only fetched once an iframe is revealed (no closed <details>
   ancestor), either immediately below or via the toggle listeners. */
function initInlineHtmlFrames(root = document) {
    // Sweep frames whose cards left the DOM (hydration replacements) so the
    // strong references here don't pin detached card trees in memory.
    for (const iframe of _inlineFrameSet) {
        if (!iframe.isConnected) _inlineFrameSet.delete(iframe);
    }
    const frames = Array.from(root.querySelectorAll("iframe[data-srcdoc-url]"));
    for (const iframe of frames) _inlineFrameSet.add(iframe);
    ensureInlineFrameListener();

    // When a <details> containing inline frames is opened, fetch/inject any
    // frames it reveals and request a fresh height measurement from frames
    // that are already loaded. State lives at module level (see
    // _framePatchedContent) so listeners attached by one invocation (e.g. a
    // group opener from the initial render) also serve iframes registered by a
    // later one (e.g. a run card replaced during hydration).
    root.querySelectorAll("details").forEach((details) => {
        if (details.dataset.framesWired) return;
        if (!details.querySelector("iframe[data-srcdoc-url]")) return;
        details.dataset.framesWired = "1";
        details.addEventListener("toggle", () => {
            if (!details.open) return;
            requestAnimationFrame(() => {
                details.querySelectorAll("iframe[data-srcdoc-url]").forEach((iframe) => {
                    if (_frameInjected.has(iframe)) {
                        if (iframe.contentWindow) {
                            // '*' is required: sandboxed srcdoc iframes have opaque ('null') origin,
                            // which is not a valid targetOrigin — only '*' reaches them.
                            // The message contains no sensitive data ({type:'requestHeight'} only).
                            iframe.contentWindow.postMessage({ type: "requestHeight" }, "*");
                        }
                    } else if (!iframe.closest("details:not([open])")) {
                        // Fetch only frames this open actually revealed — a
                        // group opening must not pull reports for cards whose
                        // Reports section is itself still closed.
                        ensureFrameContent(iframe);
                    }
                });
            });
        });
    });

    // Fetch content now only for frames that are already revealed (e.g. a
    // hydration update replaced a card whose Reports section was open).
    for (const iframe of frames) {
        if (!iframe.closest("details:not([open])")) ensureFrameContent(iframe);
    }
}

/* ─── Params Editor ─────────────────────────────────────────── */

/* Module-level params editor state */
let _paramsSchema = null;
let _paramsCurrentValues = null;
let _paramsDefaultValues = null;

/* Desired display order for top-level schema sections.
   Sections not listed here appear after, in schema order. */
const PARAMS_SECTION_ORDER = [
    "job_dispatch",
    "preprocessing",
    "spikesorting",
    "postprocessing",
    "curation",
    "visualization",
    "nwb",
];

/* Strip trailing commas from JSON-like text so files authored with them
   (e.g. default_params.json from the pipeline repo) can be parsed. */
function stripTrailingCommas(text) {
    return text.replace(/,\s*([}\]])/g, "$1");
}

function paramsResolveRef(node) {
    if (!node || typeof node !== "object") return node;
    if (node.$ref) {
        const parts = node.$ref.replace(/^#\//, "").split("/");
        let resolved = _paramsSchema;
        for (const p of parts) resolved = resolved[p];
        const { $ref: _, ...rest } = node;
        return { ...paramsResolveRef(resolved), ...rest };
    }
    return node;
}

function paramsBuildDefaults(schemaNode) {
    const node = paramsResolveRef(schemaNode);
    if (!node) return undefined;
    if (node.type === "object" && node.properties) {
        const obj = {};
        for (const [k, v] of Object.entries(node.properties)) {
            const val = paramsBuildDefaults(v);
            if (val !== undefined) obj[k] = val;
        }
        return Object.keys(obj).length ? obj : {};
    }
    if ("default" in node) return JSON.parse(JSON.stringify(node.default));
    return undefined;
}

function paramsDeepGet(obj, path) {
    let cur = obj;
    for (const p of path) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = cur[p];
    }
    return cur;
}

function paramsDeepSet(obj, path, value) {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in cur) || typeof cur[path[i]] !== "object") cur[path[i]] = {};
        cur = cur[path[i]];
    }
    cur[path[path.length - 1]] = value;
}

function paramsGetTypeDefault(type) {
    if (type === "string") return "";
    if (type === "number" || type === "integer") return 0;
    if (type === "boolean") return false;
    if (type === "array") return [];
    if (type === "object") return {};
    return null;
}

function paramsEl(tag, attrs, ...children) {
    const elem = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "class") {
                elem.className = v;
            } else if (k.startsWith("on")) {
                elem.addEventListener(k.slice(2), v);
            } else if (v === true) {
                elem.setAttribute(k, "");
            } else if (v !== false && v !== null && v !== undefined) {
                elem.setAttribute(k, v);
            }
        }
    }
    for (const c of children) {
        if (c == null) continue;
        if (typeof c === "string") elem.appendChild(document.createTextNode(c));
        else elem.appendChild(c);
    }
    return elem;
}

function updateParamsPreview() {
    const output = document.getElementById("params-output");
    if (output) output.textContent = JSON.stringify(_paramsCurrentValues, null, 4);
}

function paramsMarkChanged(field, path) {
    const defVal = paramsDeepGet(_paramsDefaultValues, path);
    const curVal = paramsDeepGet(_paramsCurrentValues, path);
    field.classList.toggle("changed", JSON.stringify(curVal) !== JSON.stringify(defVal));
    updateParamsPreview();
}

function buildParamsField(label, schemaNode, path) {
    const node = paramsResolveRef(schemaNode);
    const curVal = paramsDeepGet(_paramsCurrentValues, path);
    const defVal = paramsDeepGet(_paramsDefaultValues, path);
    const isChanged = JSON.stringify(curVal) !== JSON.stringify(defVal);

    const field = paramsEl("div", { class: "params-field" + (isChanged ? " changed" : "") });
    field.dataset.path = path.join(".");

    const labelEl = paramsEl("div", { class: "params-field-label" }, label);
    if (node.description) {
        labelEl.appendChild(paramsEl("span", { class: "params-field-desc" }, node.description));
    }
    field.appendChild(labelEl);

    const inputWrap = paramsEl("div", { class: "params-field-input" });

    const nullable = Array.isArray(node.type) && node.type.includes("null");
    const types = Array.isArray(node.type) ? node.type.filter((t) => t !== "null") : [node.type];
    const primaryType = types[0] || "string";

    if (nullable) {
        const isNull = curVal === null || curVal === undefined;
        const toggle = paramsEl(
            "label",
            { class: "params-null-toggle" },
            paramsEl("input", {
                type: "checkbox",
                checked: isNull ? true : false,
                onchange: function () {
                    if (this.checked) {
                        paramsDeepSet(_paramsCurrentValues, path, null);
                    } else {
                        const fallback =
                            defVal !== null && defVal !== undefined ? defVal : paramsGetTypeDefault(primaryType);
                        paramsDeepSet(_paramsCurrentValues, path, JSON.parse(JSON.stringify(fallback)));
                    }
                    buildParamsForm();
                    updateParamsPreview();
                },
            }),
            "null"
        );
        inputWrap.appendChild(toggle);
        if (isNull) {
            field.appendChild(inputWrap);
            return field;
        }
    }

    if (node.enum) {
        const select = paramsEl("select", {
            onchange: function () {
                let v = this.value;
                if (v === "__null__") v = null;
                else if (primaryType === "number" || primaryType === "integer") v = Number(v);
                paramsDeepSet(_paramsCurrentValues, path, v);
                paramsMarkChanged(field, path);
            },
        });
        if (nullable) select.appendChild(paramsEl("option", { value: "__null__" }, "(null)"));
        for (const opt of node.enum) {
            if (opt === null) continue;
            const option = paramsEl("option", { value: String(opt) }, String(opt));
            if (String(curVal) === String(opt)) option.selected = true;
            select.appendChild(option);
        }
        inputWrap.appendChild(select);
    } else if (primaryType === "boolean") {
        const select = paramsEl("select", {
            onchange: function () {
                paramsDeepSet(_paramsCurrentValues, path, this.value === "true");
                paramsMarkChanged(field, path);
            },
        });
        [true, false].forEach((val) => {
            const opt = paramsEl("option", { value: String(val) }, String(val));
            if (curVal === val) opt.selected = true;
            select.appendChild(opt);
        });
        inputWrap.appendChild(select);
    } else if (primaryType === "array" || primaryType === "object") {
        const ta = document.createElement("textarea");
        ta.value = JSON.stringify(curVal ?? (primaryType === "array" ? [] : {}), null, 2);
        ta.addEventListener("input", function () {
            try {
                const parsed = JSON.parse(this.value);
                paramsDeepSet(_paramsCurrentValues, path, parsed);
                this.style.borderColor = "";
                paramsMarkChanged(field, path);
            } catch {
                this.style.borderColor = "var(--color-failed)";
            }
        });
        inputWrap.appendChild(ta);
    } else if (primaryType === "integer" || primaryType === "number") {
        const attrs = {
            type: "number",
            value: curVal != null ? String(curVal) : "",
            step: primaryType === "integer" ? "1" : "any",
            oninput: function () {
                const v = primaryType === "integer" ? parseInt(this.value, 10) : parseFloat(this.value);
                if (!isNaN(v)) {
                    paramsDeepSet(_paramsCurrentValues, path, v);
                    paramsMarkChanged(field, path);
                }
            },
        };
        if (node.minimum != null) attrs.min = String(node.minimum);
        if (node.maximum != null) attrs.max = String(node.maximum);
        inputWrap.appendChild(paramsEl("input", attrs));
    } else {
        inputWrap.appendChild(
            paramsEl("input", {
                type: "text",
                value: curVal != null ? String(curVal) : "",
                oninput: function () {
                    paramsDeepSet(_paramsCurrentValues, path, this.value);
                    paramsMarkChanged(field, path);
                },
            })
        );
    }

    field.appendChild(inputWrap);
    return field;
}

function buildParamsSection(label, schemaNode, path) {
    const node = paramsResolveRef(schemaNode);
    const wrapper = paramsEl("div", { class: "params-section collapsed" });

    const header = paramsEl(
        "div",
        { class: "params-section-header" },
        paramsEl("span", { class: "params-section-arrow" }, "▼"),
        document.createTextNode(label)
    );
    if (node.description) {
        header.appendChild(paramsEl("span", { class: "params-section-desc" }, node.description));
    }
    header.addEventListener("click", () => wrapper.classList.toggle("collapsed"));
    wrapper.appendChild(header);

    const body = paramsEl("div", { class: "params-section-body" });
    const nodeTypes = Array.isArray(node.type) ? node.type : [node.type];
    if (nodeTypes.includes("object") && node.properties) {
        for (const [k, v] of Object.entries(node.properties)) {
            const resolved = paramsResolveRef(v);
            const childPath = [...path, k];
            const resolvedTypes = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
            if (resolvedTypes.includes("object") && resolved.properties) {
                body.appendChild(buildParamsSection(k, resolved, childPath));
            } else {
                body.appendChild(buildParamsField(k, resolved, childPath));
            }
        }
    }
    wrapper.appendChild(body);
    return wrapper;
}

function buildParamsForm() {
    const formRoot = document.getElementById("params-form-root");
    if (!formRoot) return;
    formRoot.innerHTML = "";

    const schemaEntries = Object.entries(_paramsSchema.properties);
    const ordered = [
        ...PARAMS_SECTION_ORDER.filter((k) => _paramsSchema.properties[k]).map((k) => [k, _paramsSchema.properties[k]]),
        ...schemaEntries.filter(([k]) => !PARAMS_SECTION_ORDER.includes(k)),
    ];
    for (const [key, propSchema] of ordered) {
        const resolved = paramsResolveRef(propSchema);
        formRoot.appendChild(buildParamsSection(key, resolved, [key]));
    }

    const chk = document.getElementById("params-chk-only-changed");
    if (chk && chk.checked) {
        formRoot.querySelectorAll(".params-field").forEach((f) => {
            f.style.display = f.classList.contains("changed") ? "" : "none";
        });
    }
}

function renderParamsEditorShell() {
    const readmeUrl = "https://github.com/dandi-compute/dandi-compute-core#contributing-non-code-files";
    const codeRepoUrl = "https://github.com/dandi-compute/dandi-compute-core";
    const paramsDir = "src/dandi_compute_code/aind_ephys_pipeline/params/";
    const registryFile = "src/dandi_compute_code/aind_ephys_pipeline/registries/registered_params.json";

    return `<div class="params-editor">
    <div class="params-editor-split">
        <div class="params-editor-left">
            <div class="params-toolbar">
                <button class="params-toolbar-btn" id="params-btn-defaults">Restore</button>
                <button class="params-toolbar-btn" id="params-btn-collapse">Collapse All</button>
                <button class="params-toolbar-btn" id="params-btn-expand">Expand All</button>
                <label class="params-toolbar-toggle">
                    <input type="checkbox" id="params-chk-only-changed"> Show only changed
                </label>
            </div>
            <div id="params-form-root"></div>
        </div>
        <div class="params-editor-right">
            <div class="params-output-header">
                <span class="params-output-title">Generated JSON</span>
                <div class="params-toolbar">
                    <button class="params-toolbar-btn" id="params-btn-download">Download</button>
                    <button class="params-toolbar-btn" id="params-btn-copy">Copy</button>
                    <label class="params-toolbar-file-label">Import…<input type="file" id="params-file-import" accept=".json"></label>
                </div>
            </div>
            <pre id="params-output" class="params-output-pre"></pre>
        </div>
    </div>
    <div class="params-instructions">
        <div class="params-instructions-title">How to submit your params file</div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">2</span>
            <span>Customize your parameters using the form above, then click <strong>Download</strong> and rename the file to a short descriptive name (e.g.&nbsp;<code>my-params.json</code>).</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">1</span>
            <span>Login to GitHub (or <a href="https://github.com/join" target="_blank" rel="noopener">create a free account</a>).</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">3</span>
            <span>Open the <a href="${e(codeRepoUrl)}" target="_blank" rel="noopener">dandi-compute/dandi-compute-core</a> repository and click <strong>Fork</strong> to create your own copy.</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">4</span>
            <span>In your fork, upload your JSON file to <code>${e(paramsDir)}</code> and register it in <code>${e(registryFile)}</code> following the <a href="${e(readmeUrl)}" target="_blank" rel="noopener">contributing instructions in the README</a>.</span>
        </div>
        <div class="params-instructions-step">
            <span class="params-instructions-num">5</span>
            <span>Open a Pull Request from your fork back to <code>dandi-compute/dandi-compute-core</code>. A maintainer will review and merge your file.</span>
        </div>
    </div>
</div>`;
}

function initParamsEditorUI() {
    buildParamsForm();
    updateParamsPreview();

    document.getElementById("params-btn-defaults").addEventListener("click", () => {
        _paramsCurrentValues = JSON.parse(JSON.stringify(_paramsDefaultValues));
        buildParamsForm();
        updateParamsPreview();
    });

    document.getElementById("params-btn-collapse").addEventListener("click", () => {
        document
            .getElementById("params-form-root")
            .querySelectorAll(".params-section")
            .forEach((s) => s.classList.add("collapsed"));
    });

    document.getElementById("params-btn-expand").addEventListener("click", () => {
        document
            .getElementById("params-form-root")
            .querySelectorAll(".params-section")
            .forEach((s) => s.classList.remove("collapsed"));
    });

    document.getElementById("params-chk-only-changed").addEventListener("change", function () {
        document
            .getElementById("params-form-root")
            .querySelectorAll(".params-field")
            .forEach((f) => {
                f.style.display = this.checked ? (f.classList.contains("changed") ? "" : "none") : "";
            });
    });

    document.getElementById("params-btn-download").addEventListener("click", () => {
        const json = JSON.stringify(_paramsCurrentValues, null, 4);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "params.json";
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById("params-btn-copy").addEventListener("click", () => {
        const json = JSON.stringify(_paramsCurrentValues, null, 4);
        navigator.clipboard.writeText(json).then(() => {
            const btn = document.getElementById("params-btn-copy");
            btn.textContent = "Copied!";
            setTimeout(() => (btn.textContent = "Copy"), 1500);
        });
    });

    document.getElementById("params-file-import").addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = stripTrailingCommas(reader.result);
                _paramsCurrentValues = JSON.parse(text);
                buildParamsForm();
                updateParamsPreview();
            } catch (err) {
                alert("Invalid JSON: " + err.message);
            }
        };
        reader.readAsText(file);
        this.value = "";
    });
}

async function initParamsEditor() {
    const schemaResp = await cachedFetch(PARAMS_SCHEMA_URL);
    if (!schemaResp.ok) {
        throw new Error(`Failed to load parameter schema (HTTP ${schemaResp.status}).`);
    }
    _paramsSchema = await schemaResp.json();

    try {
        const defResp = await cachedFetch(PARAMS_PLACEHOLDER_URL);
        if (defResp.ok) {
            const text = stripTrailingCommas(await defResp.text());
            _paramsDefaultValues = JSON.parse(text);
        } else {
            _paramsDefaultValues = paramsBuildDefaults(_paramsSchema);
        }
    } catch {
        _paramsDefaultValues = paramsBuildDefaults(_paramsSchema);
    }

    _paramsCurrentValues = JSON.parse(JSON.stringify(_paramsDefaultValues));

    const pageContent = document.querySelector(".page-content");
    if (pageContent) pageContent.classList.add("params-page");

    document.getElementById("runs").innerHTML = renderParamsEditorShell();
    showDiffResults();
    initParamsEditorUI();
}

/* ─── Page state helpers ────────────────────────────────────── */
function showLoading() {
    document.getElementById("loading").style.display = "";
    document.getElementById("error").style.display = "none";
    document.getElementById("filter-banner").style.display = "none";
    document.getElementById("summary").style.display = "none";
    document.getElementById("runs").style.display = "none";
}

function showError(msg) {
    document.getElementById("loading").style.display = "none";
    const el = document.getElementById("error");
    el.style.display = "";
    el.innerHTML = `<p class="error-icon">⚠</p><p>${e(msg)}</p>`;
}

function showResults() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("summary").style.display = "";
    document.getElementById("layout-bar").style.display = "";
    document.getElementById("runs").style.display = "";
}

function showDiffResults() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("error").style.display = "none";
    document.getElementById("filter-banner").style.display = "none";
    document.getElementById("summary").style.display = "none";
    document.getElementById("layout-bar").style.display = "none";
    document.getElementById("runs").style.display = "";
}

/* ─── Utility ───────────────────────────────────────────────── */
function e(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Landing page ──────────────────────────────────────────── */
// Build the landing page HTML. Qualification conditions are summarized inline
// and link back to the authoritative source repo; the brief project
// description lives in the page subtitle set by init().
function renderLandingPage() {
    return `<div class="landing-page">
    <section class="landing-card landing-qualify">
        <h2 class="landing-heading">AIND Ephys pipeline qualification conditions</h2>
        <p>
            The AIND Ephys pipeline runs on electrophysiology assets drawn from the DANDI Archive. To qualify, an
            asset must meet the following conditions:
        </p>
        <ol class="landing-conditions">
            <li>The asset must be listed within a public Dandiset.</li>
            <li>The asset must be an NWB file, either in HDF5 or Zarr format.</li>
            <li>The NWB file must be openable and valid.</li>
            <li>
                The NWB file must contain at least one <code>ElectricalSeries</code> data stream in the
                <code>acquisition</code> group with a <code>rate</code> greater than 10&nbsp;kHz; lower-rate series
                (e.g. LFP) are ignored.
            </li>
        </ol>
        <p>Each qualifying series must additionally:</p>
        <ul class="landing-conditions landing-conditions-sub">
            <li>have a total duration of more than 2 minutes.</li>
            <li>
                survive the pipeline's split-then-aggregate step: when a series spans more than one channel group, the
                pipeline splits series by channel group and recombines them with
                <code>spikeinterface.aggregate_channels</code>, which requires the relative channel locations to remain
                unique once combined.
            </li>
        </ul>
        <p class="landing-note">
            See the
            <a href="${e(QUALIFYING_CONTENT_IDS_README_URL)}" target="_blank" rel="noopener"
                >full qualification conditions</a
            >
            for the exact checks and common failure modes.
        </p>
    </section>

    <section class="landing-card landing-resources">
        <h2 class="landing-heading">Explore &amp; resources</h2>
        <table class="landing-resources-table">
            <thead>
                <tr>
                    <th scope="col">Resource</th>
                    <th scope="col">Description</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th scope="row"><a href="?view=dashboard">Pipeline Results dashboard</a></th>
                    <td>Browse processing runs across Dandisets.</td>
                </tr>
                <tr>
                    <th scope="row"><a href="?view=curation">Curate sorting results</a></th>
                    <td>
                        Open a successful run's postprocessed spike sorting in SpikeInterface GUI, streamed from the
                        DANDI Archive.
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <a href="${e(PIPELINE_REPO_URL)}" target="_blank" rel="noopener">AIND Ephys pipeline</a>
                    </th>
                    <td>The electrophysiology processing pipeline itself.</td>
                </tr>
                <tr>
                    <th scope="row">
                        <a href="${e(CODE_REPO_URL)}" target="_blank" rel="noopener">DANDI Compute code</a>
                    </th>
                    <td>The compute codebase driving these runs.</td>
                </tr>
                <tr>
                    <th scope="row">
                        <a href="https://dandiarchive.org" target="_blank" rel="noopener">DANDI Archive</a>
                    </th>
                    <td>The neural data archive backing the project.</td>
                </tr>
            </tbody>
        </table>
    </section>
</div>`;
}

// Render the static landing page into the shared content region.
function loadLandingPage() {
    document.getElementById("runs").innerHTML = renderLandingPage();
    showDiffResults();
}

/* ─── Progressive hydration ─────────────────────────────────── */
// The queue views render immediately from the state file alone (flag-derived
// statuses plus the synchronously derivable visualization/log listings); the
// per-run blob artifacts are fetched afterwards by a small background worker
// pool that folds results into the rendered page as they land. Work is queued
// as (run, kind) tasks in two eager passes plus one on-demand pass:
//
//   "status" — trace.txt only (a few KB per run). The ONLY background pass:
//              it is what makes the pass/fail glyphs on cards and group badges
//              truthful, and nothing else on the list view needs a fetch.
//              Until a run's status pass lands its optimistic ✓ carries a
//              provisional marker (see statusProvisional).
//   "detail" — dataset_description.json + visualization_output.json
//              (provenance, source versions, figurl links). Card-detail data:
//              enqueued only when the user expands one of the run's card
//              sections — except when a codebase-hash filter is active, which
//              needs every run's provenance and hydrates it eagerly.
//   "qc"     — quality_control.json, by far the heaviest artifact. Enqueued
//              only on card expand, like "detail".
//
// Expanding a run's card (or a group containing it) promotes its tasks to the
// front of the queue. A generation counter lets a new load (page refresh,
// ↺ Refresh) supersede in-flight hydration so stale results never touch the
// fresh DOM.
//
// Concurrency: every task is a single request to the same S3 host and browsers
// allow ~6 concurrent connections per host; 3 workers keep the pool busy while
// a promoted task still starts quickly.
const HYDRATION_CONCURRENCY = 3;
const HYDRATION_FLUSH_MS = 400;

let _hydrationGeneration = 0; // epoch: bumped whenever a load supersedes hydration
let _hydrationPending = []; // { run, kind } tasks awaiting hydration (front = next)
let _hydrationActiveCount = 0; // workers currently running
let _hydrationDirtyKeys = new Set(); // run.path values hydrated since last flush
let _hydrationFlushTimer = null;
let _hydrationIdleResolvers = [];

// Resolves once no hydration work is pending or in flight (the primary
// synchronization hook for tests).
function hydrationIdle() {
    if (_hydrationPending.length === 0 && _hydrationActiveCount === 0) return Promise.resolve();
    return new Promise((resolve) => _hydrationIdleResolvers.push(resolve));
}

function cancelHydration() {
    _hydrationGeneration++;
    _hydrationPending = [];
    _hydrationDirtyKeys.clear();
    // Superseded workers no longer count: they exit silently without touching
    // the counter (see hydrationWorker), so a worker wedged on a hung fetch
    // can never block a later generation's drain.
    _hydrationActiveCount = 0;
    if (_hydrationFlushTimer !== null) {
        clearTimeout(_hydrationFlushTimer);
        _hydrationFlushTimer = null;
    }
    for (const resolve of _hydrationIdleResolvers.splice(0)) resolve();
}

function startHydration(runs) {
    cancelHydration();
    // Background hydration fetches ONLY the small traces — pass/fail truth for
    // the whole queue. Detail/QC tasks are enqueued on demand by
    // initHydrationPromotion when a card is expanded, with one exception: an
    // active codebase-hash filter needs every run's provenance up front.
    const needsEagerDetails = !!parseFilter().dandiCodebaseHash;
    _hydrationPending = [
        ...runs.filter((run) => !run.traceLoaded).map((run) => ({ run, kind: "status" })),
        ...(needsEagerDetails ? runs.filter((run) => !run.detailsLoaded).map((run) => ({ run, kind: "detail" })) : []),
    ];
    const gen = _hydrationGeneration;
    const workers = Math.min(HYDRATION_CONCURRENCY, _hydrationPending.length);
    for (let i = 0; i < workers; i++) hydrationWorker(gen);
}

async function hydrationWorker(gen) {
    _hydrationActiveCount++;
    try {
        while (gen === _hydrationGeneration && _hydrationPending.length > 0) {
            const task = _hydrationPending.shift();
            try {
                await hydrateRunTask(task.run, task.kind);
            } catch {
                /* task never re-queued; render whatever landed */
            }
            if (gen !== _hydrationGeneration) return;
            _hydrationDirtyKeys.add(task.run.path);
            scheduleHydrationFlush();
        }
    } finally {
        // Only current-generation workers own the counter — cancelHydration
        // already zeroed it for superseded ones.
        if (gen === _hydrationGeneration) {
            _hydrationActiveCount--;
            if (_hydrationActiveCount === 0 && _hydrationPending.length === 0) {
                // Drain: flush synchronously (so awaiting hydrationIdle()
                // observes a fully updated DOM) and release idle waiters.
                if (_hydrationFlushTimer !== null) {
                    clearTimeout(_hydrationFlushTimer);
                    _hydrationFlushTimer = null;
                }
                flushHydrationUpdates();
                for (const resolve of _hydrationIdleResolvers.splice(0)) resolve();
            }
        }
    }
}

// All hydration mutates the run object IN PLACE: _runsInScope, _filteredRuns,
// and the pending queue share one object per run, so sort/layout re-renders
// mid-hydration always show the latest data.
async function hydrateRunTask(run, kind) {
    if (kind === "status") return hydrateRunStatus(run);
    if (kind === "qc") return hydrateRunQc(run);
    return hydrateRunDetails(run);
}

// Status pass: fetch the run's trace (skipped for runs without logs) and settle
// its authoritative status, failure step, and task table.
async function hydrateRunStatus(run) {
    const text = run.hasLogs ? await fetchTraceText(run) : null;
    const parsed = parseTrace(text);
    // An explicit upstream status is authoritative; otherwise the trace refines
    // the flag-derived status (a run with output may still have failed tasks).
    const status = run.stateStatus
        ? run.stateStatus
        : run.hasOutput
          ? parsed.status !== "unknown"
              ? parsed.status
              : "success"
          : deriveFlagStatus(run);
    const failureStep =
        run.stateFailureStep ?? (isFailedStatus(status) ? runFailureStep({ status, tasks: parsed.tasks }) : null);
    Object.assign(run, {
        ...parsed,
        status,
        failureStep,
        statusProvisional: false,
        traceLoaded: true,
        statusSettled: true,
    });
}

// Detail pass: provenance and interactive-viz links (both small artifacts).
async function hydrateRunDetails(run) {
    const [datasetDesc, vizLinks] = await Promise.all([
        run.datasetDescriptionPath ? fetchDatasetDescription(run) : Promise.resolve(null),
        run.hasOutput ? fetchVisualizationOutput(run) : Promise.resolve(null),
    ]);
    Object.assign(run, {
        generatedBy: Array.isArray(datasetDesc?.GeneratedBy) ? datasetDesc.GeneratedBy : [],
        datasetDescription: datasetDesc ?? null,
        vizLinks: vizLinks && typeof vizLinks === "object" ? vizLinks : null,
        detailsLoaded: true,
    });
}

// On-demand pass: quality_control.json (the heaviest artifact), fetched only
// once the user expands one of the run's card sections. QC-referenced plots
// move out of the visualization gallery and into the QC cards when it lands.
async function hydrateRunQc(run) {
    const qualityControl = run.hasOutput ? await fetchQualityControl(run) : null;
    const vizData = run.hasOutput ? fetchVisualizationData(run) : null;
    Object.assign(run, {
        qualityControl,
        vizData: qualityControl ? partitionQcPlots(qualityControl, vizData) : vizData,
        qcLoaded: true,
    });
}

// Whether the run has a quality_control.json artifact to fetch (sync check
// against the output_paths map — mirrors fetchVizArtifactJson's candidates).
function runHasQualityControl(run) {
    if (!run?.hasOutput || !run?.outputPaths) return false;
    return (
        `${run.path}/derivatives/visualization/quality_control.json` in run.outputPaths ||
        `${run.path}/visualization/quality_control.json` in run.outputPaths
    );
}

// Move a run's pending tasks to the front of the hydration queue, preserving
// status-before-detail order (no-op for unknown or fully hydrated runs). With
// { reveal: true } (a card section was expanded) the run's card-detail
// artifacts — dataset_description/visualization_output and, when present,
// quality_control.json — are also enqueued; none of them is ever fetched
// without such a reveal (codebase-hash filters excepted, see startHydration).
function prioritizeRun(runKey, { reveal = false } = {}) {
    const mine = [];
    const rest = [];
    for (const task of _hydrationPending) (task.run.path === runKey ? mine : rest).push(task);
    const run = mine[0]?.run ?? _runsInScope.find((r) => r.path === runKey);
    if (reveal && run) {
        if (!run.detailsLoaded && !run.detailQueued && (run.datasetDescriptionPath || run.hasOutput)) {
            run.detailQueued = true;
            mine.push({ run, kind: "detail" });
        }
        if (!run.qcLoaded && !run.qcQueued && runHasQualityControl(run)) {
            run.qcQueued = true;
            mine.push({ run, kind: "qc" });
        }
    }
    if (mine.length === 0) return;
    _hydrationPending = [...mine, ...rest];
    // Revive workers if the queue had already drained (QC arrives on demand).
    const gen = _hydrationGeneration;
    const needed = Math.min(HYDRATION_CONCURRENCY, _hydrationPending.length) - _hydrationActiveCount;
    for (let i = 0; i < needed; i++) hydrationWorker(gen);
}

// Promote runs the user reveals. 'toggle' does not bubble, so listen in the
// capture phase on #runs — the element itself survives innerHTML swaps.
// The runs backing a tree group, in current sort order. Used to build lazily
// deferred group bodies at open time (always from the live, possibly-hydrated
// run objects, so a body rendered late is born up to date).
function runsForGroupKey(groupKey) {
    return sortRuns(_filteredRuns).filter((run) => runGroupKeys(run).includes(groupKey));
}

// Reclaim a closed tree group's materialized body. Bodies used to linger
// until the next full re-render; over a long browsing session the accumulated
// cards — and the decoded images their <img> elements keep alive — dominate
// the tab's memory, so drop them eagerly. Reopening rebuilds the body from
// the live (possibly further-hydrated) run objects via renderLazyGroupBody,
// exactly like a first open; descendant groups keep their _openGroupKeys
// entries, so their expansion state is restored by that rebuild.
function releaseGroupBody(details) {
    if (!details.dataset.bodyRendered) return;
    const body = details.querySelector(":scope > [data-group-body]");
    if (!body) return;
    delete details.dataset.bodyRendered;
    body.innerHTML = "";
}

// Build a lazily deferred group body on first open. No-op for groups whose
// body was already rendered (data-body-rendered) or non-tree groups.
function renderLazyGroupBody(details) {
    if (details.dataset.bodyRendered) return;
    const groupKey = details.dataset.groupKey ?? "";
    if (!/^[dse]:/.test(groupKey)) return;
    const body = details.querySelector(":scope > [data-group-body]");
    if (!body) return;
    details.dataset.bodyRendered = "1";
    const runs = runsForGroupKey(groupKey);
    body.innerHTML =
        groupKey[0] === "d"
            ? renderDandisetGroupBody(runs)
            : groupKey[0] === "s"
              ? renderSubjectGroupBody(runs)
              : renderSessionGroupBody(runs);
    initInlineHtmlFrames(details);
}

function initHydrationPromotion() {
    const runsEl = document.getElementById("runs");
    if (!runsEl || runsEl.dataset.hydrationInit) return;
    runsEl.dataset.hydrationInit = "1";
    runsEl.addEventListener(
        "toggle",
        (evt) => {
            const details = evt.target;
            if (!(details instanceof Element)) return;
            const groupKey = details.dataset?.groupKey;
            if (groupKey) {
                // Track expansion state for lazy re-renders. A closing group
                // releases its materialized body immediately so a long
                // open-browse-close session doesn't accumulate card DOM (and
                // pinned images) for groups no longer on screen.
                if (!details.open) {
                    _openGroupKeys.delete(groupKey);
                    releaseGroupBody(details);
                    return;
                }
                _openGroupKeys.add(groupKey);
                renderLazyGroupBody(details);
                // Promote the revealed runs' status/detail tasks (not QC — the
                // heavy artifact waits for a card-level expand), iterating in
                // reverse DOM order so the topmost card goes first.
                const cards = details.querySelectorAll("[data-run-key]");
                for (let i = cards.length - 1; i >= 0; i--) prioritizeRun(cards[i].dataset.runKey);
                return;
            }
            if (!details.open) return;
            const card = details.closest("[data-run-key]");
            // A card section opened: full promotion, including detail + QC.
            if (card) prioritizeRun(card.dataset.runKey, { reveal: true });
        },
        true
    );
}

// Stable identity for a <details> element across re-renders: group key for
// group nodes, "<runKey>::<section>" for run detail sections.
function detailsStateKey(details) {
    if (details.dataset.groupKey) return `g:${details.dataset.groupKey}`;
    if (details.dataset.section) {
        const card = details.closest("[data-run-key]");
        if (card) return `${card.dataset.runKey}::${details.dataset.section}`;
    }
    return null;
}

// Replace one run card in place, preserving its open <details> sections.
// Ancestor group nodes are untouched, so expansion state and scroll position
// survive. No-op when the run is not currently in the DOM.
function updateRunCard(run) {
    const runsEl = document.getElementById("runs");
    if (!runsEl) return;
    // Attribute-equality lookup instead of a selector: run paths contain
    // characters that would need CSS escaping (and jsdom lacks CSS.escape).
    const old = Array.from(runsEl.querySelectorAll("[data-run-key]")).find((el) => el.dataset.runKey === run.path);
    if (!old) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = (_layoutMode === "flat" ? renderFlatRunEntry(run) : renderRunEntry(run)).trim();
    const fresh = tpl.content.firstElementChild;
    if (!fresh) return;
    for (const openDetails of old.querySelectorAll("details[data-section][open]")) {
        fresh.querySelector(`details[data-section="${openDetails.dataset.section}"]`)?.setAttribute("open", "");
    }
    old.replaceWith(fresh);
    initInlineHtmlFrames(fresh);
}

// Rewrite group status badges (tree layout) after hydration refines statuses.
// While filter membership is stable only the badges can change — the
// subject/session/run counts are membership-derived.
function refreshGroupBadges() {
    const runsEl = document.getElementById("runs");
    if (!runsEl) return;
    const groups = new Map(); // data-group-key -> runs
    for (const run of _filteredRuns) {
        for (const key of runGroupKeys(run)) {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(run);
        }
    }
    for (const el of runsEl.querySelectorAll("details[data-group-key]")) {
        const groupRuns = groups.get(el.dataset.groupKey);
        if (!groupRuns) continue;
        const badges = el.querySelector(":scope > summary .group-badges");
        if (badges) badges.innerHTML = renderGroupBadges(groupRuns);
    }
}

// Wholesale re-render preserving expansion state and scroll. Used when
// hydration changes which runs match the active filter — rare (requires an
// active hydration-dependent filter) and a keyed re-render is simpler and
// safer than incremental creation/pruning of nested group chains.
function rerenderRunsPreservingState() {
    const runsEl = document.getElementById("runs");
    if (!runsEl) return;
    const openKeys = new Set();
    const closedKeys = new Set();
    for (const details of runsEl.querySelectorAll("details")) {
        const key = detailsStateKey(details);
        if (key) (details.open ? openKeys : closedKeys).add(key);
    }
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    rerenderRuns();
    for (const details of runsEl.querySelectorAll("details")) {
        const key = detailsStateKey(details);
        if (!key) continue;
        if (openKeys.has(key)) {
            details.setAttribute("open", "");
            renderLazyGroupBody(details); // restored-open groups need their lazy body
        }
        // Restoring the closed set too keeps autoExpand defaults from popping
        // groups the user explicitly collapsed.
        else if (closedKeys.has(key)) details.removeAttribute("open");
    }
    // Reconcile the expansion registry with what the restore produced (e.g.
    // autoExpand groups the user had explicitly collapsed).
    _openGroupKeys = new Set(
        Array.from(runsEl.querySelectorAll("details[data-group-key][open]"), (el) => el.dataset.groupKey)
    );
    window.scrollTo(scrollX, scrollY);
}

function scheduleHydrationFlush() {
    if (_hydrationFlushTimer !== null) return; // trailing-edge batch
    const gen = _hydrationGeneration;
    _hydrationFlushTimer = setTimeout(() => {
        _hydrationFlushTimer = null;
        if (gen === _hydrationGeneration) flushHydrationUpdates();
    }, HYDRATION_FLUSH_MS);
}

// Fold freshly hydrated runs into the page: refresh dirty cards in place when
// filter membership is unchanged, or re-render the whole list (preserving
// expansion + scroll) when hydration moved runs in/out of the filtered set.
// Summary stats and the filter banner's value lists refresh on every flush.
function flushHydrationUpdates() {
    const dirty = [..._hydrationDirtyKeys];
    _hydrationDirtyKeys.clear();
    if (dirty.length === 0) return;

    const filter = parseFilter();
    const isFiltered = isFilterActive(filter);
    const nextFiltered = applyFilter(sortRuns(_runsInScope), filter);
    const nextKeys = new Set(nextFiltered.map((run) => run.path));
    const membershipChanged =
        nextKeys.size !== _filteredRuns.length || _filteredRuns.some((run) => !nextKeys.has(run.path));
    _filteredRuns = nextFiltered;

    if (membershipChanged) {
        if (isFiltered && nextFiltered.length === 0) {
            // Entering the empty-filter state mid-view: hide the stale list.
            showError("No pipeline runs match the current filter.");
            document.getElementById("summary").style.display = "none";
            document.getElementById("runs").style.display = "none";
        } else {
            // Recover from an earlier empty-filter error state.
            rerenderRunsPreservingState();
            initLayoutToggle();
            document.getElementById("error").style.display = "none";
            showResults();
        }
    } else if (nextFiltered.length > 0) {
        const dirtySet = new Set(dirty);
        for (const run of _filteredRuns) {
            if (dirtySet.has(run.path)) updateRunCard(run);
        }
        if (_layoutMode !== "flat") refreshGroupBadges();
    }

    renderSummary(isFiltered ? _filteredRuns : _runsInScope);
    // Skip the banner while the user is typing in one of its filter inputs;
    // the value lists catch up on the next flush.
    const banner = document.getElementById("filter-banner");
    if (!banner || !banner.contains(document.activeElement)) renderFilterBanner(filter, _runsInScope);
}

/* ─── In-page filter changes + memory soft reset ────────────── */
// Filter changes historically navigated (the filter form is a plain GET form;
// crumbs, clear links, summary stats, and narrow links are plain anchors), so
// every change rebuilt the page from scratch. Same-view filter navigations are
// instead applied in place via history.pushState: the queue state is already in
// memory, so the new scope renders instantly — and the switch doubles as a
// "soft reset" that reclaims what a long-lived tab accumulated for the old
// scope (retained blob bodies, hydrated card payloads, materialized DOM).
//
// The soft reset never touches the durable layers: the Cache API blob store
// (content-addressed, immutable), the sessionStorage queue-state ETag cache,
// and the params/config registries all survive, so everything dropped here
// re-reads from disk instead of the network when needed again.
//
// View switches (?view=...) still navigate for real — they load a different
// page type — as does anything cross-origin, cross-path, or targeted.

// JSON snapshot of the parseFilter() set the rendered queue reflects. Null
// until a queue load succeeds, which keeps in-page interception off on the
// landing/compare/params pages and after a failed load.
let _activeFilterKey = null;
let _inPageFilterNavInit = false;

function filterStateKey(filter = parseFilter()) {
    // A GET submit of the filter form serializes untouched inputs as empty
    // params; applyFilter/isFilterActive treat "" and absent alike, so the
    // snapshot must too.
    return JSON.stringify(filter, (key, value) => (value === "" ? null : value));
}

// Test hook: the live run objects backing the current load.
function getRunsInScope() {
    return _runsInScope;
}

// Drop everything hydration attached to a run, resetting it to its
// buildInitialRun shape except for the settled status fields: status,
// failureStep, statusProvisional, and statusSettled survive so badges and
// summary stats stay truthful without a refetch. The cleared queueing flags
// make the run re-fetch once it matters again (re-entering the filtered set,
// or a card reveal) — cheaply, via the persistent blob cache.
function releaseRunHydration(run) {
    run.tasks = [];
    run.generatedBy = [];
    run.datasetDescription = null;
    run.vizData = run.hasOutput ? fetchVisualizationData(run) : null;
    run.vizLinks = null;
    run.qualityControl = null;
    run.traceLoaded = !run.hasLogs;
    run.detailsLoaded = false;
    run.detailQueued = false;
    run.qcLoaded = false;
    run.qcQueued = false;
}

// Re-render the already-loaded queue for the filter set in the current URL,
// reclaiming memory held for the previous scope.
function softResetForFilterChange() {
    const filter = parseFilter();
    _activeFilterKey = filterStateKey(filter);

    // Supersede in-flight hydration before mutating scope (existing generation
    // bump — stale results must never touch the re-rendered DOM).
    cancelHydration();
    clearBlobMemoryCache();

    const isFiltered = isFilterActive(filter);
    const filteredRuns = applyFilter(sortRuns(_runsInScope), filter);
    const keep = new Set(filteredRuns);
    for (const run of _runsInScope) {
        if (!keep.has(run)) releaseRunHydration(run);
    }
    _filteredRuns = filteredRuns;

    // Collapse the tree and reset flat-layout chunking, exactly like a fresh
    // load: the old scope's materialized group bodies are reclaimed with the
    // re-render.
    _openGroupKeys = new Set();
    _flatRenderLimit = FLAT_RENDER_CHUNK;

    if (isFiltered && filteredRuns.length === 0) {
        // Possibly transient: the restarted hydration below may yet bring runs
        // into the filtered set (see the matching branch in loadQueueData).
        showError("No pipeline runs match the current filter.");
        document.getElementById("summary").style.display = "none";
        document.getElementById("runs").style.display = "none";
    } else {
        renderSummary(isFiltered ? filteredRuns : _runsInScope);
        document.getElementById("runs").innerHTML =
            _layoutMode === "flat" ? renderFlatList(filteredRuns) : renderDandisets(sortRuns(filteredRuns));
        initInlineHtmlFrames();
        initLayoutToggle();
        document.getElementById("error").style.display = "none";
        showResults();
    }
    renderFilterBanner(filter, _runsInScope);
    window.scrollTo(0, 0);

    // Restart hydration for the new scope, visible runs first (same ordering
    // as loadQueueData). Out-of-scope runs whose status a trace already
    // settled are deliberately NOT re-enqueued: re-reading their traces would
    // repopulate the tasks arrays and the memory cache just dropped, and
    // their retained status/failureStep already keeps the summary and filter
    // membership truthful. They re-hydrate when a later filter change brings
    // them back into the visible set. Never-settled runs stay queued so
    // hydration-dependent filters keep converging via flushHydrationUpdates —
    // and a codebase-hash filter hydrates the whole scope, since membership
    // needs every run's provenance (see needsEagerDetails in startHydration).
    const rest = _runsInScope.filter((run) => !keep.has(run));
    const backgroundRuns = filter.dandiCodebaseHash ? rest : rest.filter((run) => !run.statusSettled);
    startHydration([...filteredRuns, ...backgroundRuns]);
}

// Apply the current URL to the loaded queue without a navigation. In-page URLs
// built by narrowUrl embed the live layout/sort values, so normally only the
// filter set differs — but popstate can restore an entry carrying older
// layout/sort params, so those re-sync too.
function handleInPageFilterUrlChange() {
    const layoutChanged =
        _layoutMode !== parseLayoutMode() || _sortMode !== parseSortMode() || _sortDirection !== parseSortDirection();
    _layoutMode = parseLayoutMode();
    _sortMode = parseSortMode();
    _sortDirection = parseSortDirection();
    if (filterStateKey() !== _activeFilterKey) {
        softResetForFilterChange();
    } else if (layoutChanged) {
        initLayoutToggle();
        rerenderRuns();
    }
}

// Whether a URL can be applied in place: same origin and path, no fragment,
// and staying on the view the page rendered (view switches load a different
// page type and keep navigating for real).
function isInPageFilterUrl(url) {
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.hash) return false;
    const rawView = new URLSearchParams(url.search).get("view");
    return (ALLOWED_VIEW_MODES.has(rawView) ? rawView : null) === _viewMode;
}

function initInPageFilterNavigation() {
    if (_inPageFilterNavInit) return;
    _inPageFilterNavInit = true;

    // Filter links (crumbs, clear links, summary stats, narrow links, priority
    // chips) — delegated so links from every re-render are covered, and in the
    // capture phase because the ⊕ Narrow links inside group summaries stop
    // propagation inline (to keep the click from toggling their group), which
    // would never let a bubble listener see them. Modified clicks (new tab,
    // download) keep their native behavior.
    document.addEventListener(
        "click",
        (evt) => {
            if (_activeFilterKey === null || evt.defaultPrevented) return;
            if (evt.button !== 0 || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
            if (!(evt.target instanceof Element)) return;
            const anchor = evt.target.closest("a[href]");
            if (!anchor || anchor.hasAttribute("download")) return;
            if (anchor.target && anchor.target !== "_self") return;
            const url = new URL(anchor.getAttribute("href"), window.location.href);
            if (!isInPageFilterUrl(url)) return;
            evt.preventDefault();
            window.history.pushState(null, "", `${url.pathname}${url.search}`);
            handleInPageFilterUrlChange();
        },
        true
    );

    // The filter form (Apply / Enter in an input). Mirrors the native GET
    // serialization so the resulting URL matches what a full-page submit would
    // have produced.
    document.addEventListener("submit", (evt) => {
        if (_activeFilterKey === null || evt.defaultPrevented) return;
        const form = evt.target;
        if (!(form instanceof Element) || !form.classList.contains("filter-form")) return;
        const qs = new URLSearchParams(new FormData(form)).toString();
        evt.preventDefault();
        window.history.pushState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
        handleInPageFilterUrlChange();
    });

    // Back/forward across pushState entries stays in-page too.
    window.addEventListener("popstate", () => {
        if (_activeFilterKey === null) return;
        handleInPageFilterUrlChange();
    });
}

/* ─── Queue data loader ─────────────────────────────────────── */
// Fetches, processes, and renders the queue state for the current view.
// Only applies to the dashboard queue views ("main", "tests", and "archive");
// the "compare" and "params" views are handled separately in init() and never
// call this function.
// Called on initial page load and when the user clicks the Refresh button.
async function loadQueueData() {
    showLoading();
    renderFilterBanner(parseFilter(), []);
    // Supersede any in-flight hydration from a previous load before the new
    // state fetch begins (stale results must never touch the fresh DOM).
    cancelHydration();
    // In-page filter application stays off until this load succeeds (the
    // in-memory scope it would re-render is about to be replaced).
    _activeFilterKey = null;
    // Fresh load: collapse the tree and reset flat-layout chunking, matching
    // the pre-lazy-rendering behavior of a full reload.
    _openGroupKeys = new Set();
    _flatRenderLimit = FLAT_RENDER_CHUNK;

    try {
        // Registries are only consumed at filter/render time, so let their
        // fetch overlap the queue-state download and the per-run blob fan-out.
        const registriesReady = ensureRegistriesLoaded();
        const entries = _viewMode === "archive" ? await fetchArchiveState() : await fetchQueueState();
        const runs = parseQueueEntries(entries);

        if (runs.length === 0) {
            renderFilterBanner(parseFilter(), []);
            showError(_viewMode === "archive" ? "No archived runs found." : "No pipeline runs found in the queue.");
            return;
        }

        // First paint uses only the state file: flag-derived statuses plus the
        // visualization images and log-file listings derivable synchronously
        // from each entry's output_paths map. The per-run blob artifacts
        // (trace, dataset_description, quality_control, visualization_output)
        // hydrate in the background after render — see startHydration below.
        const initialRuns = runs.map(buildInitialRun);

        // Params/config alias resolution (filtering, registry links) needs the
        // registries from here on.
        await registriesReady;

        const sortedRuns = sortRuns(initialRuns, parseSortMode());

        // Scope runs by view mode:
        //   tests page    → show only TEST_DANDISETS entries
        //   archive page  → show every entry from the archive state file as-is
        //   main page     → hide TEST_DANDISETS entries
        const runsInScope =
            _viewMode === "tests"
                ? sortedRuns.filter((r) => TEST_DANDISETS.has(r.dandisetId))
                : _viewMode === "archive"
                  ? sortedRuns
                  : sortedRuns.filter((r) => !TEST_DANDISETS.has(r.dandisetId));

        const filter = parseFilter();
        const isFiltered = isFilterActive(filter);
        const filteredRuns = applyFilter(runsInScope, filter);

        _runsInScope = runsInScope;
        _filteredRuns = filteredRuns;
        _activeFilterKey = filterStateKey(filter);
        _layoutMode = parseLayoutMode();
        _sortMode = parseSortMode();
        _sortDirection = parseSortDirection();
        updateLayoutModeUrl(_layoutMode);
        updateSortModeUrl(_sortMode);
        updateSortDirectionUrl(_sortDirection);

        if (isFiltered && filteredRuns.length === 0) {
            renderFilterBanner(filter, runsInScope);
            showError("No pipeline runs match the current filter.");
            // No early return: hydration below may yet bring runs into the
            // filtered set (e.g. failure-step filters need trace data), at
            // which point flushHydrationUpdates switches back to the results.
        } else {
            // Show the full summary for the in-scope runs; when a specific
            // filter is active show only the matching subset.
            renderSummary(isFiltered ? filteredRuns : runsInScope);
            renderFilterBanner(filter, runsInScope);
            document.getElementById("runs").innerHTML =
                _layoutMode === "flat" ? renderFlatList(filteredRuns) : renderDandisets(sortRuns(filteredRuns));
            initInlineHtmlFrames();
            initLayoutToggle();
            showResults();
        }

        // Hydrate the full scope (summary stats and the filter banner's value
        // lists cover out-of-filter runs too), visible runs first.
        const visible = new Set(filteredRuns);
        startHydration([...filteredRuns, ...runsInScope.filter((run) => !visible.has(run))]);
    } catch (err) {
        renderFilterBanner(parseFilter(), []);
        showError(err.message || "An unexpected error occurred.");
    }
}

/* ─── Main ──────────────────────────────────────────────────── */
async function init() {
    _viewMode = parseViewMode();
    initTheme();
    initVersion();
    initModal();
    initCopyCodeButtons();
    initHydrationPromotion();
    initFlatShowMore();
    initInPageFilterNavigation();
    syncTopNav(_viewMode);

    // The landing page is the default view (no `view` param). It has no queue
    // data or registries to load, so render it and return before the queue path.
    if (_viewMode === null) {
        setPageCopy(
            "Welcome to DANDI Compute: AIND Ephys",
            'An experiment in reproducible electrophysiology processing on the <a href="https://dandiarchive.org" target="_blank" rel="noopener">DANDI Archive</a>.'
        );
        loadLandingPage();
        return;
    }

    if (_viewMode === "compare") {
        setPageCopy(
            "AIND Pipeline Diffs Index",
            'Assembled comparison links for the <a href="https://github.com/AllenNeuralDynamics/aind-ephys-pipeline" target="_blank" rel="noopener">pipeline repository</a> and registered parameter or configuration definitions.'
        );
    }
    if (_viewMode === "params") {
        setPageCopy(
            "Register New Params File",
            'Create a custom parameter file for the <a href="https://github.com/AllenNeuralDynamics/aind-ephys-pipeline" target="_blank" rel="noopener">AIND Ephys Pipeline</a> and submit it for use in the compute pipeline.'
        );
    }
    if (_viewMode === "curation") {
        setPageCopy(
            "Curate Sorting Results",
            'Open a successful run\'s postprocessed spike sorting in <a href="https://github.com/SpikeInterface/spikeinterface-gui" target="_blank" rel="noopener">SpikeInterface GUI</a>, streamed directly from the DANDI Archive.'
        );
    }
    if (_viewMode === "archive") {
        setPageCopy(
            "Archived Pipeline Runs",
            `Failing runs that have been archived from the main queue, sourced from <a href="${dandiBaseUrl(ARCHIVE_DANDISET_ID)}/dandiset/${ARCHIVE_DANDISET_ID}/draft/files?location=derivatives" target="_blank" rel="noopener">Dandiset ${ARCHIVE_DANDISET_ID}'s jobs.tsv</a>.`
        );
    }

    showLoading();
    pruneStaleBlobCaches();
    if (_viewMode === "compare") {
        try {
            // The compare page consumes the registries up front (params/config
            // entries), unlike the queue views which overlap the fetch.
            await ensureRegistriesLoaded();
            const entries = await fetchQueueState();
            const runs = parseQueueEntries(entries);
            const pipelineEntries = await buildPipelineCompareEntries(runs);
            const pipelinePairs = await buildPipelineDiffPairs(runs);
            const paramsEntries = buildParamsCompareEntries();
            const paramsPairs = await buildParamsDiffPairs();
            const configEntries = uniqueRegistryEntries(CONFIG_REGISTRY).map((entry) => ({
                key: entry.alias,
                alias: entry.alias,
                sourceUrl: codeRepoBlobUrl(`src/dandi_compute_code/aind_ephys_pipeline/configs/${entry.path}`),
            }));
            const configPairs = await buildConfigDiffPairs();
            const diffData = {
                pipelineEntries,
                pipelinePairs,
                pipelinePairMap: new Map(
                    pipelinePairs.map((pair) => [`${pair.baseVersion}\x00${pair.headVersion}`, pair.compareUrl])
                ),
                paramsEntries,
                paramsPairs,
                paramsPairMap: new Map(paramsPairs.map((pair) => [`${pair.baseAlias}\x00${pair.headAlias}`, pair])),
                configEntries,
                configPairs,
                configPairMap: new Map(configPairs.map((pair) => [`${pair.baseAlias}\x00${pair.headAlias}`, pair])),
            };
            document.getElementById("runs").innerHTML = renderDiffPage(diffData);
            showDiffResults();
        } catch (err) {
            showError(err.message || "An unexpected error occurred.");
        }
        return;
    }
    if (_viewMode === "params") {
        try {
            await initParamsEditor();
        } catch (err) {
            showError(err.message || "Failed to load the parameter schema.");
        }
        return;
    }
    if (_viewMode === "curation") {
        try {
            await initCurationPage();
        } catch (err) {
            showError(err.message || "Failed to load the job list.");
        }
        return;
    }
    // Top display of current queue scheduling priorities. Irrelevant to the
    // archive page, which shows already-completed (failed) runs.
    if (_viewMode !== "archive") initQueuePriorities();
    await loadQueueData();
}

document.addEventListener("DOMContentLoaded", init);

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        applyFilter,
        blobMemoryCacheStats,
        buildInitialRun,
        buildRunPath,
        cachedFetch,
        cancelHydration,
        clearBlobMemoryCache,
        getRunsInScope,
        initInPageFilterNavigation,
        softResetForFilterChange,
        classifyFailedTaskStep,
        clearQueueStateCache,
        deriveFlagStatus,
        ensureRegistriesLoaded,
        fetchQueueConfig,
        fetchQueueState,
        flushHydrationUpdates,
        hydrateRunStatus,
        runHasQualityControl,
        hydrationIdle,
        initFlatShowMore,
        initHydrationPromotion,
        isImmutableBlobUrl,
        prioritizeRun,
        startHydration,
        updateRunCard,
        fetchArchiveState,
        archiveStateCacheKey,
        fetchSlurmLogs,
        fetchVisualizationData,
        initModal,
        initCopyCodeButtons,
        curationScript,
        findCurationRun,
        initCurationPage,
        curationScriptValues,
        renderCurationLink,
        renderGroupBadges,
        renderCurationPage,
        runPostprocessedAnalyzers,
        initLayoutToggle,
        loadQueueData,
        openHtmlModal,
        neurosiftBlobUrl,
        neurosiftDandisetUrl,
        neurosiftSessionUrl,
        parseQueueEntries,
        parseLayoutMode,
        parseSortDirection,
        parseSortMode,
        parseRunPath,
        parseTrace,
        parseViewMode,
        queueStateCacheKey,
        syncTopNav,
        renderDandisets,
        buildPipelineDiffPairs,
        collectJsonDiffs,
        collectTextDiffs,
        loadAindPipelineRegistries,
        normalizeConfigHash,
        normalizeRegistryEntries,
        renderParamsGroup,
        renderDiffPage,
        renderLandingPage,
        renderFilterBanner,
        renderSummary,
        renderFlatList,
        renderQualityControlSection,
        renderQueuePriorities,
        buildParamsCompareEntries,
        renderRegistryLink,
        renderVisualizationSection,
        runFailureStep,
        sortRuns,
        uniquePipelineEntries,
        uniqueRegistryEntries,
        showError,
        showDiffResults,
        showLoading,
        showResults,
        TEST_DANDISETS,
        DANDISET_SUBJECT_DEFAULTS,
        resolveSubject,
        derivativesUrl,
        treeUrl,
    };
}
