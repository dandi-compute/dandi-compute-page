const {
    applyFilter,
    filterToSearchText,
    parseFilter,
    parseSearchTerms,
    pipelineDisplayName,
    renderRunTags,
    searchTermsToParams,
    buildInitialRun,
    buildRunPath,
    buildPipelineDiffPairs,
    buildParamsCompareEntries,
    cachedFetch,
    deriveFlagStatus,
    runHasQualityControl,
    classifyFailedTaskStep,
    clearQueueStateCache,
    collectJsonDiffs,
    collectTextDiffs,
    ensureRegistriesLoaded,
    fetchQueueConfig,
    fetchQueueState,
    isImmutableBlobUrl,
    fetchArchiveState,
    fetchLatestSqueueSnapshot,
    fetchLatestDiskSnapshot,
    hideSqueueJobs,
    initSqueueMonitor,
    initDiskMonitor,
    SQUEUE_INFRASTRUCTURE_JOB_NAMES,
    monitorDayBranch,
    monitorRecordTime,
    refreshSqueueMonitor,
    refreshDiskMonitor,
    renderSqueueMonitor,
    renderDiskMonitor,
    parseBackupStatus,
    renderBackupStatus,
    loadBackupStatus,
    renderStatusPage,
    stopMonitors,
    summarizeSqueueJobs,
    archiveStateCacheKey,
    fetchSlurmLogs,
    fetchVisualizationData,
    initModal,
    initCopyCodeButtons,
    curationScript,
    curationScriptValues,
    curationExportScript,
    findCurationRun,
    initCurationPage,
    renderCurationLink,
    renderGroupBadges,
    renderCurationPage,
    runPostprocessedAnalyzers,
    initLayoutToggle,
    loadAindPipelineRegistries,
    normalizeConfigHash,
    normalizeRegistryEntries,
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
    renderDiffPage,
    renderDandisets,
    renderLandingPage,
    renderParamsGroup,
    renderQueuePriorities,
    renderRegistryLink,
    renderFlatList,
    renderQualityControlSection,
    renderVisualizationSection,
    runFailureStep,
    sortRuns,
    TEST_DANDISETS,
    DANDISET_SUBJECT_DEFAULTS,
    derivativesUrl,
    resolveSubject,
    treeUrl,
    uniquePipelineEntries,
} = require("./app");

const QUEUE_STATE_CACHE_KEY = queueStateCacheKey();

/** Column order for the `jobs.tsv` table (mirrors _JOBS_TSV_FIELD_NAMES on the Python side). */
const JOBS_TSV_FIELD_NAMES = [
    "job_id",
    "dandiset_id",
    "within_dandiset_path",
    "pipeline",
    "version",
    "params",
    "config",
    "codebase",
    "content_id",
    "asset_size_bytes",
    "status",
    "created_at",
    "job_submission_time",
    "job_completion_time",
    "queue_wait_seconds",
    "run_duration_seconds",
    "process_wall_time_seconds",
];

/** Column order for the `paths.tsv` table (mirrors _PATHS_TSV_FIELD_NAMES on the Python side). */
const PATHS_TSV_FIELD_NAMES = ["job_id", "path", "content_id"];

/** Mirror Python csv.DictWriter's QUOTE_MINIMAL: quote-wrap (doubling inner quotes)
 * only when a cell contains the delimiter, a quote, or a newline. */
function tsvQuote(cell) {
    if (!/[\t"\n]/.test(cell)) return cell;
    return `"${cell.replace(/"/g, '""')}"`;
}

/** Serialise row objects into a tab-separated table (header + one row each). */
function makeTsv(fieldNames, rows) {
    const lines = [fieldNames.join("\t")];
    for (const row of rows) {
        lines.push(fieldNames.map((key) => (row[key] == null ? "" : tsvQuote(String(row[key])))).join("\t"));
    }
    return lines.join("\n") + "\n";
}

const makeJobsTsv = (rows) => makeTsv(JOBS_TSV_FIELD_NAMES, rows);
const makePathsTsv = (rows) => makeTsv(PATHS_TSV_FIELD_NAMES, rows);

const REGISTERED_PARAMS_FIXTURE = {
    deterministic: { path: "name-deterministic.json", md5: "4af6a25e20e376c81895ce9350a9cbd4" },
    default: { path: "name-deterministic.json", md5: "4af6a25e20e376c81895ce9350a9cbd4" },
    original: { path: "name-original.json", md5: "98fd947595f60b65812a4b0ea29b7141" },
};
const REGISTERED_CONFIGS_FIXTURE = {
    v1: { path: "name-mit+engaging_revision-1.config", md5: "0d4bf36ddb61418ae7714e7d6e5ff8b8" },
    default: { path: "name-mit+engaging_revision-1.config", md5: "0d4bf36ddb61418ae7714e7d6e5ff8b8" },
    v0: { path: "name-mit+engaging_revision-0.config", md5: "6568ddacdedabc7b855769340ed8874f" },
};

async function loadFixtureRegistries() {
    const originalFetch = global.fetch;
    global.fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(REGISTERED_PARAMS_FIXTURE), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(REGISTERED_CONFIGS_FIXTURE), { status: 200 }));
    try {
        await loadAindPipelineRegistries();
    } finally {
        global.fetch = originalFetch;
    }
}

beforeEach(() => {
    document.body.innerHTML = "";
});

afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    window.history.replaceState(null, "", "/");
});

describe("app unit behavior", () => {
    it("parses layout mode from URL query when present", () => {
        localStorage.setItem("layoutMode", "tree");
        window.history.replaceState(null, "", "/?layout=flat");
        expect(parseLayoutMode()).toBe("flat");
    });

    it("falls back to localStorage layout mode when URL query is absent", () => {
        localStorage.setItem("layoutMode", "flat");
        window.history.replaceState(null, "", "/");
        expect(parseLayoutMode()).toBe("flat");
    });

    it("parses sort mode from URL query when present", () => {
        localStorage.setItem("sortMode", "attempt");
        window.history.replaceState(null, "", "/?sort=created_at");
        expect(parseSortMode()).toBe("created_at");
    });

    it("falls back to localStorage sort mode when URL query is absent", () => {
        localStorage.setItem("sortMode", "dandiset_id");
        window.history.replaceState(null, "", "/");
        expect(parseSortMode()).toBe("dandiset_id");
    });

    it("parses sort direction from URL query when present", () => {
        localStorage.setItem("sortDirection", "desc");
        window.history.replaceState(null, "", "/?sortDir=asc");
        expect(parseSortDirection()).toBe("asc");
    });

    it("falls back to localStorage sort direction when URL query is absent", () => {
        localStorage.setItem("sortDirection", "asc");
        window.history.replaceState(null, "", "/");
        expect(parseSortDirection()).toBe("asc");
    });

    it("allows only known view modes and falls back to the landing page otherwise", () => {
        window.history.replaceState(null, "", "/?view=dashboard");
        expect(parseViewMode()).toBe("dashboard");
        window.history.replaceState(null, "", "/?view=archive");
        expect(parseViewMode()).toBe("archive");
        window.history.replaceState(null, "", "/?view=curation");
        expect(parseViewMode()).toBe("curation");
        window.history.replaceState(null, "", "/?view=status");
        expect(parseViewMode()).toBe("status");
        window.history.replaceState(null, "", "/?view=bogus");
        expect(parseViewMode()).toBe(null);
        window.history.replaceState(null, "", "/");
        expect(parseViewMode()).toBe(null);
    });

    it("marks only the selected top nav link as active", () => {
        document.body.innerHTML = `
            <nav>
                <a class="site-welcome-link site-view-toggle-link" href="./"></a>
                <a class="site-dashboard-link site-view-toggle-link" href="?view=dashboard"></a>
                <a class="site-tests-link site-view-toggle-link" href="?view=tests"></a>
                <a class="site-diffs-link site-view-toggle-link" href="?view=compare"></a>
                <a class="site-params-link site-view-toggle-link" href="?view=params"></a>
                <a class="site-status-link site-view-toggle-link" href="?view=status"></a>
            </nav>
        `;

        syncTopNav("compare");

        expect(document.querySelector(".site-welcome-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-dashboard-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-tests-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-diffs-link").classList.contains("active")).toBe(true);
        expect(document.querySelector(".site-diffs-link").getAttribute("aria-current")).toBe("page");
        expect(document.querySelector(".site-params-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-status-link").classList.contains("active")).toBe(false);

        syncTopNav("status");
        expect(document.querySelector(".site-status-link").classList.contains("active")).toBe(true);
        expect(document.querySelector(".site-status-link").getAttribute("aria-current")).toBe("page");
        expect(document.querySelector(".site-diffs-link").classList.contains("active")).toBe(false);
    });

    it("marks welcome top nav link as active when no view is selected", () => {
        document.body.innerHTML = `
            <nav>
                <a class="site-welcome-link site-view-toggle-link" href="./"></a>
                <a class="site-dashboard-link site-view-toggle-link active" href="?view=dashboard" aria-current="page"></a>
                <a class="site-tests-link site-view-toggle-link active" href="?view=tests" aria-current="page"></a>
                <a class="site-diffs-link site-view-toggle-link active" href="?view=compare" aria-current="page"></a>
                <a class="site-params-link site-view-toggle-link active" href="?view=params" aria-current="page"></a>
            </nav>
        `;

        syncTopNav(null);

        expect(document.querySelector(".site-welcome-link").classList.contains("active")).toBe(true);
        expect(document.querySelector(".site-welcome-link").getAttribute("aria-current")).toBe("page");
        expect(document.querySelector(".site-dashboard-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-dashboard-link").hasAttribute("aria-current")).toBe(false);
        expect(document.querySelector(".site-tests-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-tests-link").hasAttribute("aria-current")).toBe(false);
        expect(document.querySelector(".site-diffs-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-diffs-link").hasAttribute("aria-current")).toBe(false);
        expect(document.querySelector(".site-params-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-params-link").hasAttribute("aria-current")).toBe(false);
    });

    it("marks dashboard top nav link as active when dashboard view is selected", () => {
        document.body.innerHTML = `
            <nav>
                <a class="site-welcome-link site-view-toggle-link" href="./"></a>
                <a class="site-dashboard-link site-view-toggle-link" href="?view=dashboard"></a>
                <a class="site-tests-link site-view-toggle-link" href="?view=tests"></a>
            </nav>
        `;

        syncTopNav("dashboard");
        const dashboardLink = document.querySelector('.site-view-toggle-link[href="?view=dashboard"]');

        expect(dashboardLink.classList.contains("active")).toBe(true);
        expect(dashboardLink.getAttribute("aria-current")).toBe("page");
        expect(document.querySelector(".site-welcome-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-tests-link").classList.contains("active")).toBe(false);
    });

    it("marks tests top nav link as active when tests view is selected", () => {
        document.body.innerHTML = `
            <nav>
                <a class="site-welcome-link site-view-toggle-link" href="./"></a>
                <a class="site-dashboard-link site-view-toggle-link" href="?view=dashboard"></a>
                <a class="site-diffs-link site-view-toggle-link" href="?view=compare"></a>
                <a class="site-params-link site-view-toggle-link" href="?view=params"></a>
                <a class="site-tests-link site-view-toggle-link" href="?view=tests"></a>
            </nav>
        `;

        syncTopNav("tests");
        const testsLink = document.querySelector('.site-view-toggle-link[href="?view=tests"]');

        expect(testsLink.classList.contains("active")).toBe(true);
        expect(testsLink.getAttribute("aria-current")).toBe("page");
        expect(document.querySelector(".site-diffs-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-diffs-link").hasAttribute("aria-current")).toBe(false);
        expect(document.querySelector(".site-params-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-params-link").hasAttribute("aria-current")).toBe(false);
    });

    it("marks archive top nav link as active when archive view is selected", () => {
        document.body.innerHTML = `
            <nav>
                <a class="site-welcome-link site-view-toggle-link" href="./"></a>
                <a class="site-dashboard-link site-view-toggle-link" href="?view=dashboard"></a>
                <a class="site-tests-link site-view-toggle-link" href="?view=tests"></a>
                <a class="site-archive-link site-view-toggle-link" href="?view=archive"></a>
            </nav>
        `;

        syncTopNav("archive");
        const archiveLink = document.querySelector('.site-view-toggle-link[href="?view=archive"]');

        expect(archiveLink.classList.contains("active")).toBe(true);
        expect(archiveLink.getAttribute("aria-current")).toBe("page");
        expect(document.querySelector(".site-tests-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-welcome-link").classList.contains("active")).toBe(false);
        expect(document.querySelector(".site-dashboard-link").classList.contains("active")).toBe(false);
    });

    it("renders the landing page with qualification conditions and resource links", () => {
        const html = renderLandingPage();
        expect(html).toContain("AIND Ephys pipeline qualification conditions");
        expect(html).toContain("<code>ElectricalSeries</code>");
        expect(html).toContain('href="?view=dashboard"');
        expect(html).toContain("qualifying-aind-content-ids");
        expect(html).toContain("Explore &amp; resources");
        expect(html).toContain('href="?view=curation"');
    });

    it("includes all test-only dandisets used to scope dashboard and tests views", () => {
        expect(TEST_DANDISETS.has("001849")).toBe(true);
        expect(TEST_DANDISETS.has("214527")).toBe(false);
    });

    it("DANDISET_SUBJECT_DEFAULTS maps null subject to 'test' for dandiset 001849", () => {
        expect(DANDISET_SUBJECT_DEFAULTS.get("001849")).toBe("test");
    });

    it("resolveSubject returns subject when non-null", () => {
        expect(resolveSubject("001849", "my-subject")).toBe("my-subject");
    });

    it("resolveSubject falls back to dandiset default when subject is null", () => {
        expect(resolveSubject("001849", null)).toBe("test");
    });

    it("resolveSubject returns null when no default exists and subject is null", () => {
        expect(resolveSubject("000001", null)).toBeNull();
    });

    it("classifies failure steps from task names", () => {
        expect(classifyFailedTaskStep("dispatch workflow")).toBe("job-dispatch");
        expect(classifyFailedTaskStep("pre_process data")).toBe("pre-processing");
        expect(classifyFailedTaskStep("post-processing upload")).toBe("post-processing");
        expect(classifyFailedTaskStep("other step")).toBe("other");
    });

    it("parses trace status and tasks", () => {
        const trace = [
            "name\tstatus\texit\tduration\trealtime\tnative_id",
            "step-one\tCOMPLETED\t0\t1m\t1m\t101",
            "step-two\tFAILED\t1\t2m\t2m\t102",
        ].join("\n");

        const parsed = parseTrace(trace);
        expect(parsed.status).toBe("failed");
        expect(parsed.tasks).toHaveLength(2);
        expect(parsed.tasks[1]).toMatchObject({ name: "step-two", status: "FAILED" });
    });

    it("derives run failure step priority from failed tasks", () => {
        expect(
            runFailureStep({
                status: "failed",
                tasks: [
                    { name: "dispatch workflow", status: "FAILED" },
                    { name: "post_process", status: "FAILED" },
                ],
            })
        ).toBe("post-processing");
    });

    it("filters runs by failure-step preset", () => {
        const runs = [
            { status: "failed", failureStep: "job-dispatch" },
            { status: "failed", failureStep: "pre-processing" },
            { status: "success", failureStep: null },
        ];

        const filtered = applyFilter(runs, { failureStep: "exclude-job-dispatch" });
        expect(filtered).toEqual([{ status: "failed", failureStep: "pre-processing" }]);
    });

    it("filters runs by status", () => {
        const runs = [
            { status: "success", id: 1 },
            { status: "failed", id: 2 },
            { status: "queued", id: 3 },
            { status: "running", id: 4 },
        ];

        expect(applyFilter(runs, { status: "failed" })).toEqual([{ status: "failed", id: 2 }]);
        expect(applyFilter(runs, { status: "SUCCESS" })).toEqual([{ status: "success", id: 1 }]);
        expect(applyFilter(runs, { status: "running" })).toEqual([{ status: "running", id: 4 }]);
    });

    it("excludes stalled runs from the running status filter", () => {
        const stalledCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const recentCreatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        const runs = [
            { status: "running", createdAt: stalledCreatedAt, id: 1 },
            { status: "running", createdAt: recentCreatedAt, id: 2 },
        ];

        expect(applyFilter(runs, { status: "running" })).toEqual([runs[1]]);
        expect(applyFilter(runs, { status: "stalled" })).toEqual([runs[0]]);
    });

    it("filters runs by params/config types and dandi codebase hash", async () => {
        await loadFixtureRegistries();
        const runs = [
            {
                paramsProfile: "4af6a25",
                configHash: "0d4bf36",
                generatedBy: [
                    { CodeURL: "https://github.com/dandi-compute/dandi-compute-core", Version: "1.0.0+abc1234" },
                ],
            },
            {
                paramsProfile: "98fd947",
                configHash: "6568dda",
                generatedBy: [
                    { CodeURL: "https://github.com/dandi-compute/dandi-compute-core/tree/main", Version: "def5678" },
                ],
            },
            {
                paramsProfile: "4af6a25",
                configHash: "0d4bf36",
                generatedBy: [{ CodeURL: "https://github.com/other/repo", Version: "xyz9876" }],
            },
            {
                paramsProfile: "aa073df",
                configHash: "6568dda",
                generatedBy: [
                    { CodeURL: "https://github.com/dandi-compute/dandi-compute-core", Version: "release-tag" },
                ],
            },
            {
                paramsProfile: "unknown-params",
                configHash: "unknown-config",
                generatedBy: [{ CodeURL: "https://github.com/dandi-compute/dandi-compute-core", Version: null }],
            },
        ];

        expect(applyFilter(runs, { paramsType: "deterministic" })).toEqual([runs[0], runs[2]]);
        expect(applyFilter(runs, { configType: "v1" })).toEqual([runs[0], runs[2]]);
        expect(applyFilter(runs, { paramsType: "4af6a25" })).toEqual([runs[0], runs[2]]);
        expect(applyFilter(runs, { configType: "0d4bf36" })).toEqual([runs[0], runs[2]]);
        expect(applyFilter(runs, { dandiCodebaseHash: "abc1234" })).toEqual([runs[0]]);
        expect(applyFilter(runs, { dandiCodebaseHash: "def5678" })).toEqual([runs[1]]);
        expect(applyFilter(runs, { dandiCodebaseHash: "release-tag" })).toEqual([runs[3]]);
        expect(applyFilter(runs, { dandiCodebaseHash: "missing" })).toEqual([]);
    });

    it("filters by dandi codebase hash for runs provenanced under the pre-rename repo name", async () => {
        await loadFixtureRegistries();
        const runs = [
            {
                paramsProfile: "4af6a25",
                configHash: "0d4bf36",
                generatedBy: [{ CodeURL: "https://github.com/dandi-compute/code", Version: "1.0.0+abc1234" }],
            },
            {
                paramsProfile: "98fd947",
                configHash: "6568dda",
                generatedBy: [{ CodeURL: "https://github.com/dandi-compute/code/tree/main", Version: "def5678" }],
            },
        ];

        expect(applyFilter(runs, { dandiCodebaseHash: "abc1234" })).toEqual([runs[0]]);
        expect(applyFilter(runs, { dandiCodebaseHash: "def5678" })).toEqual([runs[1]]);
    });

    it("parses run path segments", () => {
        const parsed = parseRunPath(
            "derivatives/dandiset-001697/sub-123/ses-456/pipeline-ephys/version-v2/params-fast_config-abcdef_attempt-3"
        );
        expect(parsed).toMatchObject({
            dandisetId: "001697",
            subject: "123",
            session: "456",
            pipelineName: "ephys",
            pipelineVersion: "v2",
            paramsProfile: "fast",
            configHash: "abcdef",
            attempt: 3,
        });
    });

    it("parses flattened version+capsule run path segments", () => {
        const parsed = parseRunPath(
            "derivatives/dandiset-214527/sub-test/ses-aind+sample/pipeline-aind+ephys/version-v1.1.1+b268fd2+5d20fd2_params-4af6a25_config-0d4bf36_date-2026+05+14_attempt-2"
        );
        expect(parsed).toMatchObject({
            dandisetId: "214527",
            subject: "test",
            session: "aind+sample",
            pipelineName: "aind+ephys",
            pipelineVersion: "v1.1.1+b268fd2+5d20fd2",
            paramsProfile: "4af6a25",
            configHash: "0d4bf36",
            runDate: null,
            attempt: 2,
        });
    });

    it("normalizeConfigHash strips _date- suffix from config hash", () => {
        expect(normalizeConfigHash("0d4bf36_date-2026+05+21")).toBe("0d4bf36");
        expect(normalizeConfigHash("0d4bf36")).toBe("0d4bf36");
        expect(normalizeConfigHash("0d4bf36_date-2026+05+14")).toBe("0d4bf36");
        expect(normalizeConfigHash("")).toBe("");
        expect(normalizeConfigHash(null)).toBeNull();
        expect(normalizeConfigHash(undefined)).toBeUndefined();
    });

    it("builds run path with session from JSONL entry", () => {
        const path = buildRunPath({
            dandiset_id: "000233",
            subject: "CGM3",
            session: "CGM3",
            pipeline: "aind+ephys",
            version: "v1.0.0+fixes+20abeb6",
            params: "98fd947",
            config: "6568dda",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-000233/sub-CGM3/ses-CGM3/pipeline-aind+ephys/version-v1.0.0+fixes+20abeb6_params-98fd947_config-6568dda_attempt-1"
        );
    });

    it("builds run path without session when session is null", () => {
        const path = buildRunPath({
            dandiset_id: "001469",
            subject: "Chronic-Implant-2",
            session: null,
            pipeline: "aind+ephys",
            version: "v1.0.0+fixes+20abeb6",
            params: "98fd947",
            config: "6568dda",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001469/sub-Chronic-Implant-2/pipeline-aind+ephys/version-v1.0.0+fixes+20abeb6_params-98fd947_config-6568dda_attempt-1"
        );
    });

    it("builds run path from dandi_path when subject/session fields are absent", () => {
        const path = buildRunPath({
            dandiset_id: "001747",
            dandi_path: "sub-chip19894/ses-recording049",
            pipeline: "aind+ephys",
            version: "v1.1.1+b268fd2",
            params: "98fd947",
            config: "6568dda",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001747/sub-chip19894/ses-recording049/pipeline-aind+ephys/version-v1.1.1+b268fd2_params-98fd947_config-6568dda_attempt-1"
        );
    });

    it("builds run path from NWB filename dandi_path by preserving the stem directory", () => {
        const path = buildRunPath({
            dandiset_id: "000363",
            dandi_path: "sub-480134/sub-480134_ses-20210107T120825_behavior+ecephys+ogen.nwb",
            pipeline: "aind+ephys",
            version: "v1.1.1+b268fd2+a0c5e04",
            params: "4af6a25",
            config: "0d4bf36",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-000363/sub-480134/sub-480134_ses-20210107T120825_behavior+ecephys+ogen/pipeline-aind+ephys/version-v1.1.1+b268fd2+a0c5e04_params-4af6a25_config-0d4bf36_attempt-1"
        );
    });

    it("builds run path from single-file ecephys dandi_path with filename stem directory", () => {
        const path = buildRunPath({
            dandiset_id: "001765",
            dandi_path: "sub-NP06/sub-NP06_ecephys.nwb",
            pipeline: "aind+ephys",
            version: "1.2.2+d2b6aef+be2047d",
            params: "e6a0e86",
            config: "0d4bf36",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001765/sub-NP06/sub-NP06_ecephys/pipeline-aind+ephys/version-1.2.2+d2b6aef+be2047d_params-e6a0e86_config-0d4bf36_attempt-1"
        );
    });

    it("builds run path from full dandi_path hierarchy when sourcedata segments are present", () => {
        const path = buildRunPath({
            dandiset_id: "001849",
            dandi_path: "sub-test/sourcedata/aind-sample/sub-test_ses-aind+sample_ecephys.nwb",
            pipeline: "aind+ephys",
            version: "v1.1.1+b268fd2+938ee17",
            params: "4af6a25",
            config: "0d4bf36",
            date: "2026+05+24",
            attempt: 1,
        });
        expect(path).toContain(
            "derivatives/dandiset-001849/sub-test/sourcedata/aind-sample/sub-test_ses-aind+sample_ecephys/pipeline-aind+ephys/version-v1.1.1+b268fd2+938ee17_params-4af6a25_config-0d4bf36"
        );
        expect(path).toContain("_attempt-1");
    });

    it("builds run path from dandi_path when sourcedata is before subject", () => {
        const path = buildRunPath({
            dandiset_id: "001470",
            dandi_path: "sourcedata/sub-M536/ses-2025+04+13/sub-M536_ses-2025-04-13_ecephys.nwb",
            pipeline: "aind+ephys",
            version: "1.2.2+d2b6aef+be2047d",
            params: "4af6a25",
            config: "0d4bf36",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001470/sourcedata/sub-M536/ses-2025+04+13/sub-M536_ses-2025-04-13_ecephys/pipeline-aind+ephys/version-1.2.2+d2b6aef+be2047d_params-4af6a25_config-0d4bf36_attempt-1"
        );
    });

    it("builds run path without date even when date field is present", () => {
        const path = buildRunPath({
            dandiset_id: "001849",
            subject: "test",
            session: null,
            pipeline: "aind+ephys",
            version: "v1.1.1+b268fd2+a66c8df",
            params: "4af6a25",
            config: "0d4bf36",
            date: "2026+05+21",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001849/sub-test/pipeline-aind+ephys/version-v1.1.1+b268fd2+a66c8df_params-4af6a25_config-0d4bf36_attempt-1"
        );
    });

    it("builds run path without date when date field is absent", () => {
        const path = buildRunPath({
            dandiset_id: "001849",
            subject: "test",
            session: null,
            pipeline: "aind+ephys",
            version: "v1.1.1+b268fd2+a66c8df",
            params: "4af6a25",
            config: "0d4bf36",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001849/sub-test/pipeline-aind+ephys/version-v1.1.1+b268fd2+a66c8df_params-4af6a25_config-0d4bf36_attempt-1"
        );
        expect(path).not.toContain("_date-");
    });

    it("maps null subject to default for dandiset 001849 in path", () => {
        const path = buildRunPath({
            dandiset_id: "001849",
            subject: null,
            session: null,
            pipeline: "aind+ephys",
            version: "v1.1.1+b268fd2+a66c8df",
            params: "4af6a25",
            config: "0d4bf36",
            date: "2026+05+21",
            attempt: 1,
        });
        expect(path).toBe(
            "derivatives/dandiset-001849/sub-test/pipeline-aind+ephys/version-v1.1.1+b268fd2+a66c8df_params-4af6a25_config-0d4bf36_attempt-1"
        );
    });

    it("parses JSONL queue entries into run objects", () => {
        const entries = [
            {
                dandiset_id: "000233",
                subject: "CGM3",
                session: "CGM3",
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "98fd947",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: true,
                asset_size_bytes: 1024,
            },
            {
                dandiset_id: "001469",
                subject: "Chronic-Implant-2",
                session: null,
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "aa073df",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: false,
            },
        ];
        const runs = parseQueueEntries(entries);
        expect(runs).toHaveLength(2);
        expect(runs[0]).toMatchObject({
            dandisetId: "000233",
            subject: "CGM3",
            session: "CGM3",
            pipelineName: "aind+ephys",
            pipelineVersion: "v1.0.0+fixes+20abeb6",
            paramsProfile: "98fd947",
            configHash: "6568dda",
            attempt: 1,
            hasCode: true,
            hasOutput: false,
            hasLogs: true,
            assetSizeBytes: 1024,
        });
        expect(runs[1].session).toBeNull();
        expect(runs[1].hasLogs).toBe(false);
        // null session should not appear in path
        expect(runs[1].path).not.toContain("ses-");
    });

    it("parses content_id from JSONL entries into run objects", () => {
        const entries = [
            {
                dandiset_id: "000233",
                subject: "CGM3",
                session: "CGM3",
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "98fd947",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
                content_id: "abcdef1234567890abcdef1234567890abcdef12",
            },
            {
                dandiset_id: "001469",
                subject: "Chronic-Implant-2",
                session: null,
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "aa073df",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: false,
            },
        ];
        const runs = parseQueueEntries(entries);
        expect(runs[0].contentHash).toBe("abcdef1234567890abcdef1234567890abcdef12");
        expect(runs[1].contentHash).toBeNull();
    });

    it("parses created_at from JSONL entries into run objects", () => {
        const entries = [
            {
                dandiset_id: "000233",
                subject: "CGM3",
                session: "CGM3",
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "98fd947",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
                created_at: "2026-05-20T09:15:00Z",
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs[0].createdAt).toBe("2026-05-20T09:15:00Z");
        expect(runs[0].runDate).toBe("2026-05-20T09:15:00Z");
    });

    it("omits _date- from path and falls back to date for runDate when entry has date field", () => {
        const entries = [
            {
                dandiset_id: "001849",
                subject: "test",
                session: null,
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2+a66c8df",
                params: "4af6a25",
                config: "0d4bf36",
                date: "2026+05+21",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs[0].path).toBe(
            "derivatives/dandiset-001849/sub-test/pipeline-aind+ephys/version-v1.1.1+b268fd2+a66c8df_params-4af6a25_config-0d4bf36_attempt-1"
        );
        expect(runs[0].runDate).toBe("2026+05+21");
    });

    it("strips _date- suffix from configHash when entry.config embeds the date", () => {
        const entries = [
            {
                dandiset_id: "001849",
                subject: "test",
                session: null,
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2+a66c8df",
                params: "4af6a25",
                config: "0d4bf36_date-2026+05+21",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs[0].configHash).toBe("0d4bf36");
    });

    it("prefers created_at over date for runDate when both are present", () => {
        const entries = [
            {
                dandiset_id: "001849",
                subject: "test",
                session: null,
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2+a66c8df",
                params: "4af6a25",
                config: "0d4bf36",
                date: "2026+05+21",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
                created_at: "2026-05-21T14:30:00Z",
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs[0].runDate).toBe("2026-05-21T14:30:00Z");
    });

    it("maps null subject to 'test' for dandiset 001849 in parseQueueEntries", () => {
        const entries = [
            {
                dandiset_id: "001849",
                subject: null,
                session: null,
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2+a66c8df",
                params: "4af6a25",
                config: "0d4bf36",
                date: "2026+05+21",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs[0].subject).toBe("test");
        expect(runs[0].path).toBe(
            "derivatives/dandiset-001849/sub-test/pipeline-aind+ephys/version-v1.1.1+b268fd2+a66c8df_params-4af6a25_config-0d4bf36_attempt-1"
        );
    });

    it("parses subject and session from dandi_path when queue entry omits fields", () => {
        const entries = [
            {
                dandiset_id: "001747",
                dandi_path: "sub-chip19894/ses-recording049",
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2",
                params: "98fd947",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
            subject: "chip19894",
            session: "recording049",
            path: "derivatives/dandiset-001747/sub-chip19894/ses-recording049/pipeline-aind+ephys/version-v1.1.1+b268fd2_params-98fd947_config-6568dda_attempt-1",
        });
    });

    it("extracts session from NWB filename in dandi_path", () => {
        const entries = [
            {
                dandiset_id: "000363",
                dandi_path: "sub-480134/sub-480134_ses-20210107T120825_behavior+ecephys+ogen.nwb",
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2+a0c5e04",
                params: "4af6a25",
                config: "0d4bf36",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
            subject: "480134",
            session: "20210107T120825",
            path: "derivatives/dandiset-000363/sub-480134/sub-480134_ses-20210107T120825_behavior+ecephys+ogen/pipeline-aind+ephys/version-v1.1.1+b268fd2+a0c5e04_params-4af6a25_config-0d4bf36_attempt-1",
        });
    });

    it("preserves sourcedata hierarchy from dandi_path in run path", () => {
        const entries = [
            {
                dandiset_id: "001849",
                dandi_path: "sub-test/sourcedata/aind-sample/sub-test_ses-aind+sample_ecephys.nwb",
                pipeline: "aind+ephys",
                version: "v1.1.1+b268fd2+938ee17",
                params: "4af6a25",
                config: "0d4bf36",
                date: "2026+05+24",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
            subject: "test",
            session: "aind+sample",
        });
        expect(runs[0].path).toContain(
            "derivatives/dandiset-001849/sub-test/sourcedata/aind-sample/sub-test_ses-aind+sample_ecephys/pipeline-aind+ephys/version-v1.1.1+b268fd2+938ee17_params-4af6a25_config-0d4bf36"
        );
        expect(runs[0].runDate).toBe("2026+05+24");
    });

    it("preserves full dandi_path hierarchy when sourcedata precedes subject", () => {
        const entries = [
            {
                dandiset_id: "001470",
                dandi_path: "sourcedata/sub-M536/ses-2025+04+13/sub-M536_ses-2025-04-13_ecephys.nwb",
                pipeline: "aind+ephys",
                version: "1.2.2+d2b6aef+be2047d",
                params: "4af6a25",
                config: "0d4bf36",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: true,
            },
        ];
        const runs = parseQueueEntries(entries);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
            subject: "M536",
            session: "2025+04+13",
            dandiPath: "sourcedata/sub-M536/ses-2025+04+13/sub-M536_ses-2025-04-13_ecephys.nwb",
            path: "derivatives/dandiset-001470/sourcedata/sub-M536/ses-2025+04+13/sub-M536_ses-2025-04-13_ecephys/pipeline-aind+ephys/version-1.2.2+d2b6aef+be2047d_params-4af6a25_config-0d4bf36_attempt-1",
        });
    });

    it("returns null session from dandi_path when NWB filename has no ses- entity", () => {
        const entries = [
            {
                dandiset_id: "001469",
                dandi_path: "sub-Chronic-Implant-2/sub-Chronic-Implant-2_obj-nvg8om_ecephys.nwb",
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "98fd947",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: true,
                has_logs: true,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
            subject: "Chronic-Implant-2",
            session: null,
            path: "derivatives/dandiset-001469/sub-Chronic-Implant-2/sub-Chronic-Implant-2_obj-nvg8om_ecephys/pipeline-aind+ephys/version-v1.0.0+fixes+20abeb6_params-98fd947_config-6568dda_attempt-1",
        });
    });

    it("parses has_been_submitted from JSONL entries into hasBeenSubmitted field", () => {
        const entries = [
            {
                dandiset_id: "001849",
                dandi_path: "sourcedata/aind-sample.nwb",
                pipeline: "aind+ephys",
                version: "v1.2.2",
                params: "1cbdbee",
                config: "0d4bf36",
                attempt: 1,
                has_code: true,
                has_been_submitted: true,
                has_output: false,
                has_logs: false,
                asset_size_bytes: 580204232,
                content_id: "048d1ee9-83b7-491f-8f02-1ca615b1d455",
                created_at: "2026-06-05T02:39:15.523551-04:00",
            },
            {
                dandiset_id: "000233",
                subject: "CGM3",
                session: "CGM3",
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "98fd947",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_been_submitted: false,
                has_output: false,
                has_logs: false,
            },
            {
                dandiset_id: "001469",
                subject: "Chronic-Implant-2",
                session: null,
                pipeline: "aind+ephys",
                version: "v1.0.0+fixes+20abeb6",
                params: "aa073df",
                config: "6568dda",
                attempt: 1,
                has_code: true,
                has_output: false,
                has_logs: false,
            },
        ];

        const runs = parseQueueEntries(entries);
        expect(runs[0].hasBeenSubmitted).toBe(true);
        expect(runs[1].hasBeenSubmitted).toBe(false);
        expect(runs[2].hasBeenSubmitted).toBe(false);
    });
});

describe("treeUrl", () => {
    it("builds a GitHub tree URL with /tree/ for a run path with session", () => {
        const path =
            "derivatives/dandiset-000363/sub-480134/ses-20210107T120825/pipeline-aind+ephys/version-v1.1.1+b268fd2+a0c5e04_params-4af6a25_config-0d4bf36_attempt-1";
        const url = treeUrl(path);
        expect(url).toBe(
            "https://github.com/dandi-compute/001697/tree/draft/" +
                "derivatives/dandiset-000363/sub-480134/ses-20210107T120825/pipeline-aind%2Bephys/version-v1.1.1%2Bb268fd2%2Ba0c5e04_params-4af6a25_config-0d4bf36_attempt-1"
        );
    });

    describe("derivativesUrl", () => {
        it("builds a DANDI Archive files URL for a run path with session", () => {
            const path =
                "derivatives/dandiset-001849/sourcedata/aind-sample/pipeline-aind+ephys/version-v1.1.1+b268fd2+398f3c4_params-4af6a25_config-0d4bf36_date-2026+05+24_attempt-1";
            const url = derivativesUrl(path);
            expect(url).toBe(
                "https://dandiarchive.org/dandiset/001697/draft/files?location=" +
                    "derivatives/dandiset-001849/sourcedata/aind-sample/pipeline-aind%2Bephys/" +
                    "version-v1.1.1%2Bb268fd2%2B398f3c4_params-4af6a25_config-0d4bf36_date-2026%2B05%2B24_attempt-1&page=1"
            );
        });

        it("omits leading/trailing slashes in encoded location", () => {
            const url = derivativesUrl(
                "/derivatives/dandiset-001470/sub-M536/ses-2025+04+13/pipeline-aind+ephys/version-v1.2.2+d2b6aef+be2047d_params-4af6a25_config-0d4bf36_attempt-1/"
            );
            expect(url).toContain("location=derivatives/dandiset-001470/sub-M536/ses-2025%2B04%2B13/");
            expect(url).toContain("&page=1");
        });
    });

    it("renderFlatList labels the dandiset root link as Sourcedata", () => {
        const html = renderFlatList([
            {
                status: "success",
                hasLogs: false,
                tasks: [],
                generatedBy: [],
                vizData: [],
                dandiPath: "sub-NP06/sub-NP06_ecephys.nwb",
                inSourcedata: false,
                subject: "NP06",
                attempt: 1,
                path: "derivatives/dandiset-001765/sub-NP06/sub-NP06_ecephys/pipeline-aind+ephys/version-1.2.2+d2b6aef+be2047d_params-e6a0e86_config-0d4bf36_attempt-1",
                dandisetId: "001765",
                paramsProfile: "e6a0e86",
                configHash: "0d4bf36",
                runDate: "2026-05-24",
            },
        ]);
        expect(html).toContain("Sourcedata&nbsp;↖");
        expect(html).not.toContain("DANDI&nbsp;↖");
    });

    it("renderFlatList links Path to the parent directory of NWB dandi_path", () => {
        const html = renderFlatList([
            {
                status: "success",
                hasLogs: false,
                tasks: [],
                generatedBy: [],
                vizData: [],
                dandiPath: "sub-NP06/sub-NP06_ecephys.nwb",
                inSourcedata: false,
                subject: "NP06",
                attempt: 1,
                path: "derivatives/dandiset-001765/sub-NP06/sub-NP06_ecephys/pipeline-aind+ephys/version-1.2.2+d2b6aef+be2047d_params-e6a0e86_config-0d4bf36_attempt-1",
                dandisetId: "001765",
                paramsProfile: "e6a0e86",
                configHash: "0d4bf36",
                runDate: "2026-05-24",
            },
        ]);
        expect(html).toContain("location=sub-NP06%2F");
        expect(html).not.toContain("location=sub-NP06%2Fsub-NP06_ecephys");
    });

    it("builds a GitHub tree URL without session when session is absent", () => {
        const path =
            "derivatives/dandiset-001469/sub-Chronic-Implant-2/pipeline-aind+ephys/version-v1.0.0_params-98fd947_config-6568dda_attempt-1";
        const url = treeUrl(path);
        expect(url).toContain("https://github.com/dandi-compute/001697/tree/draft/");
        expect(url).not.toContain("/blob/");
    });
});

describe("Neurosift URL helpers", () => {
    it("neurosiftBlobUrl builds correct S3 blob URL", () => {
        const hash = "abcdef1234567890abcdef1234567890abcdef12";
        const url = neurosiftBlobUrl(hash);
        expect(url).toBe(
            "https://neurosift.app/nwb?url=" +
                encodeURIComponent(
                    "https://dandiarchive.s3.amazonaws.com/blobs/abc/def/abcdef1234567890abcdef1234567890abcdef12"
                )
        );
    });

    it("neurosiftDandisetUrl builds correct dandiset URL", () => {
        expect(neurosiftDandisetUrl("000233")).toBe("https://neurosift.app/dandiset/000233");
    });

    it("neurosiftSessionUrl prefers blob URL when contentHash is present", () => {
        const hash = "abcdef1234567890abcdef1234567890abcdef12";
        const url = neurosiftSessionUrl("000233", hash);
        expect(url).toContain("neurosift.app/nwb?url=");
        expect(url).toContain(encodeURIComponent("dandiarchive.s3.amazonaws.com/blobs/abc/def/"));
    });

    it("neurosiftSessionUrl returns null when contentHash is absent", () => {
        expect(neurosiftSessionUrl("000233", null)).toBeNull();
    });
});

// jobs.tsv and paths.tsv aren't referenced by a known content-id (unlike a
// run's output artifacts), so fetchQueueState/fetchArchiveState resolve them in
// two steps: (1) fetch the Dandiset's `assets.jsonld` manifest and find the
// entries whose `path` is "derivatives/jobs.tsv" and "derivatives/paths.tsv",
// (2) fetch their S3 blob contentUrls. These helpers build fixtures/mocks for
// both steps.
// Blob URLs are cached forever in a module-level, cross-test in-memory map
// (see clearBlobMemoryCache's docstring in app.js), so each call defaults to
// fresh content ids -- reusing one across tests would make a later test's
// "fetch" a stale cache hit from an earlier test's fixture.
let _tableBlobCounter = 0;
function tableBlobUrl(contentId = `tb${String(_tableBlobCounter++).padStart(38, "0")}`) {
    return `https://dandiarchive.s3.amazonaws.com/blobs/${contentId.slice(0, 3)}/${contentId.slice(3, 6)}/${contentId}`;
}

function assetsJsonldManifest({ jobsBlobUrl, pathsBlobUrl }) {
    return JSON.stringify(
        [
            ["derivatives/jobs.tsv", jobsBlobUrl],
            ["derivatives/paths.tsv", pathsBlobUrl],
        ]
            .filter(([, blobUrl]) => blobUrl)
            .map(([path, blobUrl]) => ({
                path,
                contentUrl: ["https://api.dandiarchive.org/api/assets/some-id/download/", blobUrl],
            }))
    );
}

function assetsJsonldUrlFor(dandisetId) {
    return `https://dandiarchive.s3.amazonaws.com/dandisets/${dandisetId}/draft/assets.jsonld`;
}

// Route a mock fetch: the manifest URL for *dandisetId* serves *manifestBody*
// (default: pointing at both blob URLs), and each blob URL serves its table.
// Anything else 404s. Returns the mock so callers can inspect its call log.
function installQueueTablesFetch({
    dandisetId,
    jobsTsv,
    pathsTsv = makePathsTsv([]),
    jobsBlobUrl = tableBlobUrl(),
    pathsBlobUrl = tableBlobUrl(),
    manifestBody,
    manifestHeaders = { ETag: '"manifest-etag"' },
}) {
    const manifest = manifestBody ?? assetsJsonldManifest({ jobsBlobUrl, pathsBlobUrl });
    const mock = vi.fn(async (url) => {
        const u = String(url);
        if (u === assetsJsonldUrlFor(dandisetId)) {
            return new Response(manifest, { status: 200, headers: manifestHeaders });
        }
        if (u === jobsBlobUrl) return new Response(jobsTsv, { status: 200 });
        if (u === pathsBlobUrl) return new Response(pathsTsv, { status: 200 });
        return new Response(null, { status: 404 });
    });
    global.fetch = mock;
    return { mock, jobsBlobUrl, pathsBlobUrl };
}

const CAPSULE_DIRECTORY =
    "derivatives/dandisets-000/dandiset-000397/sub-Pt01/sub-Pt01_ecephys/pipeline-aind+ephys/job-26070830b5ff";

const SAMPLE_JOB = {
    job_id: "job-26070830b5ff",
    dandiset_id: "000397",
    within_dandiset_path: "sub-Pt01/sub-Pt01_ecephys.nwb",
    pipeline: "aind+ephys",
    version: "v1.2.4",
    params: "1cbdbee",
    config: "7940dfd",
    codebase: "v0.3.49",
    content_id: "c4e36f4d-132d-4153-ab18-41b46fc0ccab",
    asset_size_bytes: 9005377211,
    status: "successful",
    created_at: "2026-09-17T11:52:06.988488-04:00",
    job_submission_time: "2026-09-17T11:52:07.195344-04:00",
    job_completion_time: "2026-09-17T11:52:10.675168-04:00",
};

const SAMPLE_PATHS = [
    { job_id: SAMPLE_JOB.job_id, path: `${CAPSULE_DIRECTORY}/dataset_description.json`, content_id: "dd-blob" },
    { job_id: SAMPLE_JOB.job_id, path: `${CAPSULE_DIRECTORY}/logs/trace.txt`, content_id: "trace-blob" },
    {
        job_id: SAMPLE_JOB.job_id,
        path: `${CAPSULE_DIRECTORY}/derivatives/visualization/psd.png`,
        content_id: "png-blob",
    },
];

describe("fetchQueueState", () => {
    let originalFetch;

    beforeEach(() => {
        sessionStorage.clear();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        sessionStorage.clear();
    });

    it("resolves jobs.tsv and paths.tsv via assets.jsonld, then joins them into entries", async () => {
        installQueueTablesFetch({
            dandisetId: "001697",
            jobsTsv: makeJobsTsv([SAMPLE_JOB]),
            pathsTsv: makePathsTsv(SAMPLE_PATHS),
        });

        const [entry] = await fetchQueueState();

        expect(entry.job_id).toBe("job-26070830b5ff");
        expect(entry.dandiset_id).toBe("000397");
        expect(entry.dandi_path).toBe("sub-Pt01/sub-Pt01_ecephys.nwb");
        expect(entry.run_path).toBe(CAPSULE_DIRECTORY);
        expect(entry.asset_size_bytes).toBe(9005377211);
        expect(entry.dataset_description_path).toEqual({
            [`${CAPSULE_DIRECTORY}/dataset_description.json`]: "dd-blob",
        });
        expect(entry.output_paths).toEqual({
            [`${CAPSULE_DIRECTORY}/logs/trace.txt`]: "trace-blob",
            [`${CAPSULE_DIRECTORY}/derivatives/visualization/psd.png`]: "png-blob",
        });
        expect(entry.has_output).toBe(true);
        expect(entry.has_logs).toBe(true);
    });

    it("feeds parseQueueEntries the capsule directory and job id", async () => {
        installQueueTablesFetch({
            dandisetId: "001697",
            jobsTsv: makeJobsTsv([SAMPLE_JOB]),
            pathsTsv: makePathsTsv(SAMPLE_PATHS),
        });

        const [run] = parseQueueEntries(await fetchQueueState());

        expect(run.path).toBe(CAPSULE_DIRECTORY);
        expect(run.jobId).toBe("job-26070830b5ff");
        expect(run.subject).toBe("Pt01");
        expect(run.datasetDescriptionPath).toBe(`${CAPSULE_DIRECTORY}/dataset_description.json`);
        expect(run.outputPaths[`${CAPSULE_DIRECTORY}/dataset_description.json`]).toBe("dd-blob");
    });

    it.each([
        ["pending", [], { has_been_submitted: false, has_output: false, has_logs: false }, "queued"],
        ["stalled", [], { has_been_submitted: true, has_output: false, has_logs: false }, "running"],
        ["failed", [], { has_been_submitted: true, has_output: false, has_logs: true }, "failed"],
        ["successful", [], { has_been_submitted: true, has_output: true, has_logs: false }, "success"],
        ["successful", ["logs/trace.txt"], { has_been_submitted: true, has_output: true, has_logs: true }, "success"],
    ])(
        "maps a %s capsule with extra paths %j onto flags %j (page status %s)",
        async (status, extra, flags, pageStatus) => {
            const pathRows = [
                { job_id: "job-1", path: "derivatives/x/job-1/dataset_description.json", content_id: "dd" },
                ...extra.map((relative) => ({
                    job_id: "job-1",
                    path: `derivatives/x/job-1/${relative}`,
                    content_id: "b",
                })),
            ];
            installQueueTablesFetch({
                dandisetId: "001697",
                jobsTsv: makeJobsTsv([{ ...SAMPLE_JOB, job_id: "job-1", status }]),
                pathsTsv: makePathsTsv(pathRows),
            });

            const [entry] = await fetchQueueState();

            expect({
                has_been_submitted: entry.has_been_submitted,
                has_output: entry.has_output,
                has_logs: entry.has_logs,
            }).toEqual(flags);
            expect(deriveFlagStatus(parseQueueEntries([entry])[0])).toBe(pageStatus);
        }
    );

    it("takes the capsule's own dataset_description.json over nested ones", async () => {
        installQueueTablesFetch({
            dandisetId: "001697",
            jobsTsv: makeJobsTsv([SAMPLE_JOB]),
            pathsTsv: makePathsTsv([
                {
                    job_id: SAMPLE_JOB.job_id,
                    path: `${CAPSULE_DIRECTORY}/derivatives/nwb/dataset_description.json`,
                    content_id: "nested",
                },
                ...SAMPLE_PATHS,
            ]),
        });

        const [entry] = await fetchQueueState();

        expect(entry.run_path).toBe(CAPSULE_DIRECTORY);
        expect(entry.output_paths[`${CAPSULE_DIRECTORY}/derivatives/nwb/dataset_description.json`]).toBe("nested");
    });

    it("caches the assets.jsonld manifest lookup with ETag-based revalidation", async () => {
        const { mock, jobsBlobUrl, pathsBlobUrl } = installQueueTablesFetch({
            dandisetId: "001697",
            jobsTsv: makeJobsTsv([SAMPLE_JOB]),
            pathsTsv: makePathsTsv(SAMPLE_PATHS),
        });
        mock.mockImplementationOnce(
            async () =>
                new Response(assetsJsonldManifest({ jobsBlobUrl, pathsBlobUrl }), {
                    status: 200,
                    headers: { ETag: '"manifest-v1"' },
                })
        );

        await fetchQueueState();

        // Manifest ETag/body must be stored under queueStateCacheKey.
        const stored = JSON.parse(sessionStorage.getItem(QUEUE_STATE_CACHE_KEY));
        expect(stored.etag).toBe('"manifest-v1"');

        // A second call must revalidate the manifest with If-None-Match...
        const manifestUrl = assetsJsonldUrlFor("001697");
        mock.mockImplementationOnce(async (url, init) => {
            expect(String(url)).toBe(manifestUrl);
            expect(init.headers.get("If-None-Match")).toBe('"manifest-v1"');
            return new Response(null, { status: 304 });
        });

        const result = await fetchQueueState();
        expect(result).toHaveLength(1);

        // ...and must not re-fetch either (content-addressed, already-cached) table.
        for (const blobUrl of [jobsBlobUrl, pathsBlobUrl]) {
            const blobCallCount = mock.mock.calls.filter(([url]) => String(url) === blobUrl).length;
            expect(blobCallCount).toBe(1);
        }
    });

    it.each([
        ["derivatives/jobs.tsv", { pathsBlobUrl: tableBlobUrl(), jobsBlobUrl: null }],
        ["derivatives/paths.tsv", { jobsBlobUrl: tableBlobUrl(), pathsBlobUrl: null }],
    ])("throws when %s is absent from the manifest", async (missingPath, blobUrls) => {
        installQueueTablesFetch({
            dandisetId: "001697",
            jobsTsv: makeJobsTsv([SAMPLE_JOB]),
            manifestBody: assetsJsonldManifest(blobUrls),
        });
        await expect(fetchQueueState()).rejects.toThrow(`${missingPath} not found in Dandiset 001697's asset listing`);
    });

    it("throws an access-denied error when the manifest fetch returns 403", async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
        await expect(fetchQueueState()).rejects.toThrow("Access denied");
    });

    it("throws a rate-limit error when the manifest fetch returns 429", async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
        await expect(fetchQueueState()).rejects.toThrow("rate limit");
    });

    it("throws a generic error on other manifest HTTP failures", async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
        await expect(fetchQueueState()).rejects.toThrow("HTTP 500");
    });

    it("throws when a resolved table fails to load", async () => {
        const jobsBlobUrl = tableBlobUrl();
        const pathsBlobUrl = tableBlobUrl();
        global.fetch = vi.fn(async (url) => {
            if (String(url) === assetsJsonldUrlFor("001697")) {
                return new Response(assetsJsonldManifest({ jobsBlobUrl, pathsBlobUrl }), { status: 200 });
            }
            return new Response(null, { status: 500 });
        });
        await expect(fetchQueueState()).rejects.toThrow("HTTP 500");
    });

    it("returns an empty array for an empty jobs.tsv", async () => {
        installQueueTablesFetch({ dandisetId: "001697", jobsTsv: "" });
        expect(await fetchQueueState()).toEqual([]);
    });

    it("returns an empty array for a header-only jobs.tsv", async () => {
        installQueueTablesFetch({ dandisetId: "001697", jobsTsv: makeJobsTsv([]) });
        expect(await fetchQueueState()).toEqual([]);
    });

    it("parses RFC4180-quoted cells (paths containing embedded quotes)", async () => {
        const quotedPath = `${CAPSULE_DIRECTORY}/logs/a "with quotes".txt`;
        installQueueTablesFetch({
            dandisetId: "001697",
            jobsTsv: makeJobsTsv([{ ...SAMPLE_JOB, content_id: null, created_at: null }]),
            pathsTsv: makePathsTsv([...SAMPLE_PATHS, { job_id: SAMPLE_JOB.job_id, path: quotedPath, content_id: "q" }]),
        });

        const [result] = await fetchQueueState();

        expect(result.output_paths[quotedPath]).toBe("q");
        expect(result.content_id).toBeNull();
        expect(result.created_at).toBeNull();
    });
});

describe("fetchArchiveState", () => {
    const ARCHIVE_CACHE_KEY = archiveStateCacheKey();

    let originalFetch;

    beforeEach(() => {
        sessionStorage.clear();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        sessionStorage.clear();
    });

    it("resolves against the archive Dandiset's assets.jsonld, not the main queue's", async () => {
        const { mock } = installQueueTablesFetch({
            dandisetId: "001873",
            jobsTsv: makeJobsTsv([{ ...SAMPLE_JOB, dandiset_id: "000409", status: "failed" }]),
            pathsTsv: makePathsTsv(SAMPLE_PATHS),
        });

        const result = await fetchArchiveState();

        expect(result).toHaveLength(1);
        expect(result[0].dandiset_id).toBe("000409");

        // Must request the archive Dandiset's manifest, not the main one's.
        const requestedUrls = mock.mock.calls.map(([url]) => String(url));
        expect(requestedUrls).toContain(assetsJsonldUrlFor("001873"));
        expect(requestedUrls).not.toContain(assetsJsonldUrlFor("001697"));

        // Manifest cached under the archive-specific key.
        expect(sessionStorage.getItem(ARCHIVE_CACHE_KEY)).not.toBeNull();
    });

    it("uses a cache key distinct from the main queue state", () => {
        expect(archiveStateCacheKey()).not.toBe(QUEUE_STATE_CACHE_KEY);
    });
});

describe("clearQueueStateCache", () => {
    afterEach(() => {
        sessionStorage.clear();
    });

    it("removes both the main and archive assets.jsonld manifest caches", () => {
        sessionStorage.setItem(queueStateCacheKey(), JSON.stringify({ etag: '"a"', body: "[]" }));
        sessionStorage.setItem(archiveStateCacheKey(), JSON.stringify({ etag: '"b"', body: "[]" }));

        clearQueueStateCache();

        expect(sessionStorage.getItem(queueStateCacheKey())).toBeNull();
        expect(sessionStorage.getItem(archiveStateCacheKey())).toBeNull();
    });
});

describe("pipeline registries", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        sessionStorage.clear();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        sessionStorage.clear();
    });

    it("normalizes registry entries and assigns fallback priority", () => {
        expect(
            normalizeRegistryEntries({
                deterministic: { path: "name-deterministic.json", md5: "ABCDEF0123" },
                default: { path: "name-deterministic.json", md5: "ABCDEF0123" },
                broken: { path: "missing-md5" },
            })
        ).toEqual([
            {
                alias: "deterministic",
                md5: "abcdef0123",
                path: "name-deterministic.json",
                priority: 1,
            },
            {
                alias: "default",
                md5: "abcdef0123",
                path: "name-deterministic.json",
                priority: 0,
            },
        ]);
    });

    it("loads params and config registries from GitHub registry files", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(REGISTERED_PARAMS_FIXTURE), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(REGISTERED_CONFIGS_FIXTURE), { status: 200 }));

        const registries = await loadAindPipelineRegistries();

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[0][0]).toContain(
            "/src/dandi_compute_code/aind_ephys_pipeline/registries/registered_params.json"
        );
        expect(global.fetch.mock.calls[1][0]).toContain(
            "/src/dandi_compute_code/aind_ephys_pipeline/registries/registered_configs.json"
        );
        expect(registries.paramsRegistry).toEqual(
            expect.arrayContaining([expect.objectContaining({ alias: "deterministic" })])
        );
        expect(registries.configRegistry).toEqual(expect.arrayContaining([expect.objectContaining({ alias: "v1" })]));
    });

    it("keeps the last loaded registries when GitHub fetch fails", async () => {
        await loadFixtureRegistries();
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

        const registries = await loadAindPipelineRegistries();

        expect(registries.paramsRegistry).toEqual(
            expect.arrayContaining([expect.objectContaining({ alias: "deterministic" })])
        );
        expect(registries.configRegistry).toEqual(expect.arrayContaining([expect.objectContaining({ alias: "v1" })]));
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

describe("curation page", () => {
    const RUN_PATH =
        "derivatives/dandisets-000/dandiset-000397/sub-Pt01/sub-Pt01_ecephys/pipeline-aind+ephys/job-26070830b5ff";
    const makeRun = (overrides = {}) => ({
        status: "success",
        attempt: 1,
        tasks: [],
        generatedBy: [],
        vizData: null,
        logFiles: [],
        path: RUN_PATH,
        jobId: "job-26070830b5ff",
        dandiPath: "sub-Pt01/sub-Pt01_ecephys.nwb",
        dandisetId: "000397",
        subject: "Pt01",
        session: null,
        pipelineName: "aind+ephys",
        pipelineVersion: "v1.2.4",
        paramsProfile: "1cbdbee",
        configHash: "7940dfd",
        outputPaths: {
            [`${RUN_PATH}/derivatives/postprocessed/block0_acquisition-ElectricalSeriesProbe01AP_recording1.zarr`]:
                "22222222-2222-2222-2222-222222222222",
            [`${RUN_PATH}/derivatives/postprocessed/block0_acquisition-ElectricalSeriesProbe00AP_recording1.zarr`]:
                "11111111-1111-1111-1111-111111111111",
            [`${RUN_PATH}/derivatives/visualization/drift_map.png`]: "77fdae74-59bc-44d3-ba30-5cd70322fd65",
            [`${RUN_PATH}/logs/trace.txt`]: "5be809fd-5534-451c-bca2-d738df07b8ea",
        },
        ...overrides,
    });

    it("lists the run's postprocessed Zarr analyzers with their S3 locations, sorted by recording", () => {
        expect(runPostprocessedAnalyzers(makeRun())).toEqual([
            {
                name: "block0_acquisition-ElectricalSeriesProbe00AP_recording1",
                zarrId: "11111111-1111-1111-1111-111111111111",
                url: "s3://dandiarchive/zarr/11111111-1111-1111-1111-111111111111/",
            },
            {
                name: "block0_acquisition-ElectricalSeriesProbe01AP_recording1",
                zarrId: "22222222-2222-2222-2222-222222222222",
                url: "s3://dandiarchive/zarr/22222222-2222-2222-2222-222222222222/",
            },
        ]);
    });

    it("ignores files outside postprocessed/ and nested or non-Zarr entries", () => {
        const run = makeRun({
            outputPaths: {
                [`${RUN_PATH}/derivatives/postprocessed/rec.zarr/zarr.json`]: "aaaaaaaa",
                [`${RUN_PATH}/derivatives/postprocessed/notes.json`]: "bbbbbbbb",
                [`${RUN_PATH}/derivatives/curated/rec.zarr`]: "cccccccc",
            },
        });
        expect(runPostprocessedAnalyzers(run)).toEqual([]);
        expect(runPostprocessedAnalyzers({ path: RUN_PATH })).toEqual([]);
    });

    it("fills the script with the job's Zarr IDs, capsule path, and a per-job curation file", () => {
        const script = curationScript(curationScriptValues(makeRun()));
        expect(script).toContain("# Curate job-26070830b5ff with SpikeInterface GUI");
        expect(script).toContain(`# Job capsule: ${RUN_PATH}`);
        expect(script).toContain(
            '    "block0_acquisition-ElectricalSeriesProbe00AP_recording1": "s3://dandiarchive/zarr/11111111-1111-1111-1111-111111111111/",'
        );
        expect(script).toContain(
            '    "block0_acquisition-ElectricalSeriesProbe01AP_recording1": "s3://dandiarchive/zarr/22222222-2222-2222-2222-222222222222/",'
        );
        expect(script).toContain("# This job has 2 recordings; pick the one to curate.");
        expect(script).toContain('RECORDING = "block0_acquisition-ElectricalSeriesProbe00AP_recording1"');
        expect(script).toContain('CURATION_FILE = Path(f"job-26070830b5ff_{RECORDING}_curation.json")');
        expect(script).toContain("load_sorting_analyzer(ANALYZERS[RECORDING], load_extensions=False)");
        expect(script).toContain("curation_callback=save_curation");
    });

    it("omits the recording hint for single-recording jobs and falls back to the capsule name for the job", () => {
        const run = makeRun({
            jobId: null,
            outputPaths: {
                [`${RUN_PATH}/derivatives/postprocessed/rec1.zarr`]: "0aca22c2-1af0-496e-a1da-7e34ecd07c18",
            },
        });
        const script = curationScript(curationScriptValues(run));
        expect(script).not.toContain("pick the one to curate");
        expect(script).toContain('RECORDING = "rec1"');
        expect(script).toContain("# Curate job-26070830b5ff with SpikeInterface GUI");
    });

    it("uses placeholders for every job-specific value when no job is given", () => {
        const script = curationScript(curationScriptValues());
        expect(script).toContain("# Curate <JOB_ID> with SpikeInterface GUI");
        expect(script).toContain("# Job capsule: <JOB_CAPSULE_PATH>");
        expect(script).toContain('    "<RECORDING_NAME>": "s3://dandiarchive/zarr/<ZARR_ID>/",');
        expect(script).toContain('RECORDING = "<RECORDING_NAME>"');
        expect(script).toContain('CURATION_FILE = Path(f"<JOB_ID>_{RECORDING}_curation.json")');
    });

    it("fills the export script with the job's analyzers, source asset, and capsule output folder", () => {
        const run = makeRun({ contentHash: "a05ac4e6-030f-49b7-ac62-e1aa74e54dcb" });
        const script = curationExportScript(curationScriptValues(run));
        expect(script).toContain("# Export the curated sorting of job-26070830b5ff to NWB");
        expect(script).toContain('RECORDING = "block0_acquisition-ElectricalSeriesProbe00AP_recording1"');
        expect(script).toContain('CURATION_FILE = Path(f"job-26070830b5ff_{RECORDING}_curation.json")');
        expect(script).toContain('SOURCE_ASSET = "DANDI:000397/sub-Pt01/sub-Pt01_ecephys.nwb"');
        expect(script).toContain(
            'SOURCE_NWB_URL = "https://dandiarchive.s3.amazonaws.com/blobs/a05/ac4/a05ac4e6-030f-49b7-ac62-e1aa74e54dcb"'
        );
        expect(script).toContain('OUTPUT_DIR = Path("curated")');
        expect(script).toContain('nwb_path = OUTPUT_DIR / f"job-26070830b5ff_{RECORDING}_curated.nwb"');
        expect(script).not.toContain("001697");
        expect(script).toContain("apply_curation(analyzer, curation, sparsity_overlap=SPARSITY_OVERLAP)");
        expect(script).toContain('curated.compute("template_metrics")');
        expect(script).toContain("nwbfile.units.resolution = 1 / curated.sampling_frequency");
    });

    it("uses placeholders in the export script when no job is given", () => {
        const script = curationExportScript(curationScriptValues());
        expect(script).toContain('SOURCE_ASSET = "<SOURCE_ASSET>"');
        expect(script).toContain('SOURCE_NWB_URL = "<SOURCE_NWB_URL>"');
        expect(script).toContain('nwb_path = OUTPUT_DIR / f"<JOB_ID>_{RECORDING}_curated.nwb"');
        expect(script).toContain('    "<RECORDING_NAME>": "s3://dandiarchive/zarr/<ZARR_ID>/",');
    });

    it("falls back to source placeholders for a job without a source path or content id", () => {
        const values = curationScriptValues(makeRun({ dandiPath: null, contentHash: null }));
        expect(values.sourceAsset).toBe("<SOURCE_ASSET>");
        expect(values.sourceNwbUrl).toBe("<SOURCE_NWB_URL>");
    });

    it("links successful run cards to the filled-in curation page in a new tab", () => {
        const link = renderCurationLink(makeRun());
        expect(link).toContain('href="?view=curation&amp;job=job-26070830b5ff"');
        expect(link).toContain('target="_blank"');
        expect(renderCurationLink(makeRun({ jobId: null }))).toContain(
            `href="?view=curation&amp;job=${encodeURIComponent(RUN_PATH)}"`
        );
        expect(renderCurationLink(makeRun({ status: "failed" }))).toBe("");
        expect(renderCurationLink(makeRun({ outputPaths: {} }))).toContain("✎ Not curatable");
        expect(renderCurationLink(makeRun({ outputPaths: {} }))).not.toContain("href=");
        expect(renderFlatList([makeRun()])).toContain("run-entry-curate-link");
        expect(renderDandisets([makeRun()])).toContain("run-entry-curate-link");
        expect(renderFlatList([makeRun({ status: "failed" })])).not.toContain("run-entry-curate-link");
    });

    it("counts curatable successful runs in group badges", () => {
        const html = renderGroupBadges([
            makeRun(),
            makeRun({ jobId: "job-b", outputPaths: {} }),
            makeRun({ jobId: "job-c", status: "failed" }),
        ]);
        expect(html).toContain('class="gbadge gbadge-curatable"');
        expect(html).toContain("1/2&thinsp;✎");
        expect(html).toContain('title="1 of 2 successful runs has postprocessed output to curate"');

        const none = renderGroupBadges([makeRun({ outputPaths: {} })]);
        expect(none).toContain("gbadge-curatable-none");
        expect(none).toContain("0/1&thinsp;✎");
        expect(renderGroupBadges([makeRun({ status: "failed" })])).not.toContain("gbadge-curatable");
        expect(renderDandisets([makeRun()])).toContain("gbadge-curatable");
    });

    it("finds a job by its ID or capsule path", () => {
        const run = makeRun();
        const runs = [makeRun({ jobId: "job-other", path: "derivatives/elsewhere/job-other" }), run];
        expect(findCurationRun(runs, "job-26070830b5ff")).toBe(run);
        expect(findCurationRun(runs, RUN_PATH)).toBe(run);
        expect(findCurationRun(runs, "job-missing")).toBeNull();
        expect(findCurationRun(runs, null)).toBeNull();
    });

    it("renders the template page with highlighted placeholders, no job picker, and a collapsible setup card", () => {
        const html = renderCurationPage();
        expect(html).not.toContain("<input");
        expect(html).not.toContain("<select");
        expect(html).toContain('<mark class="code-placeholder">&lt;ZARR_ID&gt;</mark>');
        expect(html).toContain('<mark class="code-placeholder">&lt;JOB_ID&gt;</mark>');
        expect(html).toContain("Curation script template");
        expect(html).toContain("✎ Curate");
        expect(html).toMatch(
            /<details class="params-instructions curation-setup" open>\s*<summary[^>]*>How to curate a run/
        );
        expect(html).toContain("pip install &quot;spikeinterface-gui[desktop]&quot; s3fs");
        expect(html.indexOf("curation-setup")).toBeLessThan(html.indexOf("curation-tip"));
        expect(html.indexOf("curation-setup")).toBeLessThan(html.indexOf("curation-script"));
    });

    it("starts the setup card collapsed when the viewer collapsed it before", () => {
        localStorage.setItem("curationSetupOpen", "0");
        expect(renderCurationPage()).toMatch(/<details class="params-instructions curation-setup">/);
    });

    it("escapes the requested job in the fallback notice", () => {
        const html = renderCurationPage(null, {
            jobKey: '<img src=x onerror="alert(1)">',
            reason: "bogus",
            detail: "<b>",
        });
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<b>");
        expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
        expect(html).toContain("could not be loaded (&lt;b&gt;)");
    });

    it("renders the export script below the curation script and links DANDI's upload instructions", () => {
        const html = renderCurationPage(makeRun());
        expect(html).toContain("Export the curation to NWB");
        expect(html.indexOf("Curation script")).toBeLessThan(html.indexOf("Export script"));
        expect(html).toContain("pip install neuroconv remfile");
        expect(html).toContain("upload the curated file to any Dandiset they own");
        expect(html).toContain('href="https://docs.dandiarchive.org/user-guide-sharing/uploading-data/"');
        expect(html).toContain('href="https://www.youtube.com/watch?v=OGlQtxzip-Q&amp;t=3s"');
        expect(html).not.toContain("Upload commands");
        expect(html).not.toContain("dandi organize");
        expect(renderCurationPage()).toContain('<mark class="code-placeholder">&lt;SOURCE_NWB_URL&gt;</mark>');
    });

    it("highlights a source placeholder a filled-in job falls back to", () => {
        const html = renderCurationPage(makeRun({ contentHash: null }));
        expect(html).toContain('<mark class="code-placeholder">&lt;SOURCE_NWB_URL&gt;</mark>');
        expect(html).not.toContain("&lt;ZARR_ID&gt;");
    });

    it("renders the filled-in page for a job without job placeholders", () => {
        const html = renderCurationPage(makeRun({ contentHash: "a05ac4e6-030f-49b7-ac62-e1aa74e54dcb" }));
        expect(html).toContain("Filled in for <code>job-26070830b5ff</code>");
        expect(html).toContain("Dandiset 000397");
        for (const token of [
            "JOB_ID",
            "JOB_CAPSULE_PATH",
            "RECORDING_NAME",
            "ZARR_ID",
            "SOURCE_ASSET",
            "SOURCE_NWB_URL",
        ]) {
            expect(html).not.toContain(`&lt;${token}&gt;`);
        }
        expect(html).not.toContain("&lt;ZARR_ID&gt;");
        expect(html).toContain("s3://dandiarchive/zarr/11111111-1111-1111-1111-111111111111/");
    });

    describe("initCurationPage", () => {
        const PAGE_IDS = ["loading", "error", "filter-banner", "summary", "layout-bar", "runs"];
        let originalFetch;

        let stubCount = 0;

        // Fresh blob URLs per stub: blob URLs are content-addressed, so a reused
        // one would be served from the page's immutable blob cache.
        function stubQueue(run) {
            stubCount += 1;
            const jobsUrl = `https://dandiarchive.s3.amazonaws.com/blobs/aaa/aaa/aaaaaa-curation-jobs-${stubCount}`;
            const pathsUrl = `https://dandiarchive.s3.amazonaws.com/blobs/bbb/bbb/bbbbbb-curation-paths-${stubCount}`;
            const pathRows = [
                {
                    job_id: run.jobId,
                    path: `${RUN_PATH}/dataset_description.json`,
                    content_id: "d6f79e26-19c9-4cf5-befc-dceb46a9394f",
                },
                ...Object.entries(run.outputPaths).map(([path, id]) => ({ job_id: run.jobId, path, content_id: id })),
            ];
            global.fetch = vi.fn(async (url) => {
                const href = String(url);
                if (href.endsWith("/001697/draft/assets.jsonld")) {
                    return new Response(
                        JSON.stringify([
                            { path: "derivatives/jobs.tsv", contentUrl: [jobsUrl] },
                            { path: "derivatives/paths.tsv", contentUrl: [pathsUrl] },
                        ]),
                        { status: 200 }
                    );
                }
                if (href === jobsUrl) {
                    return new Response(
                        makeJobsTsv([
                            {
                                job_id: run.jobId,
                                dandiset_id: "000397",
                                within_dandiset_path: "sub-Pt01/sub-Pt01_ecephys.nwb",
                                pipeline: "aind+ephys",
                                version: "v1.2.4",
                                params: "1cbdbee",
                                config: "7940dfd",
                                status: "successful",
                            },
                        ]),
                        { status: 200 }
                    );
                }
                if (href === pathsUrl) return new Response(makePathsTsv(pathRows), { status: 200 });
                return new Response("", { status: 404 });
            });
        }

        async function openPage(search) {
            window.history.replaceState(null, "", `/?view=curation${search}`);
            document.body.innerHTML = PAGE_IDS.map((id) => `<div id="${id}"></div>`).join("");
            await initCurationPage();
            return {
                code: document.querySelector(".curation-script code").textContent,
                notice: document.querySelector(".curation-notice")?.textContent ?? null,
            };
        }

        beforeEach(() => {
            originalFetch = global.fetch;
            clearQueueStateCache();
        });

        afterEach(() => {
            global.fetch = originalFetch;
            clearQueueStateCache();
        });

        it("fills the script in for ?job=", async () => {
            stubQueue(makeRun());
            const { code, notice } = await openPage("&job=job-26070830b5ff");
            expect(notice).toBeNull();
            expect(document.querySelector(".curation-filled").textContent).toContain("job-26070830b5ff");
            expect(code).toContain('"s3://dandiarchive/zarr/11111111-1111-1111-1111-111111111111/"');
            expect(code).not.toContain("<ZARR_ID>");
        });

        it("shows placeholders without fetching when no job is given", async () => {
            global.fetch = vi.fn();
            const { code, notice } = await openPage("");
            expect(global.fetch).not.toHaveBeenCalled();
            expect(notice).toBeNull();
            expect(code).toContain("<ZARR_ID>");
        });

        it("falls back to placeholders with a notice for unknown or uncuratable jobs", async () => {
            stubQueue(makeRun());
            let page = await openPage("&job=job-missing");
            expect(page.notice).toContain("job-missing was not found");
            expect(page.code).toContain("<ZARR_ID>");

            clearQueueStateCache();
            stubQueue(makeRun({ outputPaths: { [`${RUN_PATH}/logs/trace.txt`]: "5be809fd" } }));
            page = await openPage("&job=job-26070830b5ff");
            expect(page.notice).toContain("has no derivatives/postprocessed/ output");
            expect(page.code).toContain("<ZARR_ID>");
        });

        it("falls back to placeholders with a notice when the queue can't be loaded", async () => {
            global.fetch = vi.fn(async () => new Response("", { status: 500 }));
            const { code, notice } = await openPage("&job=job-26070830b5ff");
            expect(notice).toContain("Job job-26070830b5ff could not be loaded (Failed to load");
            expect(code).toContain("<ZARR_ID>");
        });

        it("remembers when the setup card is collapsed", async () => {
            global.fetch = vi.fn();
            await openPage("");
            const setup = document.querySelector(".curation-setup");
            setup.open = false;
            setup.dispatchEvent(new Event("toggle"));
            expect(localStorage.getItem("curationSetupOpen")).toBe("0");
        });
    });

    it("copies the code block's plain script to the clipboard and swaps the icon", async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        const originalClipboard = navigator.clipboard;
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        const controller = new AbortController();
        const originalAdd = document.addEventListener.bind(document);
        const addSpy = vi
            .spyOn(document, "addEventListener")
            .mockImplementation((type, fn, opts) => originalAdd(type, fn, { ...opts, signal: controller.signal }));
        try {
            initCopyCodeButtons();
            document.body.innerHTML = `<div id="runs">${renderCurationPage()}</div>`;
            const btn = document.querySelector(".copy-code-btn");
            expect(btn.textContent.trim()).toBe("");
            expect(btn.querySelector("svg")).not.toBeNull();
            btn.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(writeText).toHaveBeenCalledTimes(1);
            expect(writeText.mock.calls[0][0]).toBe(curationScript(curationScriptValues()));
            expect(btn.dataset.state).toBe("copied");
            expect(btn.title).toBe("Copied!");
            vi.advanceTimersByTime(1500);
            expect(btn.dataset.state).toBeUndefined();
            expect(btn.title).toBe("Copy");
        } finally {
            vi.useRealTimers();
            addSpy.mockRestore();
            controller.abort();
            Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
        }
    });
});

describe("renderVisualizationSection", () => {
    it("renders a gallery section with recording and image data", () => {
        const recordings = [
            {
                name: "block0_acquisition-ElectricalSeriesRaw_recording1",
                images: [
                    { name: "drift_map.png", url: "https://cdn.example.com/drift_map.png" },
                    { name: "motion.png", url: "https://cdn.example.com/motion.png" },
                ],
            },
        ];

        const html = renderVisualizationSection(recordings);

        expect(html).toContain("Visualizations");
        expect(html).toContain("2"); // count badge
        expect(html).toContain("block0_acquisition-ElectricalSeriesRaw_recording1");
        expect(html).toContain("viz-recording");
        expect(html).toContain("viz-grid");
        expect(html).toContain("viz-figure");
        expect(html).toContain("viz-img");
        expect(html).toContain("drift_map.png");
        expect(html).toContain("motion.png");
        // images open in a modal, not a new tab
        expect(html).toContain("viz-link");
        expect(html).toContain("data-viz-url=");
        expect(html).toContain("data-viz-label=");
        expect(html).not.toContain('target="_blank"');
    });

    it("renders captions with underscores replaced by spaces", () => {
        const recordings = [
            {
                name: "recording1",
                images: [{ name: "traces_full_seg0.png", url: "https://cdn.example.com/traces_full_seg0.png" }],
            },
        ];

        const html = renderVisualizationSection(recordings);
        expect(html).toContain("traces full seg0");
    });

    it("renders queue priorities with version links and plain params priorities", () => {
        const html = renderQueuePriorities({
            pipelines: {
                ephys: {
                    version_priority: ["v1", "v2"],
                    params_priority: ["fast", "slow"],
                    max_attempts_per_asset: 3,
                },
            },
        });

        expect(html).toContain("Queue priorities");
        expect(html).toContain("pipeline_configs.json ↗");
        expect(html).toContain("Version priority");
        expect(html).toContain("Params priority");
        expect(html).toContain("version=v1");
        expect(html).toContain('<span class="qp-chip-label">fast</span>');
        expect(html).not.toContain('href="?params=');
        expect(html).toContain("Max attempts per asset");
        expect(html).toContain(">3<");
    });

    it("escapes HTML in recording names and image names", () => {
        const recordings = [
            {
                name: '<script>alert("xss")</script>',
                images: [{ name: "evil<img>.png", url: "https://cdn.example.com/evil.png" }],
            },
        ];

        const html = renderVisualizationSection(recordings);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("sums image counts across multiple recordings", () => {
        const recordings = [
            {
                name: "rec1",
                images: [
                    { name: "a.png", url: "url1" },
                    { name: "b.png", url: "url2" },
                ],
            },
            { name: "rec2", images: [{ name: "c.png", url: "url3" }] },
        ];

        const html = renderVisualizationSection(recordings);
        expect(html).toContain(">3<"); // total image count badge
    });
});

describe("renderQualityControlSection", () => {
    const dropdownMetric = (value) => ({
        name: "Probe noise",
        stage: "Raw data",
        modality: { abbreviation: "ecephys", name: "Extracellular electrophysiology" },
        value: {
            value,
            options: ["Normal", "No spikes", "Noisy"],
            status: ["Pass", "Fail", "Fail"],
            type: "dropdown",
        },
    });

    it("renders only the selected picker value, not the widget's options/status arguments", () => {
        const html = renderQualityControlSection({ metrics: [dropdownMetric("Normal")] });

        expect(html).toContain('<span class="qc-value">Normal</span>');
        expect(html).not.toContain("No spikes");
        expect(html).not.toContain("Noisy");
        expect(html).not.toContain("qc-option");
    });

    it("does not render Pass/Pending evaluation statuses (per-metric or overall)", () => {
        const html = renderQualityControlSection({
            status: { "Raw data": "Pass", "ecephys:Curation": "Pending" },
            metrics: [
                {
                    ...dropdownMetric("Normal"),
                    status_history: [{ evaluator: "automated", status: "Pending", timestamp: "2026-06-01T00:00:00Z" }],
                },
            ],
        });

        expect(html).not.toContain("status-badge");
        expect(html).not.toContain("qc-status-summary");
        expect(html).not.toContain("Pending");
        expect(html).not.toContain("Pass");
    });

    it("renders no value chips when nothing has been selected", () => {
        const html = renderQualityControlSection({ metrics: [dropdownMetric("")] });

        expect(html).not.toContain("qc-value");
        expect(html).not.toContain("Normal");
    });

    it("renders every selection of a multi-select (checkbox) value", () => {
        const html = renderQualityControlSection({
            metrics: [
                {
                    name: "Artifacts",
                    stage: "Raw data",
                    value: {
                        value: ["Line noise", "Drift"],
                        options: ["Line noise", "Drift", "None"],
                        type: "checkbox",
                    },
                },
            ],
        });

        expect(html).toContain('<span class="qc-value">Line noise</span>');
        expect(html).toContain('<span class="qc-value">Drift</span>');
        expect(html).not.toContain(">None<");
    });

    it("does not render the metric's modality abbreviation", () => {
        const html = renderQualityControlSection({ metrics: [dropdownMetric("Normal")] });

        expect(html).not.toContain("qc-metric-modality");
        expect(html).not.toContain("ecephys");
    });

    it("renders each processing stage as its own nested dropdown with a metric count", () => {
        const html = renderQualityControlSection({
            metrics: [
                dropdownMetric("Normal"),
                { ...dropdownMetric(""), name: "PSD" },
                { ...dropdownMetric(""), name: "Unit yield", stage: "Processed data" },
            ],
        });

        expect(html).toContain('<details class="qc-stage" data-section="qc-stage-Raw%20data">');
        expect(html).toContain('<details class="qc-stage" data-section="qc-stage-Processed%20data">');
        expect(html).toContain('<summary class="qc-stage-title">Raw data<span class="count-badge">2</span></summary>');
        expect(html).toContain(
            '<summary class="qc-stage-title">Processed data<span class="count-badge">1</span></summary>'
        );
    });
});

describe("QC section placeholder before hydration", () => {
    const ENTRY = {
        dandiset_id: "000696",
        subject: "subQ",
        session: "sesQ",
        pipeline: "aind+ephys",
        version: "v1.2.4",
        params: "1cbdbee",
        config: "7940dfd",
        attempt: 1,
        has_code: true,
        has_been_submitted: true,
        has_output: true,
        has_logs: true,
    };

    it("renders a collapsed loading QC section for runs with an unfetched quality_control.json", () => {
        const [probe] = parseQueueEntries([ENTRY]);
        const [run] = parseQueueEntries([
            {
                ...ENTRY,
                output_paths: { [`${probe.path}/derivatives/visualization/quality_control.json`]: "abcdef123" },
            },
        ]);
        const html = renderFlatList([buildInitialRun(run)]);

        expect(html).toContain('data-section="qc"');
        expect(html).toContain("Loading quality control");
    });

    it("renders no QC section for runs without a quality_control.json artifact", () => {
        const [run] = parseQueueEntries([ENTRY]);
        const html = renderFlatList([buildInitialRun(run)]);

        expect(html).not.toContain('data-section="qc"');
    });

    it("renders a collapsed loading Provenance section for runs with an unfetched dataset_description.json", () => {
        const [probe] = parseQueueEntries([ENTRY]);
        const [run] = parseQueueEntries([
            {
                ...ENTRY,
                dataset_description_path: { [`${probe.path}/dataset_description.json`]: "abcdef789" },
            },
        ]);
        const html = renderFlatList([buildInitialRun(run)]);

        expect(html).toContain('data-section="provenance"');
        expect(html).toContain("Loading provenance");
    });

    it("renders no Provenance section for runs without a dataset_description.json artifact", () => {
        const [run] = parseQueueEntries([ENTRY]);
        const html = renderFlatList([buildInitialRun(run)]);

        expect(html).not.toContain('data-section="provenance"');
    });
});

describe("fetchVisualizationData", () => {
    it("returns null when no visualization data is present", async () => {
        const result = await fetchVisualizationData({
            path: "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1",
        });
        expect(result).toBeNull();
    });

    it("returns recordings with image data from the GitHub API", async () => {
        const result = await fetchVisualizationData({
            path: "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1",
            outputPaths: {
                "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1/derivatives/visualization/recording1/drift_map.png":
                    "abcdef123456",
                "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1/derivatives/visualization/recording1/motion.png":
                    "123456abcdef",
            },
        });

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("recording1");
        expect(result[0].images).toHaveLength(2);
        expect(result[0].images[0].name).toBe("drift_map.png");
        expect(result[0].images[1].name).toBe("motion.png");
        expect(result[0].images[0].url).toContain("dandiarchive.s3.amazonaws.com/blobs");
        expect(result[0].images[0].url).toContain("/abc/def/abcdef123456");
    });

    it("falls back to legacy top-level visualization directory when derivatives layout is missing", async () => {
        const result = await fetchVisualizationData({
            path: "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1",
            outputPaths: {
                "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1/visualization/recording1/drift_map.png":
                    "abcdef123456",
            },
        });

        expect(result).not.toBeNull();
        expect(result[0].images[0].url).toContain("dandiarchive.s3.amazonaws.com/blobs");
        expect(result[0].images[0].url).toContain("/abc/def/abcdef123456");
    });

    it("returns null when all recordings have no PNG images", async () => {
        const result = await fetchVisualizationData({
            path: "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1",
            outputPaths: {
                "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1/visualization/readme.txt":
                    "abcdef123456",
            },
        });
        expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
        const result = await fetchVisualizationData({
            path: "derivatives/dandiset-000001/sub-A/pipeline-test/version-v1/params-abc_attempt-1",
        });
        expect(result).toBeNull();
    });
});

describe("fetchSlurmLogs", () => {
    it("returns empty array when the logs directory fetch fails", async () => {
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
        });
        expect(result).toEqual([]);
    });

    it("returns empty array when no slurm log files are present", async () => {
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
            outputPaths: {
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/nextflow.log":
                    "abcdef123456",
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/trace.txt":
                    "123456abcdef",
            },
        });
        expect(result).toEqual([]);
    });

    it("returns slurm log filenames when present in the logs directory", async () => {
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
            outputPaths: {
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/nextflow.log":
                    "abcdef123456",
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/job-14240507_slurm.log":
                    "123456abcdef",
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/trace.txt":
                    "fedcba654321",
            },
        });
        expect(result).toEqual(["job-14240507_slurm.log"]);
    });

    it("returns multiple slurm log filenames sorted by name", async () => {
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
            outputPaths: {
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/job-99999999_slurm.log":
                    "abcdef123456",
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/job-10000000_slurm.log":
                    "123456abcdef",
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/nextflow.log":
                    "fedcba654321",
            },
        });
        expect(result).toEqual(["job-10000000_slurm.log", "job-99999999_slurm.log"]);
    });

    it("ignores directory entries ending with _slurm.log", async () => {
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
            outputPaths: {
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/job-12345_slurm.log/subdir":
                    "abcdef123456",
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/job-67890_slurm.log":
                    "123456abcdef",
            },
        });
        expect(result).toEqual(["job-67890_slurm.log"]);
    });

    it("returns empty array on network error", async () => {
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
        });
        expect(result).toEqual([]);
    });

    it("derives slurm logs directly from the run output paths", async () => {
        const fetchSpy = vi.fn();
        global.fetch = fetchSpy;
        const result = await fetchSlurmLogs({
            path: "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1",
            outputPaths: {
                "derivatives/dandiset-001697/sub-A/pipeline-ephys/version-v1_params-abc_config-def_attempt-1/logs/job-12345_slurm.log":
                    "abcdef123456",
            },
        });
        expect(result).toEqual(["job-12345_slurm.log"]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe("search terms", () => {
    afterEach(() => window.history.replaceState(null, "", "/"));

    it("splits a search into terms at whitespace outside quotes", () => {
        const terms = parseSearchTerms('Pipeline:lfp  subject:"mouse 1" "a:b" spikes');
        expect(terms.map(({ key, value, raw }) => ({ key, value, raw }))).toEqual([
            { key: "pipeline", value: "lfp", raw: "Pipeline:lfp" },
            { key: "subject", value: "mouse 1", raw: 'subject:"mouse 1"' },
            // A term opening with a quote is literal text, colon and all.
            { key: null, value: "a:b", raw: '"a:b"' },
            { key: null, value: "spikes", raw: "spikes" },
        ]);
        expect(terms[1]).toMatchObject({ start: 14, end: 31 });
    });

    it("maps terms onto the filter URL params, and reports terms it can't use", () => {
        const { params, problems } = searchTermsToParams(
            parseSearchTerms(
                "sub:A version:v1 version:v2 size:>10 size:<100 size:big failurestep:pre-processing ses: verson:v3"
            )
        );
        expect(params).toEqual({
            subject: "A",
            pipelineVersion: "v2",
            assetSize: ">10, <100",
            failureStep: "pre-processing",
            text: "verson:v3",
        });
        expect(problems).toEqual([
            "Only the last version: term is used.",
            "Write sizes in GB, like size:>10 or size:<=100.",
            "There is no verson: filter, so it was searched as text. Did you mean version:?",
        ]);
    });

    it("reads a filter set back as search text", () => {
        expect(
            filterToSearchText({
                dandisetId: "000363",
                pipeline: "aind+ephys",
                assetSize: "> 50, < 100",
                status: "failed",
                text: '"sorting run" x',
            })
        ).toBe('dandiset:000363 pipeline:aind+ephys size:>50 size:<100 status:failed "sorting run" x');
        expect(filterToSearchText({ subject: "mouse 1" })).toBe('subject:"mouse 1"');
        expect(filterToSearchText({})).toBe("");
    });

    it("reads the pipeline and free-text filters from the URL", () => {
        window.history.replaceState(null, "", "/?pipeline=lfp&q=spikes+%22sub-1%22");
        expect(parseFilter()).toMatchObject({ pipeline: "lfp", text: 'spikes "sub-1"' });
    });
});

describe("pipeline and free-text filters", () => {
    const runs = [
        {
            jobId: "job-aaa",
            dandisetId: "000363",
            subject: "mouse1",
            pipelineName: "aind+ephys",
            pipelineVersion: "v1.2.4",
            status: "success",
        },
        {
            jobId: "job-bbb",
            dandisetId: "000409",
            subject: "mouse2",
            pipelineName: "lfp",
            pipelineVersion: "v0.1.0",
            status: "failed",
        },
    ];

    it("filters by pipeline, whichever way its name is spelled", () => {
        expect(applyFilter(runs, { pipeline: "lfp" })).toEqual([runs[1]]);
        expect(applyFilter(runs, { pipeline: "aind-ephys" })).toEqual([runs[0]]);
        expect(applyFilter(runs, { pipeline: "aind+ephys" })).toEqual([runs[0]]);
        expect(applyFilter(runs, { pipeline: "other" })).toEqual([]);
    });

    it("matches every free-text word against a job's identifying fields", () => {
        expect(applyFilter(runs, { text: "MOUSE" })).toEqual(runs);
        expect(applyFilter(runs, { text: "mouse 000409" })).toEqual([runs[1]]);
        expect(applyFilter(runs, { text: "job-aaa aind-ephys" })).toEqual([runs[0]]);
        expect(applyFilter(runs, { text: '"v0.1"' })).toEqual([runs[1]]);
        expect(applyFilter(runs, { text: "mouse3" })).toEqual([]);
    });

    it("displays pipeline names with hyphens", () => {
        expect(pipelineDisplayName("aind+ephys")).toBe("aind-ephys");
        expect(pipelineDisplayName(null)).toBe("");
    });
});

describe("job card tags", () => {
    const run = {
        status: "success",
        attempt: 1,
        tasks: [],
        generatedBy: [],
        logFiles: [],
        outputPaths: {},
        path: "derivatives/dandiset-001697/sub-A/pipeline-aind+ephys/job-1",
        dandisetId: "001697",
        subject: "A",
        session: null,
        pipelineName: "aind+ephys",
        pipelineVersion: "v1",
        paramsProfile: "fast",
        configHash: "abc",
        jobId: "job-1",
    };

    afterEach(() => window.history.replaceState(null, "", "/"));

    it("tags each job card with its pipeline, in both layouts", () => {
        for (const html of [renderFlatList([run]), renderDandisets([run])]) {
            const container = document.createElement("div");
            container.innerHTML = html;
            const tag = container.querySelector(".run-entry .run-tag");
            expect(tag).not.toBeNull();
            expect(tag.className).toContain("run-tag-pipeline-aind-ephys");
            expect(tag.querySelector(".run-tag-key").textContent).toBe("pipeline");
            expect(tag.querySelector(".run-tag-value").textContent).toBe("aind-ephys");
        }
    });

    it("links a tag to the current search with its pipeline term toggled", () => {
        window.history.replaceState(null, "", "/?view=dashboard&layout=flat&sort=attempt&sortDir=desc&status=failed");
        const inactive = document.createElement("div");
        inactive.innerHTML = renderRunTags(run);
        const href = inactive.querySelector(".run-tag").getAttribute("href");
        expect(new URLSearchParams(href.slice(1)).get("pipeline")).toBe("aind-ephys");
        expect(new URLSearchParams(href.slice(1)).get("status")).toBe("failed");
        expect(inactive.querySelector(".run-tag").classList.contains("run-tag-active")).toBe(false);

        window.history.replaceState(null, "", `/${href}`);
        const active = document.createElement("div");
        active.innerHTML = renderRunTags(run);
        const tag = active.querySelector(".run-tag");
        expect(tag.classList.contains("run-tag-active")).toBe(true);
        expect(tag.getAttribute("title")).toBe("Stop filtering by pipeline:aind-ephys");
        const offHref = new URLSearchParams(tag.getAttribute("href").slice(1));
        expect(offHref.get("pipeline")).toBeNull();
        expect(offHref.get("status")).toBe("failed");
    });

    it("leaves jobs without a pipeline untagged", () => {
        expect(renderRunTags({ ...run, pipelineName: null })).toBe("");
    });
});

describe("renderFlatList", () => {
    const baseRun = {
        status: "success",
        attempt: 1,
        runDate: null,
        tasks: [],
        generatedBy: [],
        vizData: null,
        hasLogs: false,
        hasCode: true,
        hasOutput: true,
        logFiles: [],
        outputPaths: {},
        path: "derivatives/dandiset-001697/sub-A/ses-S1/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1",
        dandiPath: "sourcedata/sub-A/ses-S1/sub-A_ses-S1_ecephys.nwb",
        dandisetId: "001697",
        subject: "A",
        session: "S1",
        pipelineName: "ephys",
        pipelineVersion: "v1",
        paramsProfile: "fast",
        configHash: "abc",
        assetId: null,
        inSourcedata: false,
        failureStep: null,
        assetSizeBytes: 1024,
    };

    it("wraps runs in a flat-list container", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain('class="flat-list"');
    });

    it("sorts runs by created_at when requested", () => {
        const newerRun = {
            ...baseRun,
            path: `${baseRun.path}-newer`,
            createdAt: "2026-05-20T09:15:00Z",
            runDate: "2026-05-20T09:15:00Z",
            subject: "B",
        };
        const olderRun = {
            ...baseRun,
            path: `${baseRun.path}-older`,
            createdAt: "2026-05-19T09:15:00Z",
            runDate: "2026-05-19T09:15:00Z",
            subject: "A",
        };

        const sortedRuns = sortRuns([olderRun, newerRun], "created_at");
        expect(sortedRuns.map((run) => run.subject)).toEqual(["B", "A"]);
    });

    it("reverses run ordering when ascending sort is requested", () => {
        const secondAttempt = {
            ...baseRun,
            path: `${baseRun.path}-attempt-2`,
            attempt: 2,
            subject: "B",
        };
        const firstAttempt = {
            ...baseRun,
            path: `${baseRun.path}-attempt-1`,
            attempt: 1,
            subject: "A",
        };

        const sortedRuns = sortRuns([secondAttempt, firstAttempt], "attempt", "asc");
        expect(sortedRuns.map((run) => run.subject)).toEqual(["A", "B"]);
    });

    it("sorts runs by dandiset ID when requested", () => {
        const higherIdRun = {
            ...baseRun,
            path: `${baseRun.path}-higher`,
            dandisetId: "001698",
            subject: "B",
        };
        const lowerIdRun = {
            ...baseRun,
            path: `${baseRun.path}-lower`,
            dandisetId: "000233",
            subject: "A",
        };

        const sortedRuns = sortRuns([higherIdRun, lowerIdRun], "dandiset_id", "asc");
        expect(sortedRuns.map((run) => run.dandisetId)).toEqual(["000233", "001698"]);
    });

    it("includes dandiset ID in each flat run entry", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("001697");
    });

    it("includes full dandi_path in each flat run entry", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("Path:");
        expect(html).toContain("sourcedata/sub-A/ses-S1/sub-A_ses-S1_ecephys.nwb");
    });

    it("falls back to subject path in flat run entry when dandi_path is absent", () => {
        const run = { ...baseRun, dandiPath: null };
        const html = renderFlatList([run]);
        expect(html).toContain("Path:");
        expect(html).toContain("sub-A");
    });

    it("uses dandi_path directory for flat run link location", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("location=sourcedata%2Fsub-A%2Fses-S1");
    });

    it("renders run date on a separate flat context line", () => {
        const run = { ...baseRun, runDate: "2026-05-29T00:43:50.005026-04:00" };
        const html = renderFlatList([run]);
        expect(html).toContain("flat-ctx-date");
        expect(html).toContain("flat-ctx-break");
        expect(html).not.toContain('class="run-date"');
    });

    it("omits pipeline/version context from flat run header", () => {
        const html = renderFlatList([baseRun]);
        expect(html).not.toContain("flat-ctx-pipeline");
    });

    it("includes params profile in each flat run entry", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("Params:");
        expect(html).toContain("fast");
    });

    it("aliases known params hash to explicit registry name with source link", async () => {
        await loadFixtureRegistries();
        const run = { ...baseRun, paramsProfile: "4af6a25" };
        const html = renderFlatList([run]);
        expect(html).toContain("Params:");
        expect(html).toContain(">deterministic<");
        expect(html).toContain(
            'href="https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json"'
        );
    });

    it("aliases known config hash to explicit registry name with source link", async () => {
        await loadFixtureRegistries();
        const run = { ...baseRun, configHash: "0d4bf36" };
        const html = renderFlatList([run]);
        const container = document.createElement("div");
        container.innerHTML = html;

        const configLink = [...container.querySelectorAll(".flat-ctx-text .src-link")].find(
            (link) => link.textContent === "v1"
        );

        expect(container.textContent).toContain("Config:");
        expect(configLink).toBeTruthy();
        expect(configLink?.href).toMatch(
            /^https:\/\/github\.com\/dandi-compute\/dandi-compute-core\/blob\/main\/src\/dandi_compute_code\/aind_ephys_pipeline\/configs\/.+\.config$/
        );
    });

    it("shows attempt number", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("Attempt");
        expect(html).toContain("1");
    });

    it("shows the job id in place of an attempt number for job capsules", () => {
        const html = renderFlatList([{ ...baseRun, jobId: "job-26070830b5ff", attempt: null }]);
        const container = document.createElement("div");
        container.innerHTML = html;

        expect(container.querySelector(".run-attempt")?.textContent).toBe("Job job-26070830b5ff");
        expect(html).not.toContain("Attempt&nbsp;null");
    });

    it("shows bytes in each flat run entry when available", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("Asset size:");
        expect(html).toContain("1.02 KB");
    });

    it("renders multiple runs", () => {
        const run2 = { ...baseRun, dandisetId: "000233", subject: "B", attempt: 2 };
        const html = renderFlatList([baseRun, run2]);
        expect(html).toContain("001697");
        expect(html).toContain("000233");
    });

    it("applies correct status class for success", () => {
        const html = renderFlatList([baseRun]);
        expect(html).toContain("status-success");
    });

    it("applies correct status class for failed", () => {
        const run = { ...baseRun, status: "failed" };
        const html = renderFlatList([run]);
        expect(html).toContain("status-failed");
    });

    it("applies correct status class and label for running", () => {
        const run = { ...baseRun, status: "running" };
        const html = renderFlatList([run]);
        expect(html).toContain("status-running");
        expect(html).toContain("▶ Running");
    });

    it("includes slurm log button in Logs section when logFiles is provided", () => {
        const run = {
            ...baseRun,
            hasLogs: true,
            logFiles: ["job-14240507_slurm.log"],
            outputPaths: {
                [`${baseRun.path}/logs/job-14240507_slurm.log`]: "abcdef123456",
            },
        };
        const html = renderFlatList([run]);
        expect(html).toContain("SLURM Job Log");
        expect(html).toContain('data-log-url="https://dandiarchive.s3.amazonaws.com/blobs/abc/def/abcdef123456"');
    });

    it("shows slurm log button even when hasLogs is false (slurm started before nextflow logs written)", () => {
        const run = {
            ...baseRun,
            hasLogs: false,
            logFiles: ["job-14240507_slurm.log"],
            outputPaths: {
                [`${baseRun.path}/logs/job-14240507_slurm.log`]: "abcdef123456",
            },
        };
        const html = renderFlatList([run]);
        expect(html).toContain("SLURM Job Log");
        expect(html).toContain('data-log-url="https://dandiarchive.s3.amazonaws.com/blobs/abc/def/abcdef123456"');
        expect(html).not.toContain("Nextflow Log");
    });

    it("renders Nextflow log buttons when logFiles includes nextflow.log", () => {
        const run = {
            ...baseRun,
            hasLogs: true,
            logFiles: ["nextflow.log"],
            outputPaths: {
                [`${baseRun.path}/logs/nextflow.log`]: "abcdef123456",
            },
        };
        const html = renderFlatList([run]);
        expect(html).toContain("Nextflow Log");
        expect(html).toContain('data-log-url="https://dandiarchive.s3.amazonaws.com/blobs/abc/def/abcdef123456"');
        expect(html).not.toContain("SLURM Job Log");
    });

    it("shows no Logs section when hasLogs is false and logFiles is empty", () => {
        const run = { ...baseRun, hasLogs: false, logFiles: [] };
        const html = renderFlatList([run]);
        expect(html).not.toContain("run-section-title");
    });
});

describe("renderDandisets", () => {
    it("lists jobs directly under a session without version/config nested groups", () => {
        const run1 = {
            status: "success",
            attempt: 1,
            runDate: null,
            tasks: [],
            generatedBy: [],
            vizData: null,
            hasLogs: false,
            hasOutput: true,
            hasCode: true,
            path: "derivatives/dandiset-001697/sub-A/ses-S1/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1",
            dandisetId: "001697",
            subject: "A",
            session: "S1",
            pipelineName: "ephys",
            pipelineVersion: "v1",
            paramsProfile: "fast",
            configHash: "abc",
            assetId: null,
            inSourcedata: false,
            failureStep: null,
            assetSizeBytes: 1024,
        };
        const run2 = {
            ...run1,
            status: "failed",
            attempt: 2,
            path: "derivatives/dandiset-001697/sub-A/ses-S1/pipeline-spike/version-v2/params-slow_config-def_attempt-2",
            pipelineName: "spike",
            pipelineVersion: "v2",
            paramsProfile: "slow",
            configHash: "def",
            assetSizeBytes: 2048,
        };

        const html = renderDandisets([run1, run2]);
        expect(html).toContain("2&nbsp;jobs");
        expect(html).toContain("DATA PROCESSED:");
        expect(html).toContain("Asset size:");
        expect(html).toContain("3.07 KB");
        expect(html).not.toContain("pipeline-version-group");
        expect(html).not.toContain("params-group");
        expect((html.match(/class="run-entry status-/g) || []).length).toBe(2);
    });

    it("counts running and stalled runs in group badges instead of lumping them into unknown", () => {
        const base = {
            attempt: 1,
            runDate: null,
            tasks: [],
            generatedBy: [],
            vizData: null,
            hasLogs: false,
            hasOutput: false,
            hasCode: true,
            dandisetId: "000696",
            subject: "TR15-512ch",
            session: "S1",
            pipelineName: "ephys",
            pipelineVersion: "v1",
            paramsProfile: "fast",
            configHash: "abc",
            assetId: null,
            inSourcedata: false,
            failureStep: null,
        };
        const running = {
            ...base,
            status: "running",
            createdAt: new Date().toISOString(),
            path: "derivatives/dandiset-000696/sub-TR15-512ch/ses-S1/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1",
        };
        const stalled = {
            ...base,
            status: "running",
            createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
            path: "derivatives/dandiset-000696/sub-TR15-512ch/ses-S2/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1",
            session: "S2",
        };

        const html = renderDandisets([running, stalled]);
        expect(html).toContain("gbadge-running");
        expect(html).toContain("1 running run");
        expect(html).toContain("gbadge-stalled");
        expect(html).toContain("1 stalled run");
        expect(html).not.toContain("gbadge-unknown");
        expect(html).not.toContain("unknown run");
    });

    it("orders group badges running → queued → stalled → success, failures furthest right", () => {
        const base = {
            attempt: 1,
            runDate: null,
            tasks: [],
            generatedBy: [],
            vizData: null,
            hasLogs: false,
            hasOutput: false,
            hasCode: true,
            dandisetId: "000696",
            subject: "A",
            session: "S1",
            pipelineName: "ephys",
            pipelineVersion: "v1",
            paramsProfile: "fast",
            configHash: "abc",
            assetId: null,
            inSourcedata: false,
            failureStep: null,
        };
        const runs = [
            { ...base, status: "success", hasOutput: true, session: "S1" },
            { ...base, status: "failed", session: "S2" },
            { ...base, status: "queued", session: "S3" },
            { ...base, status: "running", createdAt: new Date().toISOString(), session: "S4" },
            {
                ...base,
                status: "running",
                createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
                session: "S5",
            },
        ].map((run, i) => ({
            ...run,
            path: `derivatives/dandiset-000696/sub-A/ses-S${i + 1}/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1`,
        }));

        const html = renderDandisets(runs);
        const order = ["gbadge-running", "gbadge-queued", "gbadge-stalled", "gbadge-success", "gbadge-failed"].map(
            (cls) => html.indexOf(cls)
        );
        expect(order.every((idx) => idx !== -1)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("orders tree groups by dandiset ID when that sort mode is selected", () => {
        document.body.innerHTML = '<div id="layout-bar"></div><div id="runs"></div>';
        initLayoutToggle();
        document.querySelector("[data-sort-direction]").click();
        const select = document.querySelector("[data-sort-mode]");
        select.value = "dandiset_id";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        const lowerIdRun = {
            status: "success",
            attempt: 1,
            runDate: "2026-05-19T09:15:00Z",
            createdAt: "2026-05-19T09:15:00Z",
            tasks: [],
            generatedBy: [],
            vizData: null,
            hasLogs: false,
            hasCode: true,
            hasOutput: true,
            logFiles: [],
            outputPaths: {},
            path: "derivatives/dandiset-000233/sub-A/ses-S1/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1",
            dandiPath: "sourcedata/sub-A/ses-S1/sub-A_ses-S1_ecephys.nwb",
            dandisetId: "000233",
            subject: "A",
            session: "S1",
            pipelineName: "ephys",
            pipelineVersion: "v1",
            paramsProfile: "fast",
            configHash: "abc",
            assetId: null,
            inSourcedata: false,
            failureStep: null,
            assetSizeBytes: 1024,
        };
        const higherIdRun = {
            ...lowerIdRun,
            path: "derivatives/dandiset-001697/sub-B/ses-S2/pipeline-ephys/version-v1/params-fast_config-abc_attempt-1",
            dandisetId: "001697",
            subject: "B",
            session: "S2",
            runDate: "2026-05-20T09:15:00Z",
            createdAt: "2026-05-20T09:15:00Z",
        };

        const html = renderDandisets([higherIdRun, lowerIdRun]);
        expect(html.indexOf("Dandiset&nbsp;000233")).toBeLessThan(html.indexOf("Dandiset&nbsp;001697"));

        const resetSelect = document.querySelector("[data-sort-mode]");
        resetSelect.value = "attempt";
        resetSelect.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("[data-sort-direction]").click();
    });
});

describe("renderParamsGroup", () => {
    it("aliases params and config hashes to explicit registry names with source links", async () => {
        await loadFixtureRegistries();
        const html = renderParamsGroup("4af6a25", "0d4bf36", []);
        expect(html).toContain(">deterministic<");
        expect(html).toContain(">v1<");
        expect(html).toContain(
            'href="https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json"'
        );
        expect(html).toContain(
            'href="https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-1.config"'
        );
    });
});

describe("renderRegistryLink", () => {
    it("falls back to escaped hash display for unknown entries", () => {
        expect(renderRegistryLink("Params", '<script>alert("xss")</script>', [], "params")).toBe(
            "Params:&nbsp;&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
        );
    });
});

describe("diff page helpers", () => {
    it("builds GitHub compare URLs and summaries from expanded pipeline commit refs", async () => {
        const originalFetch = global.fetch;
        try {
            global.fetch = vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ sha: "20abeb66850ec6ce0127c1489c22bd949d9bb642" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    })
                )
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ sha: "b268fd207886905b40a956e7f6a839884ce9835f" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    })
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            ahead_by: 1,
                            behind_by: 0,
                            total_commits: 1,
                            commits: [
                                {
                                    sha: "b268fd207886905b40a956e7f6a839884ce9835f",
                                    commit: { message: "Minor 1.1.1 release (#102)" },
                                },
                            ],
                            files: [{ filename: "pyproject.toml", status: "modified" }],
                        }),
                        {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                        }
                    )
                );

            const pairs = await buildPipelineDiffPairs([
                { pipelineName: "aind+ephys", pipelineVersion: "v1.0.1+20abeb6" },
                { pipelineName: "aind+ephys", pipelineVersion: "v1.0.1+20abeb6" },
                { pipelineName: "aind+ephys", pipelineVersion: "v1.1.1+b268fd2+5d20fd2" },
            ]);

            expect(pairs).toEqual([
                {
                    pipelineName: "aind+ephys",
                    baseVersion: "v1.0.1+20abeb6",
                    headVersion: "v1.1.1+b268fd2+5d20fd2",
                    compareUrl:
                        "https://github.com/AllenNeuralDynamics/aind-ephys-pipeline/compare/20abeb66850ec6ce0127c1489c22bd949d9bb642...b268fd207886905b40a956e7f6a839884ce9835f",
                    modalHtml: expect.stringContaining("Pipeline version"),
                },
            ]);
            expect(pairs[0].modalHtml).toContain("Minor 1.1.1 release (#102)");
            expect(pairs[0].modalHtml).toContain('<th scope="col">v1.0.1-20abeb6</th>');
            expect(pairs[0].modalHtml).toContain('<th scope="col">v1.1.1-b268fd2-5d20fd2</th>');

            expect(global.fetch).toHaveBeenCalledTimes(3);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it("omits pipeline compares when version suffixes resolve to the same pipeline commit", async () => {
        const originalFetch = global.fetch;
        try {
            global.fetch = vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ sha: "b268fd207886905b40a956e7f6a839884ce9835f" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            const pairs = await buildPipelineDiffPairs([
                { pipelineName: "aind+ephys", pipelineVersion: "v1.1.1+b268fd2" },
                { pipelineName: "aind+ephys", pipelineVersion: "v1.1.1+b268fd2+3fac55c" },
            ]);

            expect(pairs).toEqual([]);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it("lists unique pipeline entries in sorted order", () => {
        expect(
            uniquePipelineEntries([
                { pipelineName: "aind+ephys", pipelineVersion: "v1.1.0+def5678" },
                { pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
                { pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
            ])
        ).toEqual([
            { key: "v1.0.0+abc1234", pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
            { key: "v1.1.0+def5678", pipelineName: "aind+ephys", pipelineVersion: "v1.1.0+def5678" },
        ]);
    });

    it("handles empty and single-entry pipeline grids", () => {
        expect(uniquePipelineEntries([])).toEqual([]);
        expect(uniquePipelineEntries([{ pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" }])).toEqual([
            { key: "v1.0.0+abc1234", pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
        ]);
    });

    it("collects nested JSON differences with stable paths", () => {
        expect(
            collectJsonDiffs(
                { sorter: { detect_sign: false }, streams: ["ap"] },
                { sorter: { detect_sign: true }, streams: ["ap", "lf"] }
            )
        ).toEqual([
            { path: "sorter.detect_sign", left: false, right: true },
            { path: "streams.1", left: undefined, right: "lf" },
        ]);
    });

    it("expands config text diffs to include a +/- 3 line context window", () => {
        expect(
            collectTextDiffs(
                ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7", "line 8"].join("\n"),
                ["line 1", "line 2", "line 3", "line 4 changed", "line 5", "line 6", "line 7", "line 8"].join("\n")
            )
        ).toEqual([
            {
                path: "lines 1-7",
                left: [
                    "1   line 1",
                    "2   line 2",
                    "3   line 3",
                    "4 - line 4",
                    "5   line 5",
                    "6   line 6",
                    "7   line 7",
                ].join("\n"),
                right: [
                    "1   line 1",
                    "2   line 2",
                    "3   line 3",
                    "4 + line 4 changed",
                    "5   line 5",
                    "6   line 6",
                    "7   line 7",
                ].join("\n"),
            },
        ]);
    });

    it("handles context windows at boundaries and across multiple changes", () => {
        expect(
            collectTextDiffs(
                ["line 1", "line 2", "line 3", "line 4", "line 5"].join("\n"),
                ["line 1 changed", "line 2", "line 3", "line 4", "line 5 changed"].join("\n")
            )
        ).toEqual([
            {
                path: "lines 1-5",
                left: ["1 - line 1", "2   line 2", "3   line 3", "4   line 4", "5 - line 5"].join("\n"),
                right: ["1 + line 1 changed", "2   line 2", "3   line 3", "4   line 4", "5 + line 5 changed"].join(
                    "\n"
                ),
            },
        ]);
    });

    it("renders pipeline compare links and params diff summaries", () => {
        const html = renderDiffPage({
            pipelineEntries: [
                { key: "v1.0.0+abc1234", pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
                { key: "v1.1.0+def5678", pipelineName: "aind+ephys", pipelineVersion: "v1.1.0+def5678" },
                { key: "v1.2.0+fedcba9", pipelineName: "aind+ephys", pipelineVersion: "v1.2.0+fedcba9" },
            ],
            pipelinePairs: [
                {
                    pipelineName: "aind+ephys",
                    baseVersion: "v1.0.0+abc1234",
                    headVersion: "v1.1.0+def5678",
                    compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...def5678",
                    modalHtml: "<p>1 commit · 1 file</p>",
                },
                {
                    pipelineName: "aind+ephys",
                    baseVersion: "v1.0.0+abc1234",
                    headVersion: "v1.2.0+fedcba9",
                    compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...fedcba9",
                    modalHtml: "<p>2 commits · 2 files</p>",
                },
                {
                    pipelineName: "aind+ephys",
                    baseVersion: "v1.1.0+def5678",
                    headVersion: "v1.2.0+fedcba9",
                    compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/def5678...fedcba9",
                    modalHtml: "<p>1 commit · 1 file</p>",
                },
            ],
            pipelinePairMap: new Map([
                [
                    "v1.0.0+abc1234\x00v1.1.0+def5678",
                    {
                        compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...def5678",
                        modalHtml: "<p>1 commit · 1 file</p>",
                    },
                ],
                [
                    "v1.0.0+abc1234\x00v1.2.0+fedcba9",
                    {
                        compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...fedcba9",
                        modalHtml: "<p>2 commits · 2 files</p>",
                    },
                ],
                [
                    "v1.1.0+def5678\x00v1.2.0+fedcba9",
                    {
                        compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/def5678...fedcba9",
                        modalHtml: "<p>1 commit · 1 file</p>",
                    },
                ],
            ]),
            paramsEntries: [
                {
                    key: "deterministic",
                    alias: "deterministic",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                },
                {
                    key: "original",
                    alias: "original",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-original.json",
                },
            ],
            paramsPairs: [
                {
                    baseAlias: "deterministic",
                    headAlias: "original",
                    baseSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                    headSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-original.json",
                    changes: [{ path: "sorter.detect_sign", left: false, right: true }],
                },
            ],
            paramsPairMap: new Map([
                [
                    "deterministic\x00original",
                    {
                        baseAlias: "deterministic",
                        headAlias: "original",
                        changes: [{ path: "sorter.detect_sign", left: false, right: true }],
                    },
                ],
            ]),
        });

        expect(html).toContain("Pipeline GitHub compares");
        expect(html).toContain('class="diff-matrix"');
        expect(html).toContain('class="diff-section-banner"');
        expect(html).toContain('class="diff-cell-trigger"');
        expect(html).toContain("Registered params JSON diffs");
        expect(html).not.toContain("Quick links for pipeline GitHub comparisons");
        expect(html).toContain("View 1 change");
        expect(html).not.toContain('<details class="run-section" open>');
        expect(html).toContain('class="diff-matrix-cell diff-matrix-cell-empty"');
        expect(html).not.toContain('class="count-badge"');
        expect((html.match(/class="diff-matrix-col-header"/g) ?? []).length).toBe(3);

        document.body.innerHTML = html;
        const pipelineRows = document.querySelector(".diff-matrix").querySelectorAll("tbody tr");
        expect(pipelineRows[0].querySelectorAll(".diff-matrix-cell-empty")).toHaveLength(2);
        expect(pipelineRows[0].querySelectorAll(".diff-matrix-cell .diff-cell-trigger")).toHaveLength(0);
        expect(pipelineRows[1].querySelectorAll(".diff-matrix-cell-empty")).toHaveLength(1);
        expect(pipelineRows[1].querySelectorAll(".diff-matrix-cell .diff-cell-trigger")).toHaveLength(1);
        expect(pipelineRows[2].querySelectorAll(".diff-matrix-cell-empty")).toHaveLength(0);
        expect(pipelineRows[2].querySelectorAll(".diff-matrix-cell .diff-cell-trigger")).toHaveLength(2);
    });

    it("renders config diff summaries in a comparison matrix", () => {
        const html = renderDiffPage({
            pipelineEntries: [],
            pipelinePairs: [],
            pipelinePairMap: new Map(),
            paramsEntries: [],
            paramsPairs: [],
            paramsPairMap: new Map(),
            configEntries: [
                {
                    key: "v0",
                    alias: "v0",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-0.config",
                },
                {
                    key: "v1",
                    alias: "v1",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-1.config",
                },
            ],
            configPairs: [
                {
                    baseAlias: "v0",
                    headAlias: "v1",
                    baseSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-0.config",
                    headSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-1.config",
                    changes: [
                        {
                            path: "lines 22-26",
                            left: [
                                "22   process {",
                                "23       withName:foo {",
                                "24 -         cpus=4",
                                "25       }",
                                "26   }",
                            ].join("\n"),
                            right: [
                                "22   process {",
                                "23       withName:foo {",
                                "24 +         cpus=1",
                                "25       }",
                                "26   }",
                            ].join("\n"),
                        },
                    ],
                },
            ],
            configPairMap: new Map([
                [
                    "v0\x00v1",
                    {
                        baseAlias: "v0",
                        headAlias: "v1",
                        changes: [
                            {
                                path: "lines 22-26",
                                left: [
                                    "22   process {",
                                    "23       withName:foo {",
                                    "24 -         cpus=4",
                                    "25       }",
                                    "26   }",
                                ].join("\n"),
                                right: [
                                    "22   process {",
                                    "23       withName:foo {",
                                    "24 +         cpus=1",
                                    "25       }",
                                    "26   }",
                                ].join("\n"),
                            },
                        ],
                    },
                ],
            ]),
        });

        expect(html).toContain("Registered config diffs");
        expect(html).toContain("View 1 change");
        expect(html).toContain("No registered params files were found.");
    });

    it("renders every registered params key in the comparison grid", async () => {
        await loadFixtureRegistries();

        const paramsEntries = buildParamsCompareEntries();

        expect(paramsEntries).toEqual([
            {
                key: "default",
                alias: "default",
                path: "name-deterministic.json",
                sourceUrl:
                    "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
            },
            {
                key: "deterministic",
                alias: "deterministic",
                path: "name-deterministic.json",
                sourceUrl:
                    "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
            },
            {
                key: "original",
                alias: "original",
                path: "name-original.json",
                sourceUrl:
                    "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-original.json",
            },
        ]);

        document.body.innerHTML = renderDiffPage({
            pipelineEntries: [],
            pipelinePairs: [],
            pipelinePairMap: new Map(),
            paramsEntries,
            paramsPairs: [],
            paramsPairMap: new Map(),
            configEntries: [],
            configPairs: [],
            configPairMap: new Map(),
        });

        expect(document.querySelectorAll(".diff-matrix-col-header")).toHaveLength(2);
        expect(document.querySelectorAll(".diff-matrix-row-header")).toHaveLength(3);
        expect(document.body.textContent).toContain("default");
        expect(document.body.textContent).toContain("deterministic");
        expect(document.body.textContent).toContain("original");
    });
});

describe("diff modal interactions", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="runs"></div>
            <div id="log-modal" class="log-modal-overlay" hidden>
                <div class="log-modal-box" role="dialog" aria-modal="true" aria-labelledby="log-modal-title">
                    <div class="log-modal-header">
                        <span id="log-modal-title" class="log-modal-title"></span>
                        <div class="log-modal-actions">
                            <a id="log-modal-external" href="#" class="log-modal-btn-external" target="_blank" rel="noopener"
                                >↗ Open</a
                            >
                            <button id="log-modal-close" class="log-modal-btn-close" aria-label="Close">✕</button>
                        </div>
                    </div>
                    <div id="log-modal-body" class="log-modal-body"></div>
                </div>
            </div>
        `;
    });

    it("opens diff cell content inside the shared modal", () => {
        document.getElementById("runs").innerHTML = renderDiffPage({
            pipelineEntries: [
                { key: "v1.0.0+abc1234", pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
                { key: "v1.1.0+def5678", pipelineName: "aind+ephys", pipelineVersion: "v1.1.0+def5678" },
            ],
            pipelinePairs: [
                {
                    pipelineName: "aind+ephys",
                    baseVersion: "v1.0.0+abc1234",
                    headVersion: "v1.1.0+def5678",
                    compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...def5678",
                    modalHtml: "<p>1 commit · 1 file</p>",
                },
            ],
            pipelinePairMap: new Map([
                [
                    "v1.0.0+abc1234\x00v1.1.0+def5678",
                    {
                        compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...def5678",
                        modalHtml: "<p>1 commit · 1 file</p>",
                    },
                ],
            ]),
            paramsEntries: [
                {
                    key: "deterministic",
                    alias: "deterministic",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                },
                {
                    key: "original",
                    alias: "original",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-original.json",
                },
            ],
            paramsPairs: [
                {
                    baseAlias: "deterministic",
                    headAlias: "original",
                    baseSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                    headSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-original.json",
                    changes: [{ path: "sorter.detect_sign", left: false, right: true }],
                },
            ],
            paramsPairMap: new Map([
                [
                    "deterministic\x00original",
                    {
                        baseAlias: "deterministic",
                        headAlias: "original",
                        changes: [{ path: "sorter.detect_sign", left: false, right: true }],
                    },
                ],
            ]),
        });

        initModal();
        document.querySelectorAll(".diff-cell-trigger")[1].click();

        expect(document.getElementById("log-modal").hidden).toBe(false);
        expect(document.getElementById("log-modal-title").hidden).toBe(true);
        expect(document.getElementById("log-modal-body").innerHTML).not.toContain("Registered params");
        expect(document.getElementById("log-modal-body").innerHTML).toContain(
            '<th scope="col"><a class="diff-inline-link" href="https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json" target="_blank" rel="noopener">deterministic</a></th>'
        );
        expect(document.getElementById("log-modal-body").innerHTML).toContain(
            '<th scope="col"><a class="diff-inline-link" href="https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-original.json" target="_blank" rel="noopener">original</a></th>'
        );
        expect(document.getElementById("log-modal-body").innerHTML).toContain('<th scope="col">Parameter</th>');
        expect(document.getElementById("log-modal-body").textContent).toContain("sorter.detect_sign");
        expect(document.getElementById("log-modal-body").textContent).not.toContain("− false");
        expect(document.getElementById("log-modal-body").textContent).not.toContain("+ true");
        expect(document.getElementById("log-modal-body").textContent).toContain("false");
        expect(document.getElementById("log-modal-body").textContent).toContain("true");
        expect(document.getElementById("log-modal-body").querySelectorAll("table")).toHaveLength(1);
        expect(document.getElementById("log-modal-external").hidden).toBe(true);
    });

    it("opens config diff content inside the shared modal", () => {
        document.getElementById("runs").innerHTML = renderDiffPage({
            pipelineEntries: [],
            pipelinePairs: [],
            pipelinePairMap: new Map(),
            paramsEntries: [],
            paramsPairs: [],
            paramsPairMap: new Map(),
            configEntries: [
                {
                    key: "v0",
                    alias: "v0",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-0.config",
                },
                {
                    key: "v1",
                    alias: "v1",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-1.config",
                },
            ],
            configPairs: [
                {
                    baseAlias: "v0",
                    headAlias: "v1",
                    baseSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-0.config",
                    headSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/configs/name-mit+engaging_revision-1.config",
                    changes: [
                        {
                            path: "lines 22-26",
                            left: [
                                "22   process {",
                                "23       withName:foo {",
                                "24 -         cpus=4",
                                "25       }",
                                "26   }",
                            ].join("\n"),
                            right: [
                                "22   process {",
                                "23       withName:foo {",
                                "24 +         cpus=1",
                                "25       }",
                                "26   }",
                            ].join("\n"),
                        },
                    ],
                },
            ],
            configPairMap: new Map([
                [
                    "v0\x00v1",
                    {
                        baseAlias: "v0",
                        headAlias: "v1",
                        changes: [
                            {
                                path: "lines 22-26",
                                left: [
                                    "22   process {",
                                    "23       withName:foo {",
                                    "24 -         cpus=4",
                                    "25       }",
                                    "26   }",
                                ].join("\n"),
                                right: [
                                    "22   process {",
                                    "23       withName:foo {",
                                    "24 +         cpus=1",
                                    "25       }",
                                    "26   }",
                                ].join("\n"),
                            },
                        ],
                    },
                ],
            ]),
        });

        initModal();
        document.querySelector(".diff-cell-trigger").click();

        expect(document.getElementById("log-modal").hidden).toBe(false);
        expect(document.getElementById("log-modal-body").innerHTML).toContain('<th scope="col">Config snippet</th>');
        expect(document.getElementById("log-modal-body").textContent).toContain("lines 22-26");
        expect(document.getElementById("log-modal-body").textContent).toContain("cpus=4");
        expect(document.getElementById("log-modal-body").textContent).toContain("cpus=1");
        expect(document.getElementById("log-modal-body").querySelectorAll(".diff-config-line-changed")).toHaveLength(2);
        expect(
            document
                .getElementById("log-modal-body")
                .querySelectorAll(".diff-config-line:not(.diff-config-line-changed)").length
        ).toBeGreaterThan(0);
    });

    it("pretty-prints JSON object values in params diff modal cells", () => {
        document.getElementById("runs").innerHTML = renderDiffPage({
            pipelineEntries: [],
            pipelinePairs: [],
            pipelinePairMap: new Map(),
            paramsEntries: [
                {
                    key: "all+channels",
                    alias: "all+channels",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-all+channels.json",
                },
                {
                    key: "deterministic",
                    alias: "deterministic",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                },
            ],
            paramsPairs: [
                {
                    baseAlias: "all+channels",
                    headAlias: "deterministic",
                    baseSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-all+channels.json",
                    headSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                    changes: [
                        {
                            path: "postprocessing.correlograms",
                            left: { window_ms: 50, bin_ms: 1 },
                            right: { window_ms: 100, bin_ms: 5 },
                        },
                    ],
                },
            ],
            paramsPairMap: new Map([
                [
                    "all+channels\x00deterministic",
                    {
                        baseAlias: "all+channels",
                        headAlias: "deterministic",
                        changes: [
                            {
                                path: "postprocessing.correlograms",
                                left: { window_ms: 50, bin_ms: 1 },
                                right: { window_ms: 100, bin_ms: 5 },
                            },
                        ],
                    },
                ],
            ]),
            configEntries: [],
            configPairs: [],
            configPairMap: new Map(),
        });

        initModal();
        document.querySelector(".diff-cell-trigger").click();

        const prettyValues = document.getElementById("log-modal-body").querySelectorAll(".diff-detail-chip-pretty");
        expect(prettyValues).toHaveLength(2);
        expect(prettyValues[0].tagName).toBe("PRE");
        expect(prettyValues[0].textContent).toBe('{\n  "window_ms": 50,\n  "bin_ms": 1\n}');
        expect(prettyValues[1].textContent).toBe('{\n  "window_ms": 100,\n  "bin_ms": 5\n}');
    });

    it("pretty-prints long JSON array values in params diff modal cells", () => {
        document.getElementById("runs").innerHTML = renderDiffPage({
            pipelineEntries: [],
            pipelinePairs: [],
            pipelinePairMap: new Map(),
            paramsEntries: [
                {
                    key: "all+channels",
                    alias: "all+channels",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-all+channels.json",
                },
                {
                    key: "deterministic",
                    alias: "deterministic",
                    sourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                },
            ],
            paramsPairs: [
                {
                    baseAlias: "all+channels",
                    headAlias: "deterministic",
                    baseSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-all+channels.json",
                    headSourceUrl:
                        "https://github.com/dandi-compute/dandi-compute-core/blob/main/src/dandi_compute_code/aind_ephys_pipeline/params/name-deterministic.json",
                    changes: [
                        {
                            path: "preprocessing.filters",
                            left: ["highpass", "car", "phase_shift", "artifact_removal", "qc_metrics"],
                            right: ["highpass", "phase_shift", "artifact_removal", "qc_metrics", "spike_sort"],
                        },
                    ],
                },
            ],
            paramsPairMap: new Map([
                [
                    "all+channels\x00deterministic",
                    {
                        baseAlias: "all+channels",
                        headAlias: "deterministic",
                        changes: [
                            {
                                path: "preprocessing.filters",
                                left: ["highpass", "car", "phase_shift", "artifact_removal", "qc_metrics"],
                                right: ["highpass", "phase_shift", "artifact_removal", "qc_metrics", "spike_sort"],
                            },
                        ],
                    },
                ],
            ]),
            configEntries: [],
            configPairs: [],
            configPairMap: new Map(),
        });

        initModal();
        document.querySelector(".diff-cell-trigger").click();

        const prettyValues = document.getElementById("log-modal-body").querySelectorAll(".diff-detail-chip-pretty");
        expect(prettyValues).toHaveLength(2);
        expect(prettyValues[0].tagName).toBe("PRE");
        expect(prettyValues[0].textContent).toContain('[\n  "highpass"');
        expect(prettyValues[1].textContent).toContain('[\n  "highpass"');
    });

    it("shows pipeline compare modal details in tables", () => {
        document.getElementById("runs").innerHTML = renderDiffPage({
            pipelineEntries: [
                { key: "v1.0.0+abc1234", pipelineName: "aind+ephys", pipelineVersion: "v1.0.0+abc1234" },
                { key: "v1.1.0+def5678", pipelineName: "aind+ephys", pipelineVersion: "v1.1.0+def5678" },
            ],
            pipelinePairs: [
                {
                    pipelineName: "aind+ephys",
                    baseVersion: "v1.0.0+abc1234",
                    headVersion: "v1.1.0+def5678",
                    compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...def5678",
                    modalHtml: "",
                },
            ],
            pipelinePairMap: new Map([
                [
                    "v1.0.0+abc1234\x00v1.1.0+def5678",
                    {
                        compareUrl: "https://github.com/CodyCBakerPhD/aind-ephys-pipeline/compare/abc1234...def5678",
                        modalHtml:
                            '<div class="diff-pair-card"><table class="diff-detail-table diff-detail-table-pair"><thead><tr><th class="diff-detail-corner" aria-hidden="true"></th><th scope="col">v1.0.0-abc1234</th><th scope="col">v1.1.0-def5678</th></tr></thead><tbody><tr><th scope="row" class="diff-detail-key">Pipeline version</th><td>v1.0.0-abc1234</td><td>v1.1.0-def5678</td></tr></tbody></table><table class="diff-detail-table"><thead><tr><th scope="col">Metric</th><th scope="col">Value</th></tr></thead><tbody><tr><th scope="row" class="diff-detail-key">Commits</th><td>1 commit</td></tr></tbody></table></div>',
                    },
                ],
            ]),
            paramsEntries: [],
            paramsPairs: [],
            paramsPairMap: new Map(),
        });

        initModal();
        document.querySelector(".diff-cell-trigger").click();

        expect(document.getElementById("log-modal").hidden).toBe(false);
        expect(document.getElementById("log-modal-title").hidden).toBe(true);
        expect(document.getElementById("log-modal-body").innerHTML).toContain("diff-detail-table");
        expect(document.getElementById("log-modal-body").innerHTML).toContain("v1.0.0-abc1234");
        expect(document.getElementById("log-modal-body").innerHTML).toContain("v1.1.0-def5678");
        expect(document.getElementById("log-modal-body").textContent).toContain("Commits");
    });

    it("hides the external action when opening inline-only modal content", () => {
        openHtmlModal("Params diff", "<p>Only modal content</p>");

        expect(document.getElementById("log-modal").hidden).toBe(false);
        expect(document.getElementById("log-modal-body").innerHTML).toContain("Only modal content");
        expect(document.getElementById("log-modal-external").hidden).toBe(true);
    });
});

describe("initLayoutToggle", () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="layout-bar"></div><div id="runs"></div>';
        window.history.replaceState(null, "", "/?view=tests&dandiset=001697");
    });

    it("updates URL layout query param while preserving other URL state", () => {
        initLayoutToggle();
        document.querySelector('[data-layout="tree"]').click();
        document.querySelector('[data-layout="flat"]').click();

        const params = new URLSearchParams(window.location.search);
        expect(params.get("layout")).toBe("flat");
        expect(params.get("view")).toBe("tests");
        expect(params.get("dandiset")).toBe("001697");
        expect(localStorage.getItem("layoutMode")).toBe("flat");
    });

    it("updates URL sort query param while preserving other URL state", () => {
        initLayoutToggle();
        const select = document.querySelector("[data-sort-mode]");
        select.value = "dandiset_id";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        const params = new URLSearchParams(window.location.search);
        expect(params.get("sort")).toBe("dandiset_id");
        expect(params.get("view")).toBe("tests");
        expect(params.get("dandiset")).toBe("001697");
        expect(localStorage.getItem("sortMode")).toBe("dandiset_id");
    });

    it("updates URL sort direction query param while preserving other URL state", () => {
        initLayoutToggle();
        document.querySelector("[data-sort-direction]").click();

        const params = new URLSearchParams(window.location.search);
        expect(params.get("sortDir")).toBe("asc");
        expect(params.get("view")).toBe("tests");
        expect(params.get("dandiset")).toBe("001697");
        expect(localStorage.getItem("sortDirection")).toBe("asc");
    });

    it("renders a refresh button in the layout bar", () => {
        initLayoutToggle();
        const refreshBtn = document.querySelector("[data-refresh-queue]");
        expect(refreshBtn).not.toBeNull();
        expect(refreshBtn.textContent).toMatch(/Refresh/);
    });

    it("does not break when called multiple times", () => {
        initLayoutToggle();
        initLayoutToggle();
        // All controls should still be present after two calls
        expect(document.querySelector("[data-refresh-queue]")).not.toBeNull();
        expect(document.querySelector("[data-layout='tree']")).not.toBeNull();
        expect(document.querySelector("[data-layout='flat']")).not.toBeNull();
        expect(document.querySelector("[data-sort-direction]")).not.toBeNull();
        expect(document.querySelector("[data-sort-mode]")).not.toBeNull();
    });
});

describe("clearQueueStateCache", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    it("removes the queue state ETag cache entry from sessionStorage", () => {
        sessionStorage.setItem(QUEUE_STATE_CACHE_KEY, JSON.stringify({ etag: '"v1"', body: "test" }));
        clearQueueStateCache();
        expect(sessionStorage.getItem(QUEUE_STATE_CACHE_KEY)).toBeNull();
    });

    it("does not throw when the cache entry is absent", () => {
        expect(() => clearQueueStateCache()).not.toThrow();
    });

    it("only removes the queue state entry, leaving other sessionStorage keys intact", () => {
        sessionStorage.setItem(QUEUE_STATE_CACHE_KEY, JSON.stringify({ etag: '"v1"', body: "test" }));
        sessionStorage.setItem("other-key", "other-value");
        clearQueueStateCache();
        expect(sessionStorage.getItem(QUEUE_STATE_CACHE_KEY)).toBeNull();
        expect(sessionStorage.getItem("other-key")).toBe("other-value");
    });
});

describe("cachedFetch immutable blob cache", () => {
    // Each test uses a unique blob id so the module-level in-memory blob cache
    // never leaks state between tests.
    let blobCounter = 0;
    function uniqueBlobUrl() {
        const id = `abcdef${String(blobCounter++).padStart(34, "0")}`;
        return `https://dandiarchive.s3.amazonaws.com/blobs/${id.slice(0, 3)}/${id.slice(3, 6)}/${id}`;
    }

    let originalFetch;

    beforeEach(() => {
        sessionStorage.clear();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        delete global.caches;
        sessionStorage.clear();
    });

    it("recognizes S3 blob URLs as immutable", () => {
        expect(isImmutableBlobUrl("https://dandiarchive.s3.amazonaws.com/blobs/abc/def/abcdef123")).toBe(true);
        expect(
            isImmutableBlobUrl("https://raw.githubusercontent.com/dandi-compute/dandi-compute-core/main/x.json")
        ).toBe(false);
        expect(isImmutableBlobUrl(null)).toBe(false);
    });

    it("fetches a blob once and serves repeat requests from cache without network", async () => {
        const url = uniqueBlobUrl();
        global.fetch = vi
            .fn()
            .mockResolvedValue(new Response("blob-body", { status: 200, headers: { "Content-Type": "text/plain" } }));

        const first = await cachedFetch(url);
        expect(await first.text()).toBe("blob-body");
        expect(global.fetch).toHaveBeenCalledTimes(1);
        // Plain GET: no If-None-Match revalidation header on blob requests.
        const init = global.fetch.mock.calls[0][1];
        expect(init?.headers?.get?.("If-None-Match") ?? null).toBeNull();

        const second = await cachedFetch(url);
        expect(await second.text()).toBe("blob-body");
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("serves a blob from a pre-existing sessionStorage entry without any fetch", async () => {
        const url = uniqueBlobUrl();
        sessionStorage.setItem(
            "aind_etag:" + url,
            JSON.stringify({ etag: '"v1"', body: "warm-body", contentType: "text/plain", status: 200 })
        );
        global.fetch = vi.fn();

        const resp = await cachedFetch(url);

        expect(await resp.text()).toBe("warm-body");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("still revalidates non-blob URLs with If-None-Match", async () => {
        const url = "https://raw.githubusercontent.com/dandi-compute/dandi-compute-core/main/some.json";
        sessionStorage.setItem(
            "aind_etag:" + url,
            JSON.stringify({ etag: '"v1"', body: '{"a":1}', contentType: "application/json", status: 200 })
        );
        global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));

        const resp = await cachedFetch(url);

        expect(await resp.json()).toEqual({ a: 1 });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [, init] = global.fetch.mock.calls[0];
        expect(init.headers.get("If-None-Match")).toBe('"v1"');
    });

    it("stores fetched blobs in the Cache API when available", async () => {
        const url = uniqueBlobUrl();
        const fakeCache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) };
        global.caches = { open: vi.fn().mockResolvedValue(fakeCache) };
        global.fetch = vi.fn().mockResolvedValue(new Response("api-body", { status: 200 }));

        const resp = await cachedFetch(url);
        expect(await resp.text()).toBe("api-body");

        // The Cache API write is fire-and-forget; allow it to settle.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fakeCache.put).toHaveBeenCalledTimes(1);
        expect(fakeCache.put.mock.calls[0][0]).toBe(url);
        // Cache API path is used instead of sessionStorage.
        expect(sessionStorage.getItem("aind_etag:" + url)).toBeNull();
    });

    it("serves a blob from the Cache API without any fetch", async () => {
        const url = uniqueBlobUrl();
        const cachedResp = new Response("cached-api-body", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
        });
        const fakeCache = { match: vi.fn().mockResolvedValue(cachedResp), put: vi.fn() };
        global.caches = { open: vi.fn().mockResolvedValue(fakeCache) };
        global.fetch = vi.fn();

        const resp = await cachedFetch(url);

        expect(await resp.text()).toBe("cached-api-body");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("falls back to the network when Cache API operations fail", async () => {
        const url = uniqueBlobUrl();
        global.caches = { open: vi.fn().mockRejectedValue(new Error("denied")) };
        global.fetch = vi.fn().mockResolvedValue(new Response("net-body", { status: 200 }));

        const resp = await cachedFetch(url);
        expect(await resp.text()).toBe("net-body");

        const url2 = uniqueBlobUrl();
        global.caches = {
            open: vi.fn().mockResolvedValue({ match: vi.fn().mockRejectedValue(new Error("boom")), put: vi.fn() }),
        };
        global.fetch = vi.fn().mockResolvedValue(new Response("net-body-2", { status: 200 }));
        const resp2 = await cachedFetch(url2);
        expect(await resp2.text()).toBe("net-body-2");
    });

    it("returns non-ok blob responses as-is without caching them", async () => {
        const url = uniqueBlobUrl();
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response("late-body", { status: 200 }));

        const first = await cachedFetch(url);
        expect(first.ok).toBe(false);
        expect(first.status).toBe(404);

        const second = await cachedFetch(url);
        expect(await second.text()).toBe("late-body");
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});

describe("fetchQueueConfig", () => {
    let originalFetch;

    beforeEach(() => {
        sessionStorage.clear();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        sessionStorage.clear();
    });

    it("fetches and parses the queue config through cachedFetch (no cache: no-cache opt-out)", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ priorities: ["000409"] }), {
                status: 200,
                headers: { "Content-Type": "application/json", ETag: '"cfg-v1"' },
            })
        );

        const config = await fetchQueueConfig();

        expect(config).toEqual({ priorities: ["000409"] });
        const [url, init] = global.fetch.mock.calls[0];
        expect(init.cache).toBeUndefined();
        // ETag-cached like other mutable sources, enabling 304 revalidation.
        expect(JSON.parse(sessionStorage.getItem("aind_etag:" + url)).etag).toBe('"cfg-v1"');
    });

    it("returns null on fetch failure", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
        expect(await fetchQueueConfig()).toBeNull();
    });
});

describe("ensureRegistriesLoaded", () => {
    it("memoizes the registry load across concurrent callers", async () => {
        const originalFetch = global.fetch;
        global.fetch = vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify(REGISTERED_PARAMS_FIXTURE), { status: 200 }));
        try {
            const [first, second] = await Promise.all([ensureRegistriesLoaded(), ensureRegistriesLoaded()]);
            expect(first).toBe(second);
            // One params + one config fetch in total, not per caller.
            expect(global.fetch.mock.calls.length).toBeLessThanOrEqual(2);

            await ensureRegistriesLoaded();
            expect(global.fetch.mock.calls.length).toBeLessThanOrEqual(2);
        } finally {
            global.fetch = originalFetch;
        }
    });
});

describe("progressive hydration helpers", () => {
    const BASE_ENTRY = {
        dandiset_id: "000777",
        subject: "sub1",
        session: "ses1",
        pipeline: "aind+ephys",
        version: "v1.2.4",
        params: "1cbdbee",
        config: "7940dfd",
        attempt: 1,
        has_code: true,
        has_been_submitted: true,
        has_output: true,
        has_logs: true,
    };

    it("derives flag-only status from JSONL flags", () => {
        expect(deriveFlagStatus({ hasOutput: true })).toBe("success");
        expect(deriveFlagStatus({ hasOutput: false, hasBeenSubmitted: true, hasLogs: false })).toBe("running");
        expect(deriveFlagStatus({ hasOutput: false, hasBeenSubmitted: false, hasLogs: false, hasCode: true })).toBe(
            "queued"
        );
        expect(deriveFlagStatus({ hasOutput: false, hasBeenSubmitted: true, hasLogs: true })).toBe("failed");
    });

    it("prefers an explicit upstream status over flag derivation", () => {
        expect(deriveFlagStatus({ stateStatus: "failed", hasOutput: true })).toBe("failed");
    });

    it("surfaces upstream status/failure_step fields from state entries", () => {
        const [run] = parseQueueEntries([{ ...BASE_ENTRY, status: "failed", failure_step: "pre-processing" }]);
        expect(run.stateStatus).toBe("failed");
        expect(run.stateFailureStep).toBe("pre-processing");
        const [plain] = parseQueueEntries([BASE_ENTRY]);
        expect(plain.stateStatus).toBeNull();
        expect(plain.stateFailureStep).toBeNull();
    });

    it("builds an initial run skeleton with sync-derived data and unknown failureStep", () => {
        // Two-step: parse once to learn the computed run path, then attach
        // output_paths keyed under that path.
        const [pathProbe] = parseQueueEntries([BASE_ENTRY]);
        const entry = {
            ...BASE_ENTRY,
            output_paths: {
                [`${pathProbe.path}/logs/trace.txt`]: "aaabbbccc111",
                [`${pathProbe.path}/derivatives/visualization/summary/psd.png`]: "aaabbbccc222",
            },
        };
        const [run] = parseQueueEntries([entry]);
        const initial = buildInitialRun(run);
        expect(initial.status).toBe("success"); // has_output flag only
        expect(initial.failureStep).toBeNull(); // unknown until hydration
        expect(initial.traceLoaded).toBe(false);
        expect(initial.detailsLoaded).toBe(false);
        expect(initial.qcLoaded).toBe(false);
        expect(initial.tasks).toEqual([]);
        expect(initial.generatedBy).toEqual([]);
        expect(initial.qualityControl).toBeNull();
        expect(initial.logFiles).toContain("trace.txt");
        expect(initial.vizData).toHaveLength(1);
        expect(initial.vizData[0].images[0].name).toBe("psd.png");
    });

    it("marks only trace-refinable successes as provisional", () => {
        // Output + logs: the ✓ could flip once the trace lands.
        const [refinable] = parseQueueEntries([BASE_ENTRY]);
        expect(buildInitialRun(refinable).statusProvisional).toBe(true);
        // An explicit upstream status is already authoritative.
        const [authoritative] = parseQueueEntries([{ ...BASE_ENTRY, status: "success" }]);
        expect(buildInitialRun(authoritative).statusProvisional).toBe(false);
        // No logs → no trace exists to refine anything.
        const [running] = parseQueueEntries([{ ...BASE_ENTRY, has_output: false, has_logs: false }]);
        expect(buildInitialRun(running).statusProvisional).toBe(false);
        // Failed-by-flags runs can only gain detail, never flip optimistically.
        const [failed] = parseQueueEntries([{ ...BASE_ENTRY, has_output: false, has_logs: true }]);
        expect(buildInitialRun(failed).statusProvisional).toBe(false);
    });

    it("detects quality_control.json availability from output_paths", () => {
        const [probe] = parseQueueEntries([BASE_ENTRY]);
        const withQc = parseQueueEntries([
            {
                ...BASE_ENTRY,
                output_paths: { [`${probe.path}/derivatives/visualization/quality_control.json`]: "abcdef123" },
            },
        ])[0];
        const withoutQc = parseQueueEntries([
            { ...BASE_ENTRY, output_paths: { [`${probe.path}/logs/trace.txt`]: "abcdef456" } },
        ])[0];
        expect(runHasQualityControl(withQc)).toBe(true);
        expect(runHasQualityControl(withoutQc)).toBe(false);
        expect(runHasQualityControl({ ...withQc, hasOutput: false })).toBe(false);
    });
});

describe("live squeue monitor", () => {
    const RAW = "https://raw.githubusercontent.com/dandi-compute/dandi-compute-global-logs/refs/heads";
    // One line of `squeue --me --format=%.10i %15P %40j %.2t %.10M %.6D %.2C %.10m %30R`.
    const squeueLine = (id, partition, name, state, time, nodes, cpus, memory, reason) =>
        [
            id.padStart(10),
            partition.padEnd(15),
            name.padEnd(40),
            state.padStart(2),
            time.padStart(10),
            nodes.padStart(6),
            cpus.padStart(2),
            memory.padStart(10),
            reason.padEnd(30),
        ].join(" ");
    const SQUEUE_HEADER = squeueLine(
        "JOBID",
        "PARTITION",
        "NAME",
        "ST",
        "TIME",
        "NODES",
        "CP",
        "MIN_MEMORY",
        "NODELIST(REASON)"
    );
    const SQUEUE_STDOUT = [
        SQUEUE_HEADER,
        squeueLine("28006829", "mit_preemptable", "DANDI-Compute-Submitter", "R", "0:52", "1", "1", "1G", "node1409"),
        squeueLine("28006900", "mit_preemptable", "aind <ephys>", "R", "12:01", "1", "8", "64G", "node1410"),
        squeueLine("28006901", "mit_preemptable", "aind-ephys", "PD", "0:00", "1", "8", "64G", "(Priority)"),
        "",
    ].join("\n");

    // What launcher/disk.sh records: df of the project filesystems, then the home directory's quota report.
    const DISK_DF_STDOUT = [
        "Mounted               Size  Used Avail Use%",
        "/orcd/data/dandi/001  968T  792T  176T  72%",
        "/orcd/data/dandi/002  682T  634T   48T  93%",
    ].join("\n");
    const DISK_STDOUT = [
        DISK_DF_STDOUT,
        "",
        "                               QUOTA REPORT",
        " Space   | Usage (GB) | Limit (GB) | % Used | Files | Limit | % Used",
        "---------+------------+------------+--------+-------+-------+--------",
        " HOME    |      170.7 |      200.0 |  85.36 |  1.0M |  1.0M | 100.00",
        " SCRATCH |        0.0 |     1024.0 |   0.00 |     1 |  1.0M |   0.00",
        " POOL    |        0.0 |     1024.0 |   0.00 |     1 |  1.1M |   0.00",
        "",
    ].join("\n");

    // Serve `files` (branch → path → text) for the global logs repository; anything else is a 404.
    // `branches`, when given, is what the GitHub API lists as the repository's monitor* branches.
    // `branches` is a list for the monitor/ branches, or { monitor, disk } lists per kind.
    const BRANCHES_API =
        "https://api.github.com/repos/dandi-compute/dandi-compute-global-logs/git/matching-refs/heads/monitor";
    const DISK_BRANCHES_API =
        "https://api.github.com/repos/dandi-compute/dandi-compute-global-logs/git/matching-refs/heads/disk";
    function serveGlobalLogs(files, branches = undefined) {
        const listed = Array.isArray(branches) || branches instanceof Error ? { monitor: branches } : (branches ?? {});
        return vi.fn(async (url) => {
            const kind = url === BRANCHES_API ? "monitor" : url === DISK_BRANCHES_API ? "disk" : null;
            if (kind) {
                const names = listed[kind];
                if (names instanceof Error) throw names;
                if (names === undefined) return new Response("{}", { status: 404 });
                const refs = names.map((name) => ({ ref: `refs/heads/${name}`, object: { sha: "0".repeat(40) } }));
                return new Response(JSON.stringify(refs), { status: 200 });
            }
            for (const [branch, paths] of Object.entries(files)) {
                const prefix = `${RAW}/${branch}/`;
                if (!url.startsWith(prefix)) continue;
                const body = paths[url.slice(prefix.length)];
                if (body instanceof Error) throw body;
                if (typeof body === "number") return new Response("", { status: body });
                if (body !== undefined) return new Response(body, { status: 200 });
            }
            return new Response("404: Not Found", { status: 404 });
        });
    }
    const snapshotFiles = (record, extra = {}) => ({
        "monitor/LATEST": `${record}\n`,
        [`monitor/${record}/stdout`]: SQUEUE_STDOUT,
        [`monitor/${record}/stderr`]: "",
        [`monitor/${record}/exit_status`]: "0\n",
        ...extra,
    });
    const diskSnapshotFiles = (record) => ({
        "disk/LATEST": `${record}\n`,
        [`disk/${record}/stdout`]: DISK_STDOUT,
        [`disk/${record}/stderr`]: "",
        [`disk/${record}/exit_status`]: "0\n",
    });

    // 2026-11-05 14:48:02 EST, three minutes after the 14:45:02 snapshot.
    const NOW = new Date("2026-11-05T19:48:02Z");
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        stopMonitors();
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("names today's day branch by the cluster's US Eastern date", () => {
        // 22:30 EST on Nov 5 is already Nov 6 in UTC.
        expect(monitorDayBranch(new Date("2026-11-06T03:30:00Z"))).toBe("monitor/2026-11-05");
        expect(monitorDayBranch(new Date("2026-11-06T05:00:00Z"))).toBe("monitor/2026-11-06");
        // Daylight time: 23:00 EDT on Jun 30.
        expect(monitorDayBranch(new Date("2026-07-01T03:00:00Z"))).toBe("monitor/2026-06-30");
        expect(monitorDayBranch(new Date("2026-07-01T03:00:00Z"), "disk")).toBe("disk/2026-06-30");
    });

    it("reads a snapshot's time from its record name as US Eastern wall time", () => {
        expect(monitorRecordTime("14/20261105T144502-squeue")).toBe(Date.parse("2026-11-05T19:45:02Z"));
        expect(monitorRecordTime("14/20261105T143001-usage")).toBe(Date.parse("2026-11-05T19:30:01Z"));
        expect(monitorRecordTime("06/20260701T060000-squeue")).toBe(Date.parse("2026-07-01T10:00:00Z"));
        expect(monitorRecordTime("20261105T144502-squeue")).toBeNull();
        expect(monitorRecordTime(undefined)).toBeNull();
    });

    it("tallies jobs by the ST column of squeue's table", () => {
        expect(summarizeSqueueJobs(SQUEUE_STDOUT)).toEqual({
            jobs: 3,
            states: [
                ["R", 2],
                ["PD", 1],
            ],
        });
        // Codes the tally doesn't know go last, alphabetically.
        const unusual = [
            SQUEUE_HEADER,
            squeueLine("1", "p", "a", "SE", "0:00", "1", "1", "1G", "(None)"),
            squeueLine("2", "p", "b", "PD", "0:00", "1", "1", "1G", "(Priority)"),
            squeueLine("3", "p", "c", "BF", "0:00", "1", "1", "1G", "(None)"),
        ].join("\n");
        expect(summarizeSqueueJobs(unusual).states).toEqual([
            ["PD", 1],
            ["BF", 1],
            ["SE", 1],
        ]);
        expect(summarizeSqueueJobs(`${SQUEUE_HEADER}\n`)).toEqual({ jobs: 0, states: [] });
        expect(summarizeSqueueJobs("")).toBeNull();
        expect(summarizeSqueueJobs("slurm_load_jobs error: Socket timed out\n")).toBeNull();
    });

    it("reads the newest snapshot from today's day branch", async () => {
        global.fetch = serveGlobalLogs({ "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue") });

        const snapshot = await fetchLatestSqueueSnapshot(NOW);

        expect(snapshot).toEqual({
            branch: "monitor/2026-11-05",
            recordName: "14/20261105T144502-squeue",
            takenAt: Date.parse("2026-11-05T19:45:02Z"),
            stdout: SQUEUE_STDOUT,
            stderr: "",
            exitStatus: "0",
            sourceUrl:
                "https://github.com/dandi-compute/dandi-compute-global-logs/blob/monitor/2026-11-05/monitor/14/20261105T144502-squeue/stdout",
        });
        const urls = global.fetch.mock.calls.map(([url]) => url);
        expect(urls[0]).toBe(`${RAW}/monitor/2026-11-05/monitor/LATEST`);
        // The pointer is only needed when today has no branch.
        expect(urls.some((url) => url.includes("monitor/latest"))).toBe(false);
    });

    it("follows monitor/latest when today has no day branch", async () => {
        global.fetch = serveGlobalLogs({
            "monitor/latest": { LATEST: "monitor/2026-11-02\n" },
            "monitor/2026-11-02": snapshotFiles("06/20261102T065502-squeue"),
        });

        const snapshot = await fetchLatestSqueueSnapshot(NOW);

        expect(snapshot.branch).toBe("monitor/2026-11-02");
        expect(snapshot.recordName).toBe("06/20261102T065502-squeue");
        expect(snapshot.takenAt).toBe(Date.parse("2026-11-02T11:55:02Z"));
        expect(global.fetch.mock.calls.map(([url]) => url).slice(0, 3)).toEqual([
            `${RAW}/monitor/2026-11-05/monitor/LATEST`,
            `${RAW}/monitor/latest/LATEST`,
            `${RAW}/monitor/2026-11-02/monitor/LATEST`,
        ]);
    });

    it("falls back to the newest day branch GitHub lists when there is no usable pointer", async () => {
        const listed = [
            "monitor/2026-09-28",
            "monitor/latest",
            "monitor/2026-11-02",
            "monitor-notes",
            "monitor/2026-10-31",
        ];
        const files = { "monitor/2026-11-02": snapshotFiles("06/20261102T065502-squeue") };

        // No pointer at all.
        global.fetch = serveGlobalLogs(files, listed);
        let snapshot = await fetchLatestSqueueSnapshot(NOW);
        expect(snapshot.branch).toBe("monitor/2026-11-02");
        expect(snapshot.recordName).toBe("06/20261102T065502-squeue");

        // A pointer naming a day whose branch has since been deleted.
        stopMonitors(); // forget the listing kept from the call above
        global.fetch = serveGlobalLogs({ ...files, "monitor/latest": { LATEST: "monitor/2026-11-01\n" } }, listed);
        snapshot = await fetchLatestSqueueSnapshot(NOW);
        expect(snapshot.branch).toBe("monitor/2026-11-02");
        expect(global.fetch.mock.calls.map(([url]) => url).slice(0, 5)).toEqual([
            `${RAW}/monitor/2026-11-05/monitor/LATEST`,
            `${RAW}/monitor/latest/LATEST`,
            `${RAW}/monitor/2026-11-01/monitor/LATEST`,
            BRANCHES_API,
            `${RAW}/monitor/2026-11-02/monitor/LATEST`,
        ]);
    });

    it("reads the disk snapshot from its own day branches, pointer branch and listing", async () => {
        const record = "14/20261105T143001-usage";
        global.fetch = serveGlobalLogs({
            "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue"),
            "disk/2026-11-05": diskSnapshotFiles(record),
        });
        const disk = await fetchLatestDiskSnapshot(NOW);
        expect(disk).toEqual({
            branch: "disk/2026-11-05",
            recordName: record,
            takenAt: Date.parse("2026-11-05T19:30:01Z"),
            stdout: DISK_STDOUT,
            stderr: "",
            exitStatus: "0",
            sourceUrl:
                "https://github.com/dandi-compute/dandi-compute-global-logs/blob/disk/2026-11-05/disk/14/20261105T143001-usage/stdout",
        });
        expect(global.fetch.mock.calls.map(([url]) => url)[0]).toBe(`${RAW}/disk/2026-11-05/disk/LATEST`);
        // The queue's branches never stand in for the disk's.
        expect((await fetchLatestSqueueSnapshot(NOW)).recordName).toBe("14/20261105T144502-squeue");

        // No disk branch today: disk/latest, then the listing of disk/ branches, each kept apart from
        // the monitor's.
        stopMonitors();
        global.fetch = serveGlobalLogs(
            {
                "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue"),
                "disk/latest": { LATEST: "disk/2026-11-02\n" },
                "disk/2026-11-02": diskSnapshotFiles("06/20261102T063001-usage"),
            },
            ["monitor/2026-11-05"]
        );
        expect((await fetchLatestDiskSnapshot(NOW)).branch).toBe("disk/2026-11-02");
        stopMonitors();
        global.fetch = serveGlobalLogs(
            { "disk/2026-11-02": diskSnapshotFiles("06/20261102T063001-usage") },
            { monitor: ["monitor/2026-11-05"], disk: ["disk/2026-11-02", "disk/latest"] }
        );
        expect((await fetchLatestDiskSnapshot(NOW)).branch).toBe("disk/2026-11-02");
        expect(global.fetch.mock.calls.map(([url]) => url)).toContain(DISK_BRANCHES_API);
        expect(await fetchLatestSqueueSnapshot(NOW)).toBeNull();
    });

    it("tolerates a missing stderr or exit status but not an unreachable repository", async () => {
        const record = "14/20261105T144502-squeue";
        global.fetch = serveGlobalLogs({
            "monitor/2026-11-05": snapshotFiles(record, {
                [`monitor/${record}/stderr`]: new TypeError("Failed to fetch"),
                [`monitor/${record}/exit_status`]: undefined,
            }),
        });
        const snapshot = await fetchLatestSqueueSnapshot(NOW);
        expect(snapshot.stderr).toBe("");
        expect(snapshot.exitStatus).toBeNull();

        global.fetch = serveGlobalLogs({ "monitor/2026-11-05": { "monitor/LATEST": 503 } });
        await expect(fetchLatestSqueueSnapshot(NOW)).rejects.toThrow("HTTP 503");
    });

    it("renders a fresh snapshot as a live terminal", () => {
        const html = renderSqueueMonitor(
            {
                snapshot: {
                    branch: "monitor/2026-11-05",
                    recordName: "14/20261105T144502-squeue",
                    takenAt: Date.parse("2026-11-05T19:45:02Z"),
                    stdout: SQUEUE_STDOUT,
                    stderr: "",
                    exitStatus: "0",
                    sourceUrl: "https://github.com/dandi-compute/dandi-compute-global-logs/blob/x/stdout",
                },
            },
            NOW.getTime()
        );
        const root = document.createElement("div");
        root.innerHTML = html;

        expect(root.querySelector(".squeue-status").textContent).toBe("live");
        expect(root.querySelector(".squeue-status").className).toContain("squeue-status-live");
        expect(root.querySelector(".squeue-age").textContent).toBe("3 min ago");
        expect(root.querySelector(".squeue-age").getAttribute("datetime")).toBe("2026-11-05T19:45:02.000Z");
        // The bar holds one chip per state, with no title or job count.
        const chips = [...root.querySelectorAll(".squeue-tally .squeue-st")];
        expect(chips.map((chip) => [chip.textContent, chip.title, chip.className])).toEqual([
            ["R 2", "running", "squeue-st squeue-st-running"],
            ["PD 1", "pending", "squeue-st squeue-st-pending"],
        ]);
        expect(root.querySelector(".squeue-bar").textContent).not.toMatch(/jobs?\b|MIT Engaging/);
        expect(root.querySelector(".squeue-source").textContent).toBe("monitor/2026-11-05 ↗");

        // squeue's output is a table: no prompt, no cursor, no padding.
        const screen = root.querySelector(".squeue-screen");
        expect(screen.textContent).not.toContain("$");
        expect(screen.querySelector(".squeue-cursor")).toBeNull();
        const headers = [...screen.querySelectorAll("thead th")];
        expect(headers.map((th) => th.textContent)).toEqual([
            "JOBID",
            "PARTITION",
            "NAME",
            "ST",
            "TIME",
            "NODES",
            "CP",
            "MIN_MEMORY",
            "NODELIST(REASON)",
        ]);
        // Right-aligned in squeue, right-aligned here.
        expect(headers.filter((th) => th.className === "squeue-num").map((th) => th.textContent)).toEqual([
            "JOBID",
            "ST",
            "TIME",
            "NODES",
            "CP",
            "MIN_MEMORY",
        ]);
        const rows = [...screen.querySelectorAll("tbody tr")].map((tr) => [...tr.cells]);
        expect(rows.map((cells) => cells.map((td) => td.textContent))).toEqual([
            ["28006829", "mit_preemptable", "DANDI-Compute-Submitter", "R", "0:52", "1", "1", "1G", "node1409"],
            ["28006900", "mit_preemptable", "aind <ephys>", "R", "12:01", "1", "8", "64G", "node1410"],
            ["28006901", "mit_preemptable", "aind-ephys", "PD", "0:00", "1", "8", "64G", "(Priority)"],
        ]);
        // Job names are text, never markup.
        expect(screen.innerHTML).toContain("aind &lt;ephys&gt;");
        expect(rows[2][3].querySelector(".squeue-st").className).toBe("squeue-st squeue-st-pending");
        expect(rows[2][3].querySelector(".squeue-st").title).toBe("pending");
        // A pending job's reason is set apart from a node list.
        expect(rows[2][8].className).toBe("squeue-reason");
        expect(rows[0][8].className).toBe("");
        expect(screen.querySelector(".squeue-stderr")).toBeNull();
    });

    it("shows an empty queue, the older format with USER, and output that is not a table", () => {
        const screenOf = (stdout) => {
            const root = document.createElement("div");
            const snapshot = { branch: "b", sourceUrl: "u", stdout, stderr: "", exitStatus: "0", takenAt: 0 };
            root.innerHTML = renderSqueueMonitor({ snapshot }, 0);
            return root.querySelector(".squeue-screen");
        };

        const empty = screenOf(`${SQUEUE_HEADER}\n`);
        expect(empty.querySelectorAll("thead th")).toHaveLength(9);
        expect(empty.querySelector("tbody td.squeue-empty").textContent).toBe("No jobs in the queue.");
        expect(empty.querySelector("tbody td.squeue-empty").colSpan).toBe(9);

        // Snapshots recorded before USER was dropped from the format still render as a table.
        const older = [
            "     JOBID PARTITION       NAME                                     USER       ST       TIME  NODES CP MIN_MEMORY NODELIST(REASON)              ",
            "  28006829 mit_preemptable DANDI-Compute-Submitter                  cb239       R       0:52      1  1         1G node1409                      ",
        ].join("\n");
        const olderScreen = screenOf(older);
        expect([...olderScreen.querySelectorAll("thead th")].map((th) => th.textContent)).toContain("USER");
        expect([...olderScreen.querySelectorAll("tbody td")].map((td) => td.textContent)).toContain("cb239");

        // Columns that don't line up with the header words fall back to the text as it is.
        const ragged = screenOf("JOBID STATE\n12 running late\n");
        expect(ragged.querySelector("table")).toBeNull();
        expect(ragged.querySelector("pre.squeue-text .squeue-head").textContent).toBe("JOBID STATE");
        expect(ragged.querySelector("pre.squeue-text").textContent).toBe("JOBID STATE\n12 running late");
    });

    it("marks an old snapshot stale and shows a failed squeue's stderr and exit status", () => {
        const root = document.createElement("div");
        root.innerHTML = renderSqueueMonitor(
            {
                snapshot: {
                    branch: "monitor/2026-11-02",
                    recordName: "06/20261102T065502-squeue",
                    takenAt: Date.parse("2026-11-02T11:55:02Z"),
                    stdout: "",
                    stderr: "slurm_load_jobs error: Socket timed out on send/recv operation\n",
                    exitStatus: "1",
                    sourceUrl: "https://example.org/stdout",
                },
                error: "Could not load the latest squeue snapshot: Failed to fetch",
            },
            NOW.getTime()
        );

        expect(root.querySelector(".squeue-status").textContent).toBe("stale");
        expect(root.querySelector(".squeue-age").textContent).toBe("3 days ago");
        expect(root.querySelector(".squeue-refresh-failed").title).toContain("Failed to fetch");
        expect(root.querySelector(".squeue-tally")).toBeNull();
        expect(root.querySelector(".squeue-screen table")).toBeNull();
        expect([...root.querySelectorAll(".squeue-stderr")].map((el) => el.textContent)).toEqual([
            "slurm_load_jobs error: Socket timed out on send/recv operation\n[exit status 1]",
        ]);
    });

    it("words a snapshot's age by minutes, hours or days, and titles only known states", () => {
        const render = (agoMs, stdout = SQUEUE_STDOUT) => {
            const root = document.createElement("div");
            const snapshot = { branch: "b", sourceUrl: "u", stdout, stderr: "", exitStatus: "0", takenAt: 0 };
            root.innerHTML = renderSqueueMonitor({ snapshot }, agoMs);
            return root;
        };
        expect(render(30 * 1000).querySelector(".squeue-age").textContent).toBe("just now");
        // A snapshot from a skewed clock's future is "just now" too, not a negative age.
        expect(render(-5 * 60 * 1000).querySelector(".squeue-age").textContent).toBe("just now");
        expect(render(14 * 60 * 1000).querySelector(".squeue-status").textContent).toBe("live");
        expect(render(16 * 60 * 1000).querySelector(".squeue-status").textContent).toBe("stale");
        expect(render(5 * 3600 * 1000 + 59 * 60 * 1000).querySelector(".squeue-age").textContent).toBe("5 h ago");
        expect(render(47 * 3600 * 1000).querySelector(".squeue-age").textContent).toBe("47 h ago");
        expect(render(48 * 3600 * 1000).querySelector(".squeue-age").textContent).toBe("2 days ago");

        const states = render(
            0,
            [SQUEUE_HEADER, squeueLine("1", "p", "a", "XX", "0", "1", "1", "1G", "")].join("\n")
        ).querySelectorAll(".squeue-tally .squeue-st");
        expect([...states].map((el) => [el.textContent, el.hasAttribute("title")])).toEqual([["XX 1", false]]);
    });

    it("trims blank lines around the output in linear time", () => {
        const root = document.createElement("div");
        const snapshot = {
            branch: "b",
            sourceUrl: "u",
            // The quadratic regex trim this replaced took ~48 s here (newlines run after text).
            stdout: `\n\n${SQUEUE_HEADER}\n${"\n".repeat(200000)}x\n\n`,
            stderr: `${"\n".repeat(200000)}boom`,
            exitStatus: "1",
            takenAt: NOW.getTime(),
        };
        const started = performance.now();
        root.innerHTML = renderSqueueMonitor({ snapshot }, NOW.getTime());
        expect(performance.now() - started).toBeLessThan(2000);
        const [output, messages] = root.querySelectorAll(".squeue-screen pre.squeue-text");
        expect(output.textContent.startsWith(`${SQUEUE_HEADER.trimEnd()}\n`)).toBe(true);
        expect(output.textContent.endsWith("\nx")).toBe(true);
        expect(messages.textContent).toBe("boom\n[exit status 1]");
    });

    it("renders the connecting, missing and unavailable states", () => {
        const statusOf = (state) => {
            const root = document.createElement("div");
            root.innerHTML = renderSqueueMonitor(state, NOW.getTime());
            return [
                root.querySelector(".squeue-status").textContent,
                root.querySelector(".squeue-stderr")?.textContent,
            ];
        };
        expect(statusOf({ snapshot: undefined })).toEqual(["connecting", undefined]);
        expect(statusOf({ snapshot: null })).toEqual([
            "no snapshots",
            "No squeue snapshot found in dandi-compute-global-logs.",
        ]);
        expect(statusOf({ snapshot: undefined, error: "Could not load <it>" })).toEqual([
            "unavailable",
            "Could not load <it>",
        ]);
    });

    it("hides the infrastructure jobs by the NAME column and leaves other output alone", () => {
        expect(SQUEUE_INFRASTRUCTURE_JOB_NAMES.has("DANDI-Compute-Submitter")).toBe(true);
        const hidden = hideSqueueJobs(SQUEUE_STDOUT, SQUEUE_INFRASTRUCTURE_JOB_NAMES);
        const lines = hidden.split("\n");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe(SQUEUE_HEADER.trimEnd());
        expect(hidden).not.toContain("DANDI-Compute-Submitter");
        expect(hidden).toContain("aind <ephys>");
        expect(hidden).toContain("aind-ephys");
        // Only an exact name matches; a pipeline job is never a submitter.
        expect(hideSqueueJobs(SQUEUE_STDOUT, new Set(["aind"]))).toBe(squeueScreenTextOf(SQUEUE_STDOUT));
        // Nothing to hide, or output that is not a table with a NAME column, passes through.
        expect(hideSqueueJobs(SQUEUE_STDOUT, null)).toBe(SQUEUE_STDOUT);
        expect(hideSqueueJobs(SQUEUE_STDOUT, new Set())).toBe(SQUEUE_STDOUT);
        expect(hideSqueueJobs("JOBID STATE\n12 running late\n", SQUEUE_INFRASTRUCTURE_JOB_NAMES)).toBe(
            "JOBID STATE\n12 running late\n"
        );
        expect(hideSqueueJobs("", SQUEUE_INFRASTRUCTURE_JOB_NAMES)).toBe("");
        // Hiding the only job leaves the header, which renders as an empty queue.
        const onlySubmitter = [
            SQUEUE_HEADER,
            squeueLine("1", "p", "DANDI-Compute-Submitter", "R", "0:52", "1", "1", "1G", "node1409"),
        ].join("\n");
        expect(hideSqueueJobs(onlySubmitter, SQUEUE_INFRASTRUCTURE_JOB_NAMES)).toBe(SQUEUE_HEADER.trimEnd());
    });
    const squeueScreenTextOf = (text) =>
        text
            .split("\n")
            .map((l) => l.trimEnd())
            .join("\n")
            .replace(/\n+$/, "");

    it("renders the dashboard snapshot without the submitter but the Status page with it", () => {
        const snapshot = {
            branch: "monitor/2026-11-05",
            recordName: "14/20261105T144502-squeue",
            takenAt: Date.parse("2026-11-05T19:45:02Z"),
            stdout: SQUEUE_STDOUT,
            stderr: "",
            exitStatus: "0",
            sourceUrl: "https://example.org/stdout",
        };
        const dashboard = document.createElement("div");
        dashboard.innerHTML = renderSqueueMonitor({ snapshot }, NOW.getTime(), {
            hiddenJobNames: SQUEUE_INFRASTRUCTURE_JOB_NAMES,
        });
        const names = (root) => [...root.querySelectorAll("tbody tr")].map((tr) => tr.cells[2].textContent);
        expect(names(dashboard)).toEqual(["aind <ephys>", "aind-ephys"]);
        // The tally counts only what is shown.
        expect([...dashboard.querySelectorAll(".squeue-tally .squeue-st")].map((chip) => chip.textContent)).toEqual([
            "R 1",
            "PD 1",
        ]);
        // The snapshot itself is untouched, so a later unfiltered draw still has every job.
        expect(snapshot.stdout).toBe(SQUEUE_STDOUT);

        const status = document.createElement("div");
        status.innerHTML = renderSqueueMonitor({ snapshot }, NOW.getTime());
        expect(names(status)).toEqual(["DANDI-Compute-Submitter", "aind <ephys>", "aind-ephys"]);
        expect([...status.querySelectorAll(".squeue-tally .squeue-st")].map((chip) => chip.textContent)).toEqual([
            "R 2",
            "PD 1",
        ]);
    });

    it("mounts into a given container with every job shown (the Status page)", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        document.body.innerHTML = `<div class="page-content"><h1>Cluster Status</h1><div id="runs"></div></div>`;
        global.fetch = serveGlobalLogs({ "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue") });

        await initSqueueMonitor({ container: document.getElementById("runs") });
        const monitor = document.getElementById("squeue-monitor");
        expect(monitor.parentElement).toBe(document.getElementById("runs"));
        expect(document.querySelector(".page-content").firstElementChild.tagName).toBe("H1");
        expect(monitor.querySelector(".squeue-status").textContent).toBe("live");
        expect(monitor.querySelectorAll("tbody tr")).toHaveLength(3);
        expect(monitor.querySelector(".squeue-screen").textContent).toContain("DANDI-Compute-Submitter");
    });

    it("hides the submitter on the dashboard across refreshes", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        document.body.innerHTML = `<div class="page-content"><h1>AIND Ephys Pipeline Results</h1></div>`;
        global.fetch = serveGlobalLogs({ "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue") });

        await initSqueueMonitor({ hiddenJobNames: SQUEUE_INFRASTRUCTURE_JOB_NAMES });
        const monitor = document.getElementById("squeue-monitor");
        expect(document.querySelector(".page-content").firstElementChild).toBe(monitor);
        expect(monitor.querySelectorAll("tbody tr")).toHaveLength(2);
        expect(monitor.querySelector(".squeue-screen").textContent).not.toContain("DANDI-Compute-Submitter");

        await refreshSqueueMonitor();
        expect(monitor.querySelectorAll("tbody tr")).toHaveLength(2);
        expect(monitor.querySelector(".squeue-screen").textContent).not.toContain("DANDI-Compute-Submitter");
    });

    it("renders the disk snapshot as tables with the Use% column and chips coloured by how full", () => {
        const snapshot = {
            branch: "monitor/2026-11-05",
            recordName: "14/20261105T143001-usage",
            takenAt: Date.parse("2026-11-05T19:30:01Z"),
            stdout: DISK_STDOUT,
            stderr: "",
            exitStatus: "0",
            sourceUrl: "https://example.org/stdout",
        };
        const root = document.createElement("div");
        root.innerHTML = renderDiskMonitor({ snapshot }, NOW.getTime());

        expect(root.querySelector(".squeue-status").textContent).toBe("live");
        expect(root.querySelector(".squeue-age").textContent).toBe("18 min ago");
        // One chip per filesystem (its mount point and how full it is), then the home quota on space and on files.
        const chips = [...root.querySelectorAll(".squeue-tally .disk-pct")];
        expect(chips.map((chip) => [chip.textContent, chip.className, chip.title])).toEqual([
            ["/orcd/data/dandi/001 72%", "disk-pct disk-pct-ok", "/orcd/data/dandi/001"],
            ["/orcd/data/dandi/002 93%", "disk-pct disk-pct-critical", "/orcd/data/dandi/002"],
            ["home 85.36%", "disk-pct disk-pct-warn", "Home directory: 170.7 of 200.0 GB"],
            ["home files 100.00%", "disk-pct disk-pct-critical", "Home directory: 1.0M of 1.0M files"],
        ]);
        // The df table, then the quota report.
        const tables = [...root.querySelectorAll(".squeue-screen table.disk-table")];
        expect(tables).toHaveLength(2);
        expect([...tables[0].querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
            "Mounted",
            "Size",
            "Used",
            "Avail",
            "Use%",
        ]);
        const rows = [...tables[0].querySelectorAll("tbody tr")].map((tr) => [...tr.cells].map((td) => td.textContent));
        expect(rows).toEqual([
            ["/orcd/data/dandi/001", "968T", "792T", "176T", "72%"],
            ["/orcd/data/dandi/002", "682T", "634T", "48T", "93%"],
        ]);
        expect(
            [...tables[0].querySelectorAll("tbody tr")].map((tr) => tr.cells[4].querySelector(".disk-pct").className)
        ).toEqual(["disk-pct disk-pct-ok", "disk-pct disk-pct-critical"]);
        const quota = tables[1];
        expect(quota.classList.contains("disk-quota-table")).toBe(true);
        expect(quota.querySelector("caption").textContent).toBe("Home directory quota");
        expect([...quota.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
            "Space",
            "Usage (GB)",
            "Limit (GB)",
            "% Used",
            "Files",
            "Limit",
            "% Used",
        ]);
        expect([...quota.querySelectorAll("tbody tr")].map((tr) => [...tr.cells].map((td) => td.textContent))).toEqual([
            ["HOME", "170.7", "200.0", "85.36%", "1.0M", "1.0M", "100.00%"],
            ["SCRATCH", "0.0", "1024.0", "0.00%", "1", "1.0M", "0.00%"],
            ["POOL", "0.0", "1024.0", "0.00%", "1", "1.1M", "0.00%"],
        ]);
        const homeCells = quota.querySelector("tbody tr").cells;
        expect([homeCells[3], homeCells[6]].map((td) => td.querySelector(".disk-pct").className)).toEqual([
            "disk-pct disk-pct-warn",
            "disk-pct disk-pct-critical",
        ]);
        // The rule under the header is not a row.
        expect(root.querySelector(".squeue-screen").textContent).not.toContain("---");

        // Without a quota report (~/orcd/.quota missing), the du line stands in for it, without home chips.
        const fallback = document.createElement("div");
        fallback.innerHTML = renderDiskMonitor(
            { snapshot: { ...snapshot, stdout: `${DISK_DF_STDOUT}\n\nUsed       Path\n142G       /home/cb239\n` } },
            NOW.getTime()
        );
        expect([...fallback.querySelectorAll(".squeue-tally .disk-pct")].map((chip) => chip.textContent)).toEqual([
            "/orcd/data/dandi/001 72%",
            "/orcd/data/dandi/002 93%",
        ]);
        const duTable = fallback.querySelectorAll(".squeue-screen table.disk-table")[1];
        expect([...duTable.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Used", "Path"]);
        expect([...duTable.querySelectorAll("tbody td")].map((td) => td.textContent)).toEqual(["142G", "/home/cb239"]);

        // Three missed half-hourly snapshots are stale; output that is not a table stays text.
        const later = document.createElement("div");
        later.innerHTML = renderDiskMonitor(
            {
                snapshot: {
                    ...snapshot,
                    stdout: "df: /orcd/data/dandi/002: No such file or directory",
                    exitStatus: "1",
                },
            },
            snapshot.takenAt + 91 * 60 * 1000
        );
        expect(later.querySelector(".squeue-status").textContent).toBe("stale");
        expect(later.querySelector(".squeue-tally")).toBeNull();
        expect(later.querySelector(".squeue-screen pre.squeue-text").textContent).toBe(
            "df: /orcd/data/dandi/002: No such file or directory"
        );
        expect(later.querySelector(".squeue-stderr").textContent).toBe("[exit status 1]");

        const none = document.createElement("div");
        none.innerHTML = renderDiskMonitor({ snapshot: null }, NOW.getTime());
        expect(none.querySelector(".squeue-status").textContent).toBe("no snapshots");
        expect(none.querySelector(".squeue-stderr").textContent).toBe(
            "No disk snapshot found in dandi-compute-global-logs."
        );
    });

    it("mounts the disk monitor into its container and polls it on its own", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        document.body.innerHTML = `<div class="page-content"><h1>Cluster Status</h1><div id="status-disk"></div></div>`;
        global.fetch = serveGlobalLogs({ "disk/2026-11-05": diskSnapshotFiles("14/20261105T143001-usage") });

        await initDiskMonitor({ container: document.getElementById("status-disk") });
        const monitor = document.getElementById("disk-monitor");
        expect(monitor.parentElement.id).toBe("status-disk");
        expect(monitor.getAttribute("aria-label")).toBe("Latest disk usage snapshot from MIT Engaging");
        expect(monitor.querySelector(".squeue-status").textContent).toBe("live");
        expect(monitor.querySelectorAll(".squeue-tally .disk-pct")).toHaveLength(4);
        expect(document.getElementById("squeue-monitor")).toBeNull();

        // Polled every 5 minutes, not every minute like the queue.
        const loads = global.fetch.mock.calls.length;
        vi.advanceTimersByTime(60 * 1000);
        expect(global.fetch.mock.calls.length).toBe(loads);
        vi.advanceTimersByTime(4 * 60 * 1000);
        expect(global.fetch.mock.calls.length).toBeGreaterThan(loads);
        await refreshDiskMonitor();
        expect(monitor.querySelector(".squeue-age").textContent).toBe("23 min ago");
    });

    it("does nothing on a page without the page content container", async () => {
        global.fetch = vi.fn();
        await initSqueueMonitor();
        expect(document.getElementById("squeue-monitor")).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("mounts above the dashboard title, polls, and keeps the last snapshot when a refresh fails", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        document.body.innerHTML = `<div class="page-content"><h1>AIND Ephys Pipeline Results</h1></div>`;
        global.fetch = serveGlobalLogs({ "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue") });

        const first = initSqueueMonitor();
        const monitor = document.getElementById("squeue-monitor");
        expect(document.querySelector(".page-content").firstElementChild).toBe(monitor);
        expect(monitor.querySelector(".squeue-status").textContent).toBe("connecting");
        await first;
        expect(monitor.querySelector(".squeue-status").textContent).toBe("live");
        expect(monitor.querySelector(".squeue-age").textContent).toBe("3 min ago");

        // Calling init again neither remounts nor starts a second poller.
        await initSqueueMonitor();
        expect(document.querySelectorAll("#squeue-monitor")).toHaveLength(1);

        global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        vi.advanceTimersByTime(60 * 1000);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        await refreshSqueueMonitor();
        expect(monitor.querySelector(".squeue-status").textContent).toBe("live");
        expect(monitor.querySelector(".squeue-age").textContent).toBe("4 min ago");
        expect(monitor.querySelector(".squeue-refresh-failed")).not.toBeNull();
        expect(monitor.querySelector(".squeue-screen").textContent).toContain("DANDI-Compute-Submitter");
    });

    it("pauses polling while the tab is hidden and catches up when it is shown", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
        vi.setSystemTime(NOW);
        document.body.innerHTML = `<div class="page-content"></div>`;
        global.fetch = serveGlobalLogs({ "monitor/2026-11-05": snapshotFiles("14/20261105T144502-squeue") });
        let visibility = "hidden";
        const visibilityState = vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
        try {
            await initSqueueMonitor();
            const loadCalls = global.fetch.mock.calls.length;

            vi.advanceTimersByTime(5 * 60 * 1000);
            expect(global.fetch).toHaveBeenCalledTimes(loadCalls);

            visibility = "visible";
            document.dispatchEvent(new Event("visibilitychange"));
            expect(global.fetch.mock.calls.length).toBeGreaterThan(loadCalls);
            await refreshSqueueMonitor();
            // Five minutes passed while hidden: the 3-minute-old snapshot is now 8 minutes old.
            expect(document.querySelector("#squeue-monitor .squeue-age").textContent).toBe("8 min ago");
        } finally {
            visibilityState.mockRestore();
        }
    });
});

describe("common issues extraction", () => {
    const { extractLogFailure, normalizeIssueSignature, groupIssues, issueRecordFromLog } = require("./app");

    const FAILED_BLOCK = [
        "Oct-03 23:47:23.206 [Task monitor] DEBUG n.processor.TaskPollingMonitor - Task completed > TaskHandler[jobId: 1; name: validate_params (validate_params); status: COMPLETED; exit: 0; error: -]",
        "Oct-03 23:55:01.001 [TaskFinalizer-1] ERROR nextflow.processor.TaskProcessor - Error executing process > 'postprocessing (postprocessing)'",
        "",
        "Caused by:",
        "  Process `postprocessing (postprocessing)` terminated with an error exit status (1)",
        "",
        "Command executed:",
        "",
        "  #!/usr/bin/env bash",
        '  ./run --params \'{"error_strategy": "raise"}\'',
        "",
        "Command exit status:",
        "  1",
        "",
        "Command output:",
        "  [postprocessing] running capsule...",
        "",
        "Command error:",
        "  Cloning into 'capsule-repo'...",
        "  + python -u run_capsule.py --params '{}'",
        "  Traceback (most recent call last):",
        '    File "capsule/code/run_capsule.py", line 336, in <module>',
        "      sorting_analyzer.set_temporary_recording(recording_tmp)",
        "  ValueError: Recording channel locations do not match.",
        "  Exception ignored in: <function _BaseNWBExtractor.__del__ at 0x153bcfa893a0>",
        "  ImportError: sys.meta_path is None, Python is likely shutting down",
        "",
        "Work dir:",
        "  /orcd/data/dandi/001/dandi-compute/work/1c/5f46684efd88c8735fc1420dbd648a",
        "",
        "Oct-03 23:55:02.000 [main] DEBUG nextflow.Session - Session aborted -- Cause: Process `postprocessing (postprocessing)` terminated with an error exit status (1)",
    ].join("\n");

    it("extracts the failing process, exit status, and the real exception line", () => {
        const failure = extractLogFailure(FAILED_BLOCK);
        expect(failure.process).toBe("postprocessing");
        expect(failure.exitStatus).toBe(1);
        // The shutdown-time "Exception ignored in" ImportError is noise, not the cause.
        expect(failure.message).toBe("ValueError: Recording channel locations do not match.");
    });

    it("labels signal kills and time limits by exit status when stderr has no exception", () => {
        const killed = FAILED_BLOCK.replace("  1\n\nCommand output", "  137\n\nCommand output").replace(
            /Command error:[\s\S]*?Work dir:/,
            'Command error:\n  ./run: line 5:   237 Killed                  python -u run_capsule.py "$@"\n\nWork dir:'
        );
        expect(extractLogFailure(killed)).toMatchObject({
            process: "postprocessing",
            exitStatus: 137,
            message: "Killed (exit status 137 — likely out of memory)",
        });
        const timedOut = FAILED_BLOCK.replace("  1\n\nCommand output", "  140\n\nCommand output").replace(
            /Command error:[\s\S]*?Work dir:/,
            "Command error:\n  100%|██████████| 1/1 [33:40<00:00, 2020.59s/it]\n\nWork dir:"
        );
        expect(extractLogFailure(timedOut).message).toBe("Time limit exceeded (exit status 140)");
    });

    it("falls back to a generic error line, then to the exit status, when no exception is printed", () => {
        const gitError = FAILED_BLOCK.replace(
            /Command error:[\s\S]*?Work dir:/,
            "Command error:\n  error: pathspec 'v1.2.4' did not match any file(s) known to git\n\nWork dir:"
        );
        expect(extractLogFailure(gitError).message).toBe(
            "error: pathspec 'v1.2.4' did not match any file(s) known to git"
        );
        const silent = FAILED_BLOCK.replace(
            /Command error:[\s\S]*?Work dir:/,
            "Command error:\n  (empty)\n\nWork dir:"
        );
        expect(extractLogFailure(silent).message).toBe("Exit status 1 (no error message in log)");
    });

    it("uses the last exception or ERROR line when Nextflow aborted before any process ran", () => {
        const aborted = [
            "Jun-22 10:00:00.000 [main] DEBUG nextflow.cli.Launcher - $> nextflow run ...",
            "Jun-22 10:00:01.000 [main] ERROR nextflow.cli.Launcher - @unknown",
            "nextflow.exception.AbortOperationException: Remote resource not found: https://api.github.com/repos/x/y/contents/main.nf",
            "\tat nextflow.scm.AssetManager.readManifest(AssetManager.groovy:100)",
        ].join("\n");
        expect(extractLogFailure(aborted)).toEqual({
            process: null,
            exitStatus: null,
            message:
                "nextflow.exception.AbortOperationException: Remote resource not found: https://api.github.com/repos/x/y/contents/main.nf",
        });
        expect(extractLogFailure("")).toEqual({ process: null, exitStatus: null, message: null });
        expect(extractLogFailure(null)).toEqual({ process: null, exitStatus: null, message: null });
    });

    it("strips terminal color codes from error lines", () => {
        const colored = FAILED_BLOCK.replace(
            /Command error:[\s\S]*?Work dir:/,
            "Command error:\n  \x1b[91mERROR  : Failed to create user namespace\x1b[0m\n\nWork dir:"
        );
        expect(extractLogFailure(colored).message).toBe("ERROR  : Failed to create user namespace");
    });

    it("normalizes volatile message parts into a stable signature", () => {
        expect(
            normalizeIssueSignature(
                "RuntimeError: File /orcd/data/dandi/001/s3dandiarchive/blobs/2e3/a4e/2e3a4ea6-f5d0-4bc5-a564-aa35f7415553 is not an existing file or folder!"
            )
        ).toBe("RuntimeError: File <path> is not an existing file or folder!");
        expect(
            normalizeIssueSignature(
                "ValueError: Found array with 0 sample(s) (shape=(0, 61)) while a minimum of 1 is required"
            )
        ).toBe("ValueError: Found array with <n> sample(s) (shape=(<n>, <n>)) while a minimum of <n> is required");
        expect(
            normalizeIssueSignature("AbortOperationException: Remote resource not found: https://api.github.com/a/b")
        ).toBe("AbortOperationException: Remote resource not found: <url>");
        expect(
            normalizeIssueSignature("Exception ignored in: <function f at 0x153bcfa893a0> commit e8823a8a6637c7ea")
        ).toBe("Exception ignored in: <function f at <addr>> commit <hash>");
        // Labels this page synthesizes stay as-is (their numbers are the point).
        expect(normalizeIssueSignature("Killed (exit status 137 — likely out of memory)")).toBe(
            "Killed (exit status 137 — likely out of memory)"
        );
        expect(normalizeIssueSignature(null)).toBeNull();
    });

    it("groups scanned runs by signature, most frequent first, with jobs lacking details last", () => {
        const record = (message, process = "preprocessing", exitStatus = 1) => ({
            ...issueRecordFromLog(null),
            process,
            exitStatus,
            message,
            signature: normalizeIssueSignature(message),
        });
        const runs = [
            {
                pipelineVersion: "1.3.3",
                source: "main",
                dandisetId: "000001",
                createdAt: "2026-10-02T00:00:00Z",
                issue: record("ValueError: boom 1"),
            },
            {
                pipelineVersion: "1.4.0",
                source: "archive",
                dandisetId: "000002",
                createdAt: "2026-10-01T00:00:00Z",
                issue: record("ValueError: boom 2"),
            },
            {
                pipelineVersion: "1.4.0",
                source: "main",
                dandisetId: "000001",
                createdAt: "2026-10-03T00:00:00Z",
                issue: record("ValueError: boom 3", "job_dispatch"),
            },
            {
                pipelineVersion: "1.3.3",
                source: "main",
                dandisetId: "000001",
                createdAt: null,
                issue: record(null, null, null),
            },
            {
                pipelineVersion: "1.3.3",
                source: "main",
                dandisetId: "000001",
                createdAt: null,
                issue: record("Exception: rare"),
            },
            { pipelineVersion: "1.3.3", source: "main", dandisetId: "000001", createdAt: null, issue: null }, // not scanned yet
        ];
        const groups = groupIssues(runs);
        expect(groups.map((group) => [group.signature, group.count])).toEqual([
            ["ValueError: boom <n>", 3],
            ["Exception: rare", 1],
            [null, 1],
        ]);
        const [top] = groups;
        expect(top.example).toBe("ValueError: boom 1");
        expect([...top.processes.entries()]).toEqual([
            ["preprocessing", 2],
            ["job_dispatch", 1],
        ]);
        expect([...top.versions.entries()].sort()).toEqual([
            ["1.3.3", 1],
            ["1.4.0", 2],
        ]);
        expect([...top.sources.entries()].sort()).toEqual([
            ["archive", 1],
            ["main", 2],
        ]);
        expect(top.firstSeen).toBe("2026-10-01T00:00:00Z");
        expect(top.lastSeen).toBe("2026-10-03T00:00:00Z");
    });
});

describe("DANDI backup partitions and the Status page", () => {
    const README = [
        "# DANDI Backup Status",
        "",
        "Current status of S3 bucket backup of the DANDI Archive.",
        "",
        "Last update: November 2, 2026 at 06:09 AM ET",
        "",
        "## Disk Space",
        "",
        "|   Partition | Size (Used / Total)            |",
        "| ----------: | :----------------------------- |",
        "|         001 | 791.56 TB / 967.57 TB (81.81%) |",
        "|         002 | 416.05 TB / 681.70 TB (61.03%) |",
        "",
        "## Content",
        "",
        "| Location      | Size (Local / Remote)           |",
        "| :------------ | :------------------------------ |",
        "| blobs/        | 1.21 PB / 1.28 PB (94.23%)      |",
        "",
    ].join("\n");
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        stopMonitors();
        document.body.innerHTML = "";
    });

    it("reads the partitions and the update time from the README's Disk Space table only", () => {
        expect(parseBackupStatus(README)).toEqual({
            updated: "November 2, 2026 at 06:09 AM ET",
            partitions: [
                { name: "001", used: "791.56 TB", total: "967.57 TB", percent: 81.81 },
                { name: "002", used: "416.05 TB", total: "681.70 TB", percent: 61.03 },
            ],
        });
        expect(parseBackupStatus("# Nothing here\n")).toEqual({ updated: null, partitions: [] });
        expect(parseBackupStatus(undefined)).toEqual({ updated: null, partitions: [] });
        // A Disk Space section that ends the file still parses.
        const last = README.slice(0, README.indexOf("## Content"));
        expect(parseBackupStatus(last).partitions).toHaveLength(2);
    });

    it("renders the partitions as meters coloured by how full they are, with the sizes beside them", () => {
        const root = document.createElement("div");
        root.innerHTML = renderBackupStatus({
            status: {
                updated: "November 2, 2026 at 06:09 AM ET",
                partitions: [
                    { name: "001", used: "791.56 TB", total: "967.57 TB", percent: 81.81 },
                    { name: "002", used: "416.05 TB", total: "681.70 TB", percent: 61.03 },
                    { name: "003", used: "9 TB", total: "9 TB", percent: 100 },
                ],
            },
        });
        expect(root.querySelector(".backup-status-updated").textContent).toBe(
            "Last update: November 2, 2026 at 06:09 AM ET"
        );
        expect(root.querySelector(".backup-status-source a").href).toBe("https://github.com/dandi/backup-status");
        const meters = [...root.querySelectorAll(".disk-meter")];
        expect(meters.map((m) => m.className)).toEqual([
            "disk-meter disk-meter-warn",
            "disk-meter disk-meter-ok",
            "disk-meter disk-meter-critical",
        ]);
        expect(meters.map((m) => m.getAttribute("aria-valuenow"))).toEqual(["81.81", "61.03", "100"]);
        expect(meters.map((m) => m.querySelector(".disk-meter-fill").style.width)).toEqual([
            "81.81%",
            "61.03%",
            "100%",
        ]);
        expect(meters.map((m) => m.querySelector(".disk-meter-text").textContent)).toEqual([
            "791.56 TB / 967.57 TB",
            "416.05 TB / 681.70 TB",
            "9 TB / 9 TB",
        ]);
        expect(meters.map((m) => m.querySelector(".disk-pct").textContent)).toEqual(["81.81%", "61.03%", "100%"]);

        const loading = document.createElement("div");
        loading.innerHTML = renderBackupStatus();
        expect(loading.querySelector(".backup-status-note").textContent).toBe("Loading…");
        const failed = document.createElement("div");
        failed.innerHTML = renderBackupStatus({ error: "Could not load <it>" });
        expect(failed.querySelector(".backup-status-error").textContent).toBe("Could not load <it>");
        const empty = document.createElement("div");
        empty.innerHTML = renderBackupStatus({ status: { updated: null, partitions: [] } });
        expect(empty.querySelector(".backup-status-note").textContent).toBe("No Disk Space table found in the README.");
        expect(empty.querySelector(".backup-status-updated")).toBeNull();
    });

    it("loads the README from the repository's main branch and shows a failure in place", async () => {
        const el = document.createElement("div");
        global.fetch = vi.fn(async () => new Response(README, { status: 200 }));
        await loadBackupStatus(el);
        expect(global.fetch).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/dandi/backup-status/main/README.md"
        );
        expect(el.querySelectorAll(".disk-meter")).toHaveLength(2);

        global.fetch = vi.fn(async () => new Response("", { status: 503 }));
        await loadBackupStatus(el);
        expect(el.querySelector(".backup-status-error").textContent).toBe(
            "Could not load dandi/backup-status: HTTP 503"
        );

        global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        await loadBackupStatus(el);
        expect(el.querySelector(".backup-status-error").textContent).toBe(
            "Could not load dandi/backup-status: Failed to fetch"
        );
        await expect(loadBackupStatus(null)).resolves.toBeUndefined();
    });

    it("lays the Status page out as a queue section and a disk section with their containers", () => {
        const root = document.createElement("div");
        root.innerHTML = renderStatusPage();
        expect([...root.querySelectorAll(".status-heading")].map((h) => h.textContent)).toEqual(["Queue", "Disk"]);
        const queue = root.querySelector("#status-queue-heading").closest(".status-section");
        expect(queue.querySelector("#status-queue")).not.toBeNull();
        const disk = root.querySelector("#status-disk-heading").closest(".status-section");
        // The backup partitions come before the cluster's own disk snapshot.
        expect([...disk.querySelectorAll("#backup-status, #status-disk")].map((d) => d.id)).toEqual([
            "backup-status",
            "status-disk",
        ]);
    });
});
