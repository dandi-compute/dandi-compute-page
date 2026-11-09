const {
    blobMemoryCacheStats,
    cancelHydration,
    getRunsInScope,
    hydrationIdle,
    initFlatShowMore,
    initHydrationPromotion,
    initInPageFilterNavigation,
    filterToSearchText,
    loadQueueData,
    parseFilter,
    parseQueueEntries,
    renderFilterBanner,
    searchTextToUrl,
    renderSummary,
    showDiffResults,
    showError,
    showLoading,
    showResults,
    softResetForFilterChange,
} = require("./app");

beforeEach(() => {
    document.body.innerHTML = `
        <div id="loading"></div>
        <div id="error"></div>
        <div id="filter-banner"></div>
        <div id="summary"></div>
        <div id="layout-bar"></div>
        <div id="runs"></div>
    `;
});

describe("app integration behavior", () => {
    // Type `text` into the search bar (caret at its end) and return the terms
    // the suggestion dropdown offers.
    function suggest(text) {
        const input = document.querySelector(".run-search-input");
        input.value = text;
        input.setSelectionRange(text.length, text.length);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return [...document.querySelectorAll(".run-search-option")].map((option) => option.dataset.term);
    }

    it("renders the search bar with the applied filters as terms and suggests their values", () => {
        const failedRun = {
            dandisetId: "001697",
            subject: "a",
            session: "s1",
            pipelineName: "aind+ephys",
            pipelineVersion: "v1",
            paramsProfile: "params-a",
            configHash: "config-a",
            generatedBy: [{ CodeURL: "https://github.com/dandi-compute/dandi-compute-core", Version: "abc1234" }],
            status: "failed",
            failureStep: "pre-processing",
        };
        const successfulRun = {
            dandisetId: "001697",
            subject: "b",
            session: "s2",
            pipelineName: "lfp",
            pipelineVersion: "v2",
            paramsProfile: "params-b",
            configHash: "config-b",
            generatedBy: [{ CodeURL: "https://github.com/dandi-compute/dandi-compute-core", Version: "def5678" }],
            status: "success",
            failureStep: null,
        };
        renderFilterBanner(
            {
                dandisetId: "001697",
                subject: null,
                session: null,
                pipelineVersion: null,
                paramsType: failedRun.paramsProfile,
                configType: failedRun.configHash,
                failureStep: "pre-processing",
            },
            [failedRun, successfulRun]
        );

        const banner = document.getElementById("filter-banner");
        expect(banner.style.display).toBe("");
        // One search bar instead of a form of per-filter inputs.
        expect(banner.querySelectorAll("input")).toHaveLength(1);
        const input = banner.querySelector(".run-search-input");
        expect(input.value).toBe("dandiset:001697 params:params-a config:config-a failure:pre-processing");
        // No counts and no clear button: the line under the bar only speaks up
        // about a search being typed.
        expect(banner.querySelector(".run-search-status").hidden).toBe(true);
        expect(banner.querySelector("button")).toBeNull();

        // A key's suggestions are the values jobs in view have, with counts.
        expect(suggest("params:")).toEqual(["params:params-a", "params:params-b"]);
        expect(suggest("pipeline:")).toEqual(["pipeline:aind-ephys", "pipeline:lfp"]);
        expect(document.querySelector(".run-search-option .run-search-swatch").className).toContain(
            "run-tag-pipeline-aind-ephys"
        );
        expect([...document.querySelectorAll(".run-search-option-count")].map((el) => el.textContent)).toEqual([
            "1",
            "1",
        ]);
        // The search applies as it is typed, so a draft needs no "Press Enter".
        expect(banner.querySelector(".run-search-status").hidden).toBe(true);
    });

    it("updates page state displays and escapes error content", () => {
        showLoading();
        expect(document.getElementById("loading").style.display).toBe("");
        expect(document.getElementById("summary").style.display).toBe("none");

        showError('<script>alert("xss")</script>');
        expect(document.getElementById("error").innerHTML).toContain("&lt;script&gt;");
        expect(document.getElementById("loading").style.display).toBe("none");

        showResults();
        expect(document.getElementById("summary").style.display).toBe("");
        expect(document.getElementById("runs").style.display).toBe("");
    });

    it("shows summed bytes in the summary when runs include size metadata", () => {
        renderSummary([
            { status: "success", assetSizeBytes: 10 },
            { status: "failed", assetSizeBytes: 20 },
            { status: "queued" },
        ]);

        expect(document.getElementById("summary").innerHTML).toContain("DATA PROCESSED");
        expect(document.getElementById("summary").innerHTML).toContain("10 B");
        expect(document.getElementById("summary").innerHTML).not.toContain("30 B");
    });

    it("hides summary DATA PROCESSED when only failed runs have byte metadata", () => {
        renderSummary([
            { status: "failed", assetSizeBytes: 20 },
            { status: "queued", assetSizeBytes: 30 },
        ]);
        expect(document.getElementById("summary").innerHTML).not.toContain("DATA PROCESSED");
    });

    it("shows running counter in summary when running runs are present", () => {
        renderSummary([
            { status: "success", assetSizeBytes: 10 },
            { status: "running" },
            { status: "running" },
            { status: "queued" },
        ]);

        const summaryHtml = document.getElementById("summary").innerHTML;
        expect(summaryHtml).toContain("stat-running");
        expect(summaryHtml).toContain("Running");
    });

    it("shows running counter at 0 when no running runs are present", () => {
        renderSummary([{ status: "success", assetSizeBytes: 10 }, { status: "queued" }]);

        const summaryHtml = document.getElementById("summary").innerHTML;
        expect(summaryHtml).toContain('class="stat-item stat-running"');
        expect(summaryHtml).toContain('<span class="stat-value">0</span>');
    });

    it("shows stalled counter when running runs exceed 24 hours", () => {
        const oldCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const recentCreatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        renderSummary([
            { status: "running", createdAt: oldCreatedAt },
            { status: "running", createdAt: recentCreatedAt },
        ]);

        const summaryHtml = document.getElementById("summary").innerHTML;
        expect(summaryHtml).toContain("stat-stalled");
        expect(summaryHtml).toContain("Stalled");
        expect(summaryHtml).toContain("⚠ 1");
        expect(summaryHtml).toContain("status=stalled");
    });

    it("does not double count stalled runs as running", () => {
        const stalledCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const recentCreatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        renderSummary([
            { status: "running", createdAt: stalledCreatedAt },
            { status: "running", createdAt: stalledCreatedAt },
            { status: "running", createdAt: recentCreatedAt },
        ]);

        const summary = document.getElementById("summary");
        const runningValue = summary.querySelector(".stat-running .stat-value").textContent;
        const stalledValue = summary.querySelector(".stat-stalled .stat-value").textContent;
        expect(runningValue).toBe("1");
        expect(stalledValue).toBe("⚠ 2");
        expect(summary.innerHTML).not.toContain("Unknown");
    });

    it("hides stalled counter when no running runs exceed 24 hours", () => {
        const recentCreatedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        renderSummary([{ status: "running", createdAt: recentCreatedAt }]);

        const summaryHtml = document.getElementById("summary").innerHTML;
        expect(summaryHtml).not.toContain("stat-stalled");
        expect(summaryHtml).not.toContain("Stalled");
    });

    it("formats large byte counts with appropriate decimal units", () => {
        renderSummary([{ status: "success", assetSizeBytes: 2_500_000_000_000 }]);
        expect(document.getElementById("summary").innerHTML).toContain("2.5 TB");
    });

    it("renders clickable success and failed summary counters that apply status filtering", () => {
        window.history.replaceState(
            null,
            "",
            "/?layout=flat&sort=attempt&sortDir=desc&dandiset=001697&failureStep=pre-processing"
        );
        renderSummary([
            { status: "success", assetSizeBytes: 100 },
            { status: "failed", assetSizeBytes: 200 },
        ]);

        const summaryHtml = document.getElementById("summary").innerHTML;
        expect(summaryHtml).toContain(
            'class="stat-item stat-success" href="?layout=flat&amp;sort=attempt&amp;sortDir=desc&amp;dandiset=001697&amp;status=success"'
        );
        expect(summaryHtml).toContain(
            'class="stat-item stat-failed" href="?layout=flat&amp;sort=attempt&amp;sortDir=desc&amp;dandiset=001697&amp;failureStep=pre-processing&amp;status=failed"'
        );
    });

    it("shows only the diff content region on the diff page", () => {
        showDiffResults();
        expect(document.getElementById("loading").style.display).toBe("none");
        expect(document.getElementById("filter-banner").style.display).toBe("none");
        expect(document.getElementById("summary").style.display).toBe("none");
        expect(document.getElementById("layout-bar").style.display).toBe("none");
        expect(document.getElementById("runs").style.display).toBe("");
    });

    it("applies searches as URLs that keep the layout, sort mode, and sort direction", () => {
        window.history.replaceState(null, "", "/?layout=flat&sort=created_at&sortDir=asc");
        const url = searchTextToUrl('dandiset:000363 pipeline:lfp size:>10 size:<100 spikes "sub-1"');
        const params = new URLSearchParams(url.slice(1));
        expect(params.get("layout")).toBe("flat");
        expect(params.get("sort")).toBe("created_at");
        expect(params.get("sortDir")).toBe("asc");
        expect(params.get("dandiset")).toBe("000363");
        expect(params.get("pipeline")).toBe("lfp");
        expect(params.get("assetSize")).toBe(">10, <100");
        expect(params.get("q")).toBe('spikes "sub-1"');
        expect(searchTextToUrl("")).toBe("?layout=flat&sort=created_at&sortDir=asc");

        // And the URL's filters read back as the same search.
        window.history.replaceState(null, "", `/${url}`);
        expect(filterToSearchText(parseFilter())).toBe(
            'dandiset:000363 pipeline:lfp size:>10 size:<100 spikes "sub-1"'
        );
    });

    it("shows the applied status filter as a term", () => {
        window.history.replaceState(null, "", "/?layout=flat&sort=created_at&sortDir=asc&status=failed");
        const runs = [
            { status: "failed", dandisetId: "001697", subject: "sub-1", session: "ses-1", pipelineVersion: "v1" },
            { status: "success", dandisetId: "001697", subject: "sub-2", session: "ses-2", pipelineVersion: "v1" },
        ];
        renderFilterBanner(parseFilter(), runs);

        const banner = document.getElementById("filter-banner");
        expect(banner.querySelector(".run-search-input").value).toBe("status:failed");
        expect(banner.querySelector(".run-search-status").hidden).toBe(true);
        // Status suggestions only offer statuses some job has.
        expect(suggest("status:")).toEqual(["status:failed", "status:success"]);
    });

    const SCOPED_RUNS = [
        {
            dandisetId: "000363",
            subject: "sub-a",
            session: "ses-1",
            pipelineVersion: "v1",
            paramsProfile: "4af6a25",
            configHash: "0d4bf36",
            status: "success",
        },
        {
            dandisetId: "000363",
            subject: "sub-a",
            session: "ses-2",
            pipelineVersion: "v1",
            paramsProfile: "4af6a25",
            configHash: "0d4bf36",
            status: "success",
        },
        {
            dandisetId: "000363",
            subject: "sub-b",
            session: "ses-3",
            pipelineVersion: "v2",
            paramsProfile: "98fd947",
            configHash: "6568dda",
            status: "success",
        },
        {
            dandisetId: "999999",
            subject: "other-sub",
            session: "other-ses",
            pipelineVersion: "v3",
            paramsProfile: "98fd947",
            configHash: "beef123",
            status: "success",
        },
    ];

    it("scopes each key's suggestions to the jobs the search's other terms leave", () => {
        renderFilterBanner({ dandisetId: "000363", subject: "sub-a" }, SCOPED_RUNS);

        expect(suggest("subject:")).toEqual(["subject:sub-a", "subject:other-sub", "subject:sub-b"]);
        expect(suggest("dandiset:000363 subject:")).toEqual(["subject:sub-a", "subject:sub-b"]);
        expect(suggest("dandiset:000363 subject:sub-a session:")).toEqual(["session:ses-1", "session:ses-2"]);
        // Only versions some job in scope ran; a key's own term doesn't narrow it.
        expect(suggest("version:v1 dandiset:999999 version:")).toEqual(["version:v3"]);
        // Typed text narrows a key's values.
        expect(suggest("dandiset:000363 session:3")).toEqual(["session:ses-3"]);
    });

    it("suggests filter keys, values matching free text, and near misses for unknown keys", () => {
        renderFilterBanner({}, SCOPED_RUNS);

        const keys = suggest("");
        // Only keys some job has a value for (no pipeline, codebase, size, or
        // failure step here: no job has those, and none failed).
        expect(keys).toEqual(["dandiset:", "subject:", "session:", "version:", "params:", "config:", "status:"]);
        expect(document.querySelector(".run-search-tip").textContent).toContain("Every term has to match");

        expect(suggest("ses")).toEqual([
            "session:other-ses",
            "session:ses-1",
            "session:ses-2",
            "session:ses-3",
            "session:",
        ]);
        expect([...document.querySelectorAll(".run-search-group-label")].map((el) => el.textContent)).toEqual([
            "Matching values",
            "Filters",
        ]);

        expect(suggest("versoin:")).toEqual(["version:"]);
        expect(document.querySelector(".run-search-group-label").textContent).toBe("Did you mean");
        expect(document.querySelector(".run-search-status").textContent).toContain(
            "There is no versoin: filter, so it was searched as text. Did you mean version:?"
        );
    });

    it("lists versions newest first, whatever their job counts", () => {
        const jobCounts = {
            "v1.2.4": 158,
            "1.4.0": 41,
            "1.3.3": 34,
            "v1.2.2": 17,
            "1.5.0": 15,
            "v1.3.2": 8,
            "1.2.4": 1,
        };
        const runs = Object.entries(jobCounts).flatMap(([pipelineVersion, count]) =>
            Array.from({ length: count }, () => ({ pipelineName: "aind+ephys", pipelineVersion, codebase: "v0.4.0" }))
        );
        renderFilterBanner({}, runs);

        expect(suggest("pipeline:aind-ephys version:")).toEqual([
            "version:1.5.0",
            "version:1.4.0",
            "version:1.3.3",
            "version:v1.3.2",
            // Same version: the one more jobs ran comes first.
            "version:v1.2.4",
            "version:1.2.4",
            "version:v1.2.2",
        ]);
        expect([...document.querySelectorAll(".run-search-option-count")].map((el) => el.textContent)).toEqual([
            "15",
            "41",
            "34",
            "8",
            "158",
            "1",
            "17",
        ]);
    });

    it("suggests version ranges once an operator is typed, with the jobs each leaves", () => {
        const jobCounts = {
            "v1.2.4": 158,
            "1.4.0": 41,
            "1.3.3": 34,
            "v1.2.2": 17,
            "1.5.0": 15,
            "v1.3.2": 8,
            "1.2.4": 1,
        };
        const runs = Object.entries(jobCounts).flatMap(([pipelineVersion, count]) =>
            Array.from({ length: count }, () => ({ pipelineName: "aind+ephys", pipelineVersion }))
        );
        renderFilterBanner({}, runs);
        const counts = () => [...document.querySelectorAll(".run-search-option-count")].map((el) => el.textContent);

        // Below the oldest version nothing is left, so it isn't offered; "1.2.4"
        // makes the same comparison as "v1.2.4".
        expect(suggest("pipeline:aind-ephys version:<")).toEqual([
            "version:<1.5.0",
            "version:<1.4.0",
            "version:<1.3.3",
            "version:<v1.3.2",
            "version:<v1.2.4",
        ]);
        expect(counts()).toEqual(["259", "218", "184", "176", "17"]);

        expect(suggest("version:>=1.3")).toEqual(["version:>=1.3.3", "version:>=v1.3.2"]);
        expect(counts()).toEqual(["90", "98"]);

        // An existing range narrows the next term's suggestions; an exact value doesn't.
        expect(suggest("version:<1.4 version:")).toEqual([
            "version:1.3.3",
            "version:v1.3.2",
            "version:v1.2.4",
            "version:1.2.4",
            "version:v1.2.2",
        ]);
        expect(suggest("version:1.5.0 version:")).toHaveLength(7);
    });

    it("completes a key, then a value, from the keyboard", () => {
        renderFilterBanner({}, SCOPED_RUNS);
        const input = document.querySelector(".run-search-input");
        const key = (name) => input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

        suggest("ver");
        // "Matching values" come first; the version: key is the last option.
        const options = [...document.querySelectorAll(".run-search-option")];
        key("ArrowUp");
        expect(options.at(-1).getAttribute("aria-selected")).toBe("true");
        expect(input.getAttribute("aria-activedescendant")).toBe(options.at(-1).id);
        key("Enter");
        expect(input.value).toBe("version:");
        expect([...document.querySelectorAll(".run-search-option")].map((option) => option.dataset.term)).toEqual([
            "version:v3",
            "version:v2",
            "version:v1",
        ]);

        // Escape closes the list, then drops the draft.
        key("Escape");
        expect(document.querySelector(".run-search-suggestions").hidden).toBe(true);
        key("Escape");
        expect(input.value).toBe("");
    });
});

describe("progressive queue loading", () => {
    // jobs.tsv and paths.tsv aren't referenced by a known content-id, so
    // fetchQueueState resolves them in two hops: the job-capsules Dandiset's
    // assets.jsonld manifest, then the blob URLs it points at (see
    // resolveAssetBlobUrls / STATE_MANIFEST_URL below).
    const STATE_MANIFEST_URL = "https://dandiarchive.s3.amazonaws.com/dandisets/001697/draft/assets.jsonld";
    let blobCounter = 0;
    let originalFetch;

    const newBlobId = () => `zz${String(blobCounter++).padStart(30, "0")}`;
    const blobUrlFor = (id) => `https://dandiarchive.s3.amazonaws.com/blobs/${id.slice(0, 3)}/${id.slice(3, 6)}/${id}`;

    function deferred() {
        let resolve;
        const promise = new Promise((r) => (resolve = r));
        return { promise, resolve };
    }

    function makeEntry(overrides = {}) {
        return {
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
            ...overrides,
        };
    }

    // Attach blob-backed artifacts under the entry's computed run path and
    // return { entry, urls } with the resolvable blob URL per artifact.
    function withArtifacts(entry, ids = {}) {
        const [probe] = parseQueueEntries([entry]);
        const p = probe.path;
        const urls = {};
        entry.output_paths = { ...(entry.output_paths ?? {}) };
        if (ids.trace) {
            entry.output_paths[`${p}/logs/trace.txt`] = ids.trace;
            urls.trace = blobUrlFor(ids.trace);
        }
        if (ids.png) entry.output_paths[`${p}/derivatives/visualization/summary/psd.png`] = ids.png;
        if (ids.qc) {
            entry.output_paths[`${p}/derivatives/visualization/quality_control.json`] = ids.qc;
            urls.qc = blobUrlFor(ids.qc);
        }
        if (ids.viz) {
            entry.output_paths[`${p}/derivatives/visualization/visualization_output.json`] = ids.viz;
            urls.viz = blobUrlFor(ids.viz);
        }
        if (ids.dd) {
            entry.dataset_description_path = { [`${p}/dataset_description.json`]: ids.dd };
            urls.dd = blobUrlFor(ids.dd);
        }
        return { entry, urls, path: p };
    }

    // Mirror Python csv.DictWriter's QUOTE_MINIMAL: quote-wrap (doubling inner
    // quotes) only when a cell contains the delimiter, a quote, or a newline.
    function tsvQuote(cell) {
        if (!/[\t"\n]/.test(cell)) return cell;
        return `"${cell.replace(/"/g, '""')}"`;
    }

    function rowsToTsv(fieldNames, rows) {
        const lines = [fieldNames.join("\t")];
        for (const row of rows) {
            lines.push(fieldNames.map((key) => (row[key] == null ? "" : tsvQuote(String(row[key])))).join("\t"));
        }
        return lines.join("\n") + "\n";
    }

    // Write the fixture entries out as the `jobs.tsv` and `paths.tsv` tables the
    // app reads. Each entry's run path (the one withArtifacts keyed its artifacts
    // under) becomes its capsule directory, marked by a dataset_description.json.
    // Its presence flags become the capsule `status` they correspond to, and its
    // subject/session go into the source NWB path the app parses them back out of.
    function entriesToQueueTables(entries) {
        const jobRows = [];
        const pathRows = [];
        entries.forEach((entry, index) => {
            const [run] = parseQueueEntries([entry]);
            const jobId = `job-${String(index).padStart(12, "0")}`;
            const status = entry.has_output
                ? "successful"
                : entry.has_logs
                  ? "failed"
                  : entry.has_been_submitted
                    ? "stalled"
                    : "pending";
            const nwbDirectory = [`sub-${run.subject}`, ...(run.session ? [`ses-${run.session}`] : [])].join("/");
            jobRows.push({
                job_id: jobId,
                dandiset_id: entry.dandiset_id,
                within_dandiset_path: entry.dandi_path ?? `${nwbDirectory}/sub-${run.subject}_ecephys.nwb`,
                pipeline: entry.pipeline,
                version: entry.version,
                params: entry.params,
                config: entry.config,
                codebase: entry.codebase,
                content_id: entry.content_id,
                asset_size_bytes: entry.asset_size_bytes,
                status,
                created_at: entry.created_at,
            });
            const blobIdsByPath = {
                [`${run.path}/dataset_description.json`]: `dd${String(index).padStart(30, "0")}`,
                ...(entry.dataset_description_path ?? {}),
                ...(entry.output_paths ?? {}),
            };
            for (const [path, contentId] of Object.entries(blobIdsByPath)) {
                pathRows.push({ job_id: jobId, path, content_id: contentId });
            }
        });
        return {
            jobsTsv: rowsToTsv(
                [
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
                ],
                jobRows
            ),
            pathsTsv: rowsToTsv(["job_id", "path", "content_id"], pathRows),
        };
    }

    // Fresh blob URLs each call, so a later test's/reload's manifest lookup can
    // never be served stale content out of the cross-test blob memory cache.
    let _seededStateManifest = null;
    let _seededTables = null;
    function seedQueueState(entries) {
        const jobsBlobUrl = blobUrlFor(newBlobId());
        const pathsBlobUrl = blobUrlFor(newBlobId());
        _seededStateManifest = JSON.stringify([
            { path: "derivatives/jobs.tsv", contentUrl: ["https://api.dandiarchive.org/ignored", jobsBlobUrl] },
            { path: "derivatives/paths.tsv", contentUrl: ["https://api.dandiarchive.org/ignored", pathsBlobUrl] },
        ]);
        const { jobsTsv, pathsTsv } = entriesToQueueTables(entries);
        _seededTables = new Map([
            [jobsBlobUrl, jobsTsv],
            [pathsBlobUrl, pathsTsv],
        ]);
    }

    // Route the app's fetches: the assets.jsonld manifest and the table blobs it
    // points at are served from whatever seedQueueState last set up (no ETag,
    // so a reseed-and-reload mid-test always picks up the fresh manifest/blobs),
    // registries resolve to a minimal fixture, and S3 blob URLs are served by the
    // per-test handler map.
    function installFetch(blobHandlers) {
        global.fetch = vi.fn(async (url) => {
            const u = String(url);
            if (u === STATE_MANIFEST_URL) return new Response(_seededStateManifest, { status: 200 });
            if (_seededTables.has(u)) return new Response(_seededTables.get(u), { status: 200 });
            if (u.includes("registered_params.json") || u.includes("registered_configs.json")) {
                return new Response(
                    JSON.stringify({ default: { path: "p.json", md5: "0d4bf36ddb61418ae7714e7d6e5ff8b8" } }),
                    { status: 200 }
                );
            }
            const handler = blobHandlers.get(u);
            if (handler) return handler();
            return new Response(null, { status: 404 });
        });
    }

    // Per-run artifact blob requests only -- excludes the manifest lookup and the
    // resolved table blobs, which share the same S3 host as real artifact blobs.
    const blobRequests = () =>
        global.fetch.mock.calls
            .map(([u]) => String(u))
            .filter((u) => new URL(u).hostname === "dandiarchive.s3.amazonaws.com")
            .filter((u) => u !== STATE_MANIFEST_URL && !_seededTables?.has(u));

    const TRACE_OK =
        "task_id\tname\tstatus\texit\n1\tjob_dispatch (1)\tCOMPLETED\t0\n2\tpreprocessing (1)\tCOMPLETED\t0";
    const TRACE_FAILED_PRE =
        "task_id\tname\tstatus\texit\n1\tjob_dispatch (1)\tCOMPLETED\t0\n2\tpreprocessing (1)\tFAILED\t1";

    beforeEach(() => {
        cancelHydration();
        sessionStorage.clear();
        // Earlier tests in this file set filter query params without resetting.
        window.history.replaceState(null, "", "/");
        originalFetch = global.fetch;
    });

    afterEach(async () => {
        cancelHydration();
        global.fetch = originalFetch;
        sessionStorage.clear();
        localStorage.clear();
        window.history.replaceState(null, "", "/");
    });

    it("renders instantly from the state file while blob fetches are still pending", async () => {
        const { entry, urls } = withArtifacts(makeEntry(), { trace: newBlobId() });
        seedQueueState([entry]);
        installFetch(new Map([[urls.trace, () => new Promise(() => {})]])); // trace never resolves

        await loadQueueData();

        const card = document.querySelector("#runs .run-entry");
        expect(card).not.toBeNull();
        expect(card.className).toContain("status-success"); // has_output flag, no trace needed
        expect(card.dataset.runKey).toBeTruthy();
        expect(document.getElementById("runs").style.display).toBe("");
        expect(document.getElementById("summary").innerHTML).toContain("Total Runs");
    });

    it("refines status via hydration without collapsing open sections", async () => {
        const { entry, urls } = withArtifacts(makeEntry(), { trace: newBlobId(), png: newBlobId() });
        seedQueueState([entry]);
        const trace = deferred();
        installFetch(new Map([[urls.trace, () => trace.promise]]));

        await loadQueueData();

        const before = document.querySelector("#runs .run-entry");
        expect(before.className).toContain("status-success");
        expect(before.querySelector('details[data-section="trace"]')).toBeNull(); // no tasks yet
        const viz = before.querySelector('details[data-section="viz"]');
        expect(viz).not.toBeNull(); // sync-derived from output_paths
        viz.open = true;

        trace.resolve(new Response(TRACE_FAILED_PRE, { status: 200 }));
        await hydrationIdle();

        const after = document.querySelector("#runs .run-entry");
        expect(after.className).toContain("status-failed"); // trace refined success → failed
        expect(after.querySelector('details[data-section="trace"]')).not.toBeNull();
        expect(after.querySelector('details[data-section="viz"]').open).toBe(true); // preserved
        expect(after.dataset.runKey).toBe(before.dataset.runKey);
        expect(document.querySelector("#summary .stat-failed .stat-value").textContent.trim()).toBe("1");
    });

    it("promotes an expanded run to the front of the hydration queue", async () => {
        window.history.replaceState(null, "", "/?layout=flat"); // flat: all cards materialized
        const handlers = new Map();
        const entries = [];
        const runsMeta = [];
        for (let i = 0; i < 6; i++) {
            const { entry, urls, path } = withArtifacts(
                makeEntry({ subject: `sub${i}`, has_output: false, has_logs: true }),
                { trace: newBlobId() }
            );
            const gate = deferred();
            handlers.set(urls.trace, () => gate.promise);
            entries.push(entry);
            runsMeta.push({ path, url: urls.trace, gate });
        }
        seedQueueState(entries);
        installFetch(handlers);
        initHydrationPromotion();

        await loadQueueData();
        await Promise.resolve(); // let the first worker wave issue its fetches

        const started = blobRequests();
        expect(started).toHaveLength(3); // HYDRATION_CONCURRENCY
        const pending = runsMeta.filter((m) => !started.includes(m.url));
        const promoted = pending[pending.length - 1];

        // Open a section on the promoted run's card through the real toggle path.
        const card = Array.from(document.querySelectorAll("[data-run-key]")).find(
            (el) => el.dataset.runKey === promoted.path
        );
        expect(card).not.toBeNull();
        const section = card.querySelector("details");
        section.open = true;
        section.dispatchEvent(new Event("toggle"));

        // Free one worker; it must pick up the promoted run next.
        const firstStarted = runsMeta.find((m) => m.url === started[0]);
        firstStarted.gate.resolve(new Response(TRACE_FAILED_PRE, { status: 200 }));
        await vi.waitFor(() => {
            if (!blobRequests().includes(promoted.url)) throw new Error("promoted run not yet fetched");
        });
        expect(blobRequests()[3]).toBe(promoted.url);

        for (const m of runsMeta) m.gate.resolve(new Response(TRACE_FAILED_PRE, { status: 200 }));
        await hydrationIdle();
    });

    it("brings runs into an active failure-step filter as hydration lands", async () => {
        window.history.replaceState(null, "", "/?failureStep=pre-processing");
        const { entry, urls } = withArtifacts(makeEntry({ has_output: false, has_logs: true }), {
            trace: newBlobId(),
        });
        seedQueueState([entry]);
        const trace = deferred();
        installFetch(new Map([[urls.trace, () => trace.promise]]));

        await loadQueueData();

        // failureStep is unknown pre-hydration, so nothing matches yet: the
        // card area says so, without the summary or layout bar.
        expect(document.querySelector("#runs .runs-empty").textContent).toBe("No jobs match this search.");
        expect(document.getElementById("runs").style.display).toBe("");
        expect(document.getElementById("summary").style.display).toBe("none");
        expect(document.getElementById("layout-bar").style.display).toBe("none");
        expect(document.getElementById("error").style.display).toBe("none");

        trace.resolve(new Response(TRACE_FAILED_PRE, { status: 200 }));
        await hydrationIdle();

        expect(document.querySelector("#runs .runs-empty")).toBeNull();
        expect(document.getElementById("summary").style.display).toBe("");
        expect(document.getElementById("layout-bar").style.display).toBe("");
        expect(document.querySelector("#runs .run-entry").className).toContain("status-failed");
    });

    it("drops runs out of an active status filter when hydration refutes it", async () => {
        window.history.replaceState(null, "", "/?status=success");
        const { entry, urls } = withArtifacts(makeEntry(), { trace: newBlobId() });
        seedQueueState([entry]);
        const trace = deferred();
        installFetch(new Map([[urls.trace, () => trace.promise]]));

        await loadQueueData();
        expect(document.querySelector("#runs .run-entry")).not.toBeNull(); // flag status matches

        trace.resolve(new Response(TRACE_FAILED_PRE, { status: 200 }));
        await hydrationIdle();

        expect(document.querySelector("#runs .runs-empty").textContent).toBe("No jobs match this search.");
        expect(document.querySelector("#runs .run-entry")).toBeNull();
        expect(document.getElementById("summary").style.display).toBe("none");
    });

    it("background-hydrates only traces; detail artifacts wait for a card reveal", async () => {
        const entries = [];
        const meta = [];
        const handlers = new Map();
        for (let i = 0; i < 3; i++) {
            const { entry, urls } = withArtifacts(makeEntry({ subject: `sub${i}` }), {
                trace: newBlobId(),
                dd: newBlobId(),
                viz: newBlobId(),
                qc: newBlobId(),
            });
            entries.push(entry);
            meta.push(urls);
            handlers.set(urls.trace, () => new Response(TRACE_OK, { status: 200 }));
            handlers.set(urls.dd, () => new Response('{"GeneratedBy":[]}', { status: 200 }));
            handlers.set(urls.viz, () => new Response("{}", { status: 200 }));
            handlers.set(urls.qc, () => new Response('{"metrics":[{"name":"drift","stage":"pre"}]}', { status: 200 }));
        }
        seedQueueState(entries);
        installFetch(handlers);

        await loadQueueData();
        await hydrationIdle();

        // Idle background hydration touched exactly the three traces — nothing else.
        const traceUrls = new Set(meta.map((m) => m.trace));
        const requested = blobRequests();
        expect(requested).toHaveLength(3);
        expect(requested.every((u) => traceUrls.has(u))).toBe(true);
    });

    it("eagerly hydrates provenance when a codebase-hash filter is active", async () => {
        window.history.replaceState(null, "", "/?codebaseHash=abc1234");
        const { entry, urls } = withArtifacts(makeEntry({ has_logs: false }), { dd: newBlobId() });
        seedQueueState([entry]);
        installFetch(
            new Map([
                [
                    urls.dd,
                    () =>
                        new Response(
                            JSON.stringify({
                                GeneratedBy: [
                                    {
                                        CodeURL: "https://github.com/dandi-compute/dandi-compute-core",
                                        Version: "abc1234",
                                    },
                                ],
                            }),
                            { status: 200 }
                        ),
                ],
            ])
        );

        await loadQueueData();
        await hydrationIdle();

        // The filter needs every run's GeneratedBy, so dataset_description is
        // fetched without any card reveal and the run enters the filtered set.
        expect(blobRequests()).toContain(urls.dd);
        expect(document.querySelector("#runs .run-entry")).not.toBeNull();
    });

    it("fetches QC only when a card section is expanded", async () => {
        const { entry, urls } = withArtifacts(makeEntry(), {
            trace: newBlobId(),
            qc: newBlobId(),
            png: newBlobId(),
        });
        seedQueueState([entry]);
        installFetch(
            new Map([
                [urls.trace, () => new Response(TRACE_OK, { status: 200 })],
                [urls.qc, () => new Response('{"metrics":[{"name":"drift","stage":"pre"}]}', { status: 200 })],
            ])
        );
        initHydrationPromotion();

        await loadQueueData();
        await hydrationIdle();
        // Before any expansion: no QC fetch yet, but the section is already
        // discoverable as a collapsed loading placeholder.
        expect(blobRequests()).not.toContain(urls.qc);
        const placeholder = document.querySelector('details[data-section="qc"]');
        expect(placeholder).not.toBeNull();
        expect(placeholder.textContent).toContain("Loading quality control");

        // Expand the QC placeholder itself through the real toggle path.
        placeholder.open = true;
        placeholder.dispatchEvent(new Event("toggle"));
        await hydrationIdle();

        expect(blobRequests()).toContain(urls.qc);
        const section = document.querySelector('details[data-section="qc"]');
        expect(section.textContent).not.toContain("Loading quality control");
        expect(section.textContent).toContain("drift");
        expect(section.hasAttribute("open")).toBe(true);
    });

    it("marks optimistic successes as provisional until the trace confirms them", async () => {
        // Group badges only exist in the tree layout (flat is the default).
        window.history.replaceState(null, "", "/?layout=tree");
        const { entry, urls } = withArtifacts(makeEntry(), { trace: newBlobId() });
        seedQueueState([entry]);
        const trace = deferred();
        installFetch(new Map([[urls.trace, () => trace.promise]]));

        await loadQueueData();

        const badge = document.querySelector("#runs .run-entry .status-badge");
        expect(badge.className).toContain("status-provisional");
        expect(document.querySelector(".gbadge-success").className).toContain("status-provisional");

        trace.resolve(new Response(TRACE_OK, { status: 200 }));
        await hydrationIdle();

        const confirmed = document.querySelector("#runs .run-entry .status-badge");
        expect(confirmed.className).toContain("status-success");
        expect(confirmed.className).not.toContain("status-provisional");
        expect(document.querySelector(".gbadge-success").className).not.toContain("status-provisional");
    });

    it("fetches inline report content only when its section is revealed", async () => {
        const rafOriginal = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        try {
            const { entry, urls } = withArtifacts(makeEntry(), { trace: newBlobId() });
            const reportId = newBlobId();
            const [probe] = parseQueueEntries([entry]);
            entry.output_paths[`${probe.path}/logs/report.html`] = reportId;
            const reportUrl = blobUrlFor(reportId);
            seedQueueState([entry]);
            installFetch(
                new Map([
                    [urls.trace, () => new Response(TRACE_OK, { status: 200 })],
                    [
                        reportUrl,
                        () => new Response("<html><head></head><body>report row</body></html>", { status: 200 }),
                    ],
                ])
            );

            await loadQueueData();
            await hydrationIdle();

            // The Reports section rendered an iframe shell, but the (potentially
            // multi-MB) report content must not have been fetched yet.
            const iframe = document.querySelector("iframe[data-srcdoc-url]");
            expect(iframe).not.toBeNull();
            expect(blobRequests()).not.toContain(reportUrl);
            expect(iframe.getAttribute("srcdoc")).toBeNull();

            // Reveal the Reports section through the real toggle path.
            const section = document.querySelector('details[data-section="reports"]');
            section.open = true;
            section.dispatchEvent(new Event("toggle"));
            await new Promise((r) => setTimeout(r, 0)); // rAF stub tick
            await new Promise((r) => setTimeout(r, 0)); // fetch + patch settle
            await new Promise((r) => setTimeout(r, 0));

            expect(blobRequests()).toContain(reportUrl);
            expect(iframe.getAttribute("srcdoc")).toContain("report row");
        } finally {
            global.requestAnimationFrame = rafOriginal;
        }
    });

    it("renders tree group bodies lazily on first open", async () => {
        // Flat is the default layout.
        window.history.replaceState(null, "", "/?layout=tree");
        const handlers = new Map();
        const entries = [];
        for (let i = 0; i < 3; i++) {
            const { entry, urls } = withArtifacts(makeEntry({ subject: `sub${i}` }), { trace: newBlobId() });
            entries.push(entry);
            handlers.set(urls.trace, () => new Response(TRACE_FAILED_PRE, { status: 200 }));
        }
        seedQueueState(entries);
        installFetch(handlers);
        initHydrationPromotion();

        await loadQueueData();
        await hydrationIdle();

        // Single dandiset auto-expands, but its three subject groups stay
        // collapsed — no run cards materialized anywhere.
        expect(document.querySelectorAll(".run-entry")).toHaveLength(0);
        const subjectGroups = document.querySelectorAll("details.subject-group");
        expect(subjectGroups).toHaveLength(3);
        // Group badges still reflect (hydrated) statuses without any cards.
        expect(document.querySelector(".gbadge-failed")).not.toBeNull();

        // Opening a subject group builds its body through the real toggle path…
        const subject = subjectGroups[0];
        subject.open = true;
        subject.dispatchEvent(new Event("toggle"));
        const session = subject.querySelector("details.session-group");
        expect(session).not.toBeNull();
        expect(document.querySelectorAll(".run-entry")).toHaveLength(0); // session still closed

        // …and opening the session group materializes its cards, already
        // hydrated (lazy bodies render from the live run objects).
        session.open = true;
        session.dispatchEvent(new Event("toggle"));
        const cards = session.querySelectorAll(".run-entry");
        expect(cards).toHaveLength(1);
        expect(cards[0].className).toContain("status-failed");
    });

    it("releases a group's materialized body when it closes and rebuilds it on reopen", async () => {
        // Flat is the default layout.
        window.history.replaceState(null, "", "/?layout=tree");
        const handlers = new Map();
        const entries = [];
        for (let i = 0; i < 3; i++) {
            const { entry, urls } = withArtifacts(makeEntry({ subject: `sub${i}` }), { trace: newBlobId() });
            entries.push(entry);
            handlers.set(urls.trace, () => new Response(TRACE_FAILED_PRE, { status: 200 }));
        }
        seedQueueState(entries);
        installFetch(handlers);
        initHydrationPromotion();

        await loadQueueData();
        await hydrationIdle();

        const subject = document.querySelector("details.subject-group");
        subject.open = true;
        subject.dispatchEvent(new Event("toggle"));
        const session = subject.querySelector("details.session-group");
        session.open = true;
        session.dispatchEvent(new Event("toggle"));
        expect(document.querySelectorAll(".run-entry")).toHaveLength(1);

        // Closing the subject group reclaims its card DOM immediately (it used
        // to linger until the next full re-render).
        subject.open = false;
        subject.dispatchEvent(new Event("toggle"));
        expect(subject.dataset.bodyRendered).toBeUndefined();
        expect(document.querySelectorAll(".run-entry")).toHaveLength(0);

        // Reopening rebuilds the body from the live run objects — with the
        // still-open session group's expansion state restored.
        subject.open = true;
        subject.dispatchEvent(new Event("toggle"));
        const cards = document.querySelectorAll(".run-entry");
        expect(cards).toHaveLength(1);
        expect(cards[0].className).toContain("status-failed");
    });

    it("materializes flat-layout cards in chunks behind a Show more button", async () => {
        window.history.replaceState(null, "", "/?layout=flat");
        const entries = [];
        for (let i = 0; i < 205; i++) {
            entries.push(
                makeEntry({
                    subject: `sub${i}`,
                    has_logs: false,
                    has_output: false,
                    has_code: true,
                    has_been_submitted: false,
                })
            );
        }
        seedQueueState(entries);
        installFetch(new Map());
        initFlatShowMore();

        await loadQueueData();
        await hydrationIdle();

        expect(document.querySelectorAll(".run-entry")).toHaveLength(200);
        const more = document.querySelector("[data-flat-more]");
        expect(more).not.toBeNull();
        expect(more.textContent).toContain("5 not shown");

        more.dispatchEvent(new Event("click", { bubbles: true }));
        expect(document.querySelectorAll(".run-entry")).toHaveLength(205);
        expect(document.querySelector("[data-flat-more]")).toBeNull();
    });

    it("supersedes stale hydration when the queue is reloaded mid-flight", async () => {
        const first = withArtifacts(makeEntry(), { trace: newBlobId() });
        seedQueueState([first.entry]);
        const staleTrace = deferred();
        const handlers = new Map([[first.urls.trace, () => staleTrace.promise]]);
        installFetch(handlers);
        await loadQueueData(); // generation 1: trace hangs

        // The run re-ran upstream: same identity, new content-addressed blob.
        const second = withArtifacts(makeEntry(), { trace: newBlobId() });
        handlers.set(second.urls.trace, () => new Response(TRACE_OK, { status: 200 }));
        seedQueueState([second.entry]);
        await loadQueueData(); // generation 2
        await hydrationIdle();
        expect(document.querySelector("#runs .run-entry").className).toContain("status-success");

        // The stale generation-1 result must not touch the fresh DOM.
        staleTrace.resolve(new Response(TRACE_FAILED_PRE, { status: 200 }));
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector("#runs .run-entry").className).toContain("status-success");
    });

    describe("soft reset on in-page filter changes", () => {
        // Two-dandiset fixture: run A (000777) succeeds, run B (000888) fails
        // in pre-processing and carries every card-detail artifact.
        function seedTwoDandisets({ layout = "tree" } = {}) {
            window.history.replaceState(null, "", layout === "flat" ? "/?layout=flat" : "/");
            const a = withArtifacts(makeEntry({ dandiset_id: "000777" }), { trace: newBlobId() });
            const b = withArtifacts(makeEntry({ dandiset_id: "000888" }), {
                trace: newBlobId(),
                dd: newBlobId(),
                viz: newBlobId(),
                qc: newBlobId(),
                png: newBlobId(),
            });
            seedQueueState([a.entry, b.entry]);
            installFetch(
                new Map([
                    [a.urls.trace, () => new Response(TRACE_OK, { status: 200 })],
                    [b.urls.trace, () => new Response(TRACE_FAILED_PRE, { status: 200 })],
                    [b.urls.dd, () => new Response('{"GeneratedBy":[]}', { status: 200 })],
                    [b.urls.viz, () => new Response("{}", { status: 200 })],
                    [b.urls.qc, () => new Response('{"metrics":[{"name":"drift","stage":"pre"}]}', { status: 200 })],
                ])
            );
            initHydrationPromotion();
            initInPageFilterNavigation();
            return { a, b };
        }

        it("applies summary-stat filter links in place and clears the blob memory cache", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();
            expect(blobMemoryCacheStats().entries).toBeGreaterThan(0);

            const failedLink = document.querySelector("#summary a.stat-failed");
            failedLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

            // Applied via pushState, no navigation: URL carries the filter and
            // the page re-rendered synchronously for the narrowed scope.
            expect(window.location.search).toContain("status=failed");
            expect(blobMemoryCacheStats()).toEqual({ entries: 0, bytes: 0 });
            expect(document.querySelector(".run-search-input").value).toBe("status:failed");
            expect(document.querySelector("#summary .stat-value").textContent).toBe("1"); // Total Runs
            await hydrationIdle();

            // Back returns to the unfiltered view in place as well.
            window.history.replaceState(null, "", "/");
            window.dispatchEvent(new Event("popstate"));
            expect(document.querySelector("#summary .stat-value").textContent).toBe("2");
            await hydrationIdle();
        });

        it("drops payloads and flags of runs leaving the filtered set, keeps settled statuses, and re-hydrates", async () => {
            const { b } = seedTwoDandisets({ layout: "flat" });
            await loadQueueData();
            await hydrationIdle();

            // Reveal run B's card so its detail + QC artifacts hydrate.
            const card = Array.from(document.querySelectorAll("[data-run-key]")).find(
                (el) => el.dataset.runKey === b.path
            );
            const section = card.querySelector("details");
            section.open = true;
            section.dispatchEvent(new Event("toggle"));
            await hydrationIdle();

            const runB = getRunsInScope().find((run) => run.dandisetId === "000888");
            const runA = getRunsInScope().find((run) => run.dandisetId === "000777");
            expect(runB.qualityControl).not.toBeNull();
            expect(runB.detailsLoaded).toBe(true);
            expect(runB.tasks.length).toBeGreaterThan(0);

            // Narrow to dandiset 000777: B leaves the filtered set.
            window.history.replaceState(null, "", "/?layout=flat&dandiset=000777");
            softResetForFilterChange();

            // B's hydrated payloads are dropped and its flags reset so a later
            // reveal re-fetches (from the persistent cache)…
            expect(runB.tasks).toEqual([]);
            expect(runB.datasetDescription).toBeNull();
            expect(runB.qualityControl).toBeNull();
            expect(runB.vizLinks).toBeNull();
            expect(runB.detailsLoaded).toBe(false);
            expect(runB.detailQueued).toBe(false);
            expect(runB.qcLoaded).toBe(false);
            expect(runB.qcQueued).toBe(false);
            expect(runB.traceLoaded).toBe(false);
            // …while its settled status stays truthful without a refetch.
            expect(runB.status).toBe("failed");
            expect(runB.failureStep).toBe("pre-processing");
            expect(runB.statusProvisional).toBe(false);

            // A stays fully hydrated: still in scope, nothing re-enqueued.
            expect(runA.traceLoaded).toBe(true);
            expect(runA.status).toBe("success");
            expect(runA.tasks.length).toBeGreaterThan(0);
            expect(document.querySelectorAll("#runs .run-entry")).toHaveLength(1);

            // B's status is already settled, so background hydration must NOT
            // re-read its trace while it stays out of scope — that would
            // repopulate the memory just reclaimed.
            await hydrationIdle();
            expect(runB.traceLoaded).toBe(false);
            expect(runB.tasks).toEqual([]);

            // Broadening the filter brings B back into the visible set, and
            // the restarted hydration re-reads its trace (from the persistent
            // cache) so its task table returns.
            window.history.replaceState(null, "", "/?layout=flat");
            softResetForFilterChange();
            await hydrationIdle();
            expect(runB.traceLoaded).toBe(true);
            expect(runB.tasks.length).toBeGreaterThan(0);
        });

        it("keeps hydrating never-settled out-of-scope runs so hydration-dependent filters converge", async () => {
            window.history.replaceState(null, "", "/");
            const a = withArtifacts(makeEntry({ dandiset_id: "000777" }), { trace: newBlobId() });
            const b = withArtifacts(makeEntry({ dandiset_id: "000888", has_output: false }), { trace: newBlobId() });
            seedQueueState([a.entry, b.entry]);
            const gatedTrace = deferred();
            installFetch(
                new Map([
                    [a.urls.trace, () => new Response(TRACE_OK, { status: 200 })],
                    // Fresh Response per call: the superseded generation and the
                    // restarted one both read this URL.
                    [b.urls.trace, () => gatedTrace.promise.then((body) => new Response(body, { status: 200 }))],
                ])
            );
            initInPageFilterNavigation();

            await loadQueueData();

            // Filter to pre-processing failures while B's trace is still in
            // flight: nothing matches yet, and B's status is unsettled.
            window.history.replaceState(null, "", "/?failureStep=pre-processing");
            softResetForFilterChange();
            expect(document.querySelector("#runs .runs-empty").textContent).toBe("No jobs match this search.");

            // B stayed in the restarted hydration queue; when its trace lands
            // it enters the filtered set via flushHydrationUpdates.
            gatedTrace.resolve(TRACE_FAILED_PRE);
            await hydrationIdle();
            expect(document.getElementById("error").style.display).toBe("none");
            expect(document.querySelector("#runs .run-entry, details.dandiset-group")).not.toBeNull();
            const runB = getRunsInScope().find((run) => run.dandisetId === "000888");
            expect(runB.status).toBe("failed");
            expect(runB.failureStep).toBe("pre-processing");
        });

        it("applies a search in place on Enter", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();
            const pushState = vi.spyOn(window.history, "pushState");

            const form = document.querySelector(".run-search");
            const input = form.querySelector(".run-search-input");
            input.value = "dandiset:000888";
            const submit = new Event("submit", { bubbles: true, cancelable: true });
            form.dispatchEvent(submit);

            expect(submit.defaultPrevented).toBe(true);
            expect(window.location.search).toContain("dandiset=000888");
            expect(document.querySelector("#summary .stat-value").textContent).toBe("1");
            expect(document.querySelector("#summary .stat-failed .stat-value").textContent.trim()).toBe("1");
            expect(document.querySelectorAll("#runs details.dandiset-group, #runs .run-entry").length).toBe(1);
            await hydrationIdle();

            // Re-applying the same search (terms reordered, spacing aside) is a no-op.
            input.value = "  dandiset:000888 ";
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            expect(pushState).toHaveBeenCalledTimes(1);
            pushState.mockRestore();
        });

        it("applies a picked suggestion in place and keeps the search focused for the next term", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();

            const input = document.querySelector(".run-search-input");
            input.focus();
            input.value = "dandiset:";
            input.setSelectionRange(9, 9);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            const option = [...document.querySelectorAll(".run-search-option")].find(
                (el) => el.dataset.term === "dandiset:000777"
            );
            option.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            expect(window.location.search).toContain("dandiset=000777");
            expect(document.querySelector("#summary .stat-value").textContent).toBe("1");
            expect(document.activeElement).toBe(input);
            expect(input.value).toBe("dandiset:000777 ");
            expect(document.querySelector(".run-search-suggestions").hidden).toBe(true);
            await hydrationIdle();

            // Clearing the search (Esc once nothing is being typed) applies too.
            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            expect(window.location.search).not.toContain("dandiset=");
            expect(document.querySelector("#summary .stat-value").textContent).toBe("2");
            expect(input.value).toBe("");
            await hydrationIdle();
        });

        // Type into the search bar (caret at the end), as a keystroke would.
        const type = (text) => {
            const input = document.querySelector(".run-search-input");
            input.value = text;
            input.setSelectionRange(text.length, text.length);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        };
        const pause = () => new Promise((resolve) => setTimeout(resolve, 300));

        it("applies a typed search in place once typing pauses, keeping the text, focus and scroll", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();
            const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
            const input = document.querySelector(".run-search-input");
            input.focus();

            type("dandiset:000888");
            expect(window.location.search).not.toContain("dandiset="); // not on each keystroke
            await pause();

            expect(window.location.search).toContain("dandiset=000888");
            expect(document.querySelectorAll("#runs .run-entry")).toHaveLength(1);
            expect(input.value).toBe("dandiset:000888");
            expect(document.activeElement).toBe(input);
            expect(document.querySelector(".run-search-status").hidden).toBe(true);
            expect(scrollTo).not.toHaveBeenCalled();
            scrollTo.mockRestore();
            await hydrationIdle();
        });

        it("holds back unfinished terms while typing", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();
            document.querySelector(".run-search-input").focus();

            // A partial value would match nothing, so it waits.
            type("dandiset:0008");
            await pause();
            expect(window.location.search).not.toContain("dandiset=");
            expect(document.querySelector("#runs .runs-empty")).toBeNull();

            // So does a word that may yet become a key; the finished term applies.
            type("dandiset:000888 pip");
            await pause();
            expect(window.location.search).toContain("dandiset=000888");
            expect(window.location.search).not.toContain("q=");
            await hydrationIdle();
        });

        it("gives one stretch of typing a single history entry", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();
            const pushState = vi.spyOn(window.history, "pushState");
            const replaceState = vi.spyOn(window.history, "replaceState");
            const input = document.querySelector(".run-search-input");
            input.focus();

            type("dandiset:000888");
            await pause();
            type("dandiset:000888 000888");
            await pause();
            input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

            expect(pushState).toHaveBeenCalledTimes(1);
            expect(window.location.search).toContain("q=000888");
            // Typing again after leaving the bar starts a new entry.
            input.focus();
            type("");
            await pause();
            expect(pushState).toHaveBeenCalledTimes(2);
            expect(replaceState.mock.calls.length).toBeGreaterThan(0);
            pushState.mockRestore();
            replaceState.mockRestore();
            await hydrationIdle();
        });

        it("keeps a search being typed through hydration refreshes of the banner", async () => {
            seedTwoDandisets();
            await loadQueueData();
            const input = document.querySelector(".run-search-input");
            input.focus();
            input.value = "status:fai";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await hydrationIdle();

            expect(document.querySelector(".run-search-input")).toBe(input);
            expect(document.activeElement).toBe(input);
            expect(input.value).toBe("status:fai");
        });

        it("filters to a pipeline in place from a job card's tag, and back", async () => {
            window.history.replaceState(null, "", "/?layout=flat");
            seedQueueState([
                makeEntry({ dandiset_id: "000777", has_logs: false }),
                makeEntry({ dandiset_id: "000888", pipeline: "lfp", has_logs: false }),
            ]);
            installFetch(new Map());
            initInPageFilterNavigation();
            await loadQueueData();
            await hydrationIdle();

            const tags = [...document.querySelectorAll("#runs .run-tag")];
            expect(tags.map((tag) => tag.textContent)).toEqual(
                expect.arrayContaining(["pipelineaind-ephys", "pipelinelfp"])
            );
            const lfpTag = tags.find((tag) => tag.textContent === "pipelinelfp");
            expect(lfpTag.className).toContain("run-tag-pipeline-lfp");
            lfpTag.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

            expect(window.location.search).toContain("pipeline=lfp");
            expect(document.querySelectorAll("#runs .run-entry")).toHaveLength(1);
            expect(document.querySelector(".run-search-input").value).toBe("pipeline:lfp");
            const activeTag = document.querySelector("#runs .run-tag");
            expect(activeTag.classList.contains("run-tag-active")).toBe(true);

            // The active tag toggles the filter back off.
            activeTag.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            expect(window.location.search).not.toContain("pipeline=");
            expect(document.querySelectorAll("#runs .run-entry")).toHaveLength(2);
            await hydrationIdle();
        });

        it("leaves view switches to real navigation", async () => {
            seedTwoDandisets();
            await loadQueueData();
            await hydrationIdle();

            const link = document.createElement("a");
            link.href = "?view=archive";
            document.getElementById("runs").append(link);
            const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
            link.dispatchEvent(evt);

            // Not intercepted: the browser would navigate (jsdom just no-ops).
            expect(evt.defaultPrevented).toBe(false);
            expect(window.location.search).not.toContain("view=archive");
        });
    });
});

describe("common issues page", () => {
    const { clearBlobMemoryCache, loadIssuesData, issuesScanIdle, renderIssuesPage } = require("./app");
    const MAIN_MANIFEST_URL = "https://dandiarchive.s3.amazonaws.com/dandisets/001697/draft/assets.jsonld";
    const ARCHIVE_MANIFEST_URL = "https://dandiarchive.s3.amazonaws.com/dandisets/001873/draft/assets.jsonld";
    const blobUrlFor = (id) => `https://dandiarchive.s3.amazonaws.com/blobs/${id.slice(0, 3)}/${id.slice(3, 6)}/${id}`;
    let originalFetch;

    const logFor = (process, message, exit = 1) =>
        [
            `Oct-03 23:55:01.001 [TaskFinalizer-1] ERROR nextflow.processor.TaskProcessor - Error executing process > '${process} (${process})'`,
            "Caused by:",
            `  Process \`${process} (${process})\` terminated with an error exit status (${exit})`,
            "Command exit status:",
            `  ${exit}`,
            "Command error:",
            "  Traceback (most recent call last):",
            `  ${message}`,
            "Work dir:",
            "  /work/aa/bb",
        ].join("\n");

    // One queue state: `jobs` is [{ id, dandiset, subject, version, status, log }].
    function tablesFor(prefix, jobs) {
        const header =
            "job_id\tdandiset_id\twithin_dandiset_path\tpipeline\tversion\tparams\tconfig\tcodebase\tcontent_id\tasset_size_bytes\tstatus\tcreated_at";
        const jobRows = [];
        const pathRows = [];
        const blobs = new Map();
        jobs.forEach((job, i) => {
            const capsule = `derivatives/dandisets-000/dandiset-${job.dandiset}/sub-${job.subject}/sub-${job.subject}_ecephys/pipeline-aind+ephys/${job.id}`;
            jobRows.push(
                [
                    job.id,
                    job.dandiset,
                    `sub-${job.subject}/sub-${job.subject}_ecephys.nwb`,
                    "aind+ephys",
                    job.version,
                    "p",
                    "c",
                    "",
                    "cid",
                    "",
                    job.status,
                    `2026-10-0${i + 1}T00:00:00Z`,
                ].join("\t")
            );
            pathRows.push(`${job.id}\t${capsule}/dataset_description.json\t${prefix}dd${i}`);
            if (job.log !== undefined) {
                const id = `${prefix}log${String(i).padStart(28, "0")}`;
                pathRows.push(`${job.id}\t${capsule}/logs/nextflow.log\t${id}`);
                pathRows.push(`${job.id}\t${capsule}/logs/trace.txt\t${prefix}tr${i}`);
                blobs.set(blobUrlFor(id), job.log);
            }
        });
        const jobsId = `${prefix}jobs${"0".repeat(26)}`;
        const pathsId = `${prefix}paths${"0".repeat(25)}`;
        blobs.set(blobUrlFor(jobsId), [header, ...jobRows].join("\n") + "\n");
        blobs.set(blobUrlFor(pathsId), ["job_id\tpath\tcontent_id", ...pathRows].join("\n") + "\n");
        const manifest = JSON.stringify([
            { path: "derivatives/jobs.tsv", contentUrl: [blobUrlFor(jobsId)] },
            { path: "derivatives/paths.tsv", contentUrl: [blobUrlFor(pathsId)] },
        ]);
        return { manifest, blobs };
    }

    function installFetch(main, archive) {
        global.fetch = vi.fn(async (url) => {
            const u = String(url);
            if (u === MAIN_MANIFEST_URL) return new Response(main.manifest, { status: 200 });
            if (u === ARCHIVE_MANIFEST_URL) return new Response(archive.manifest, { status: 200 });
            if (u.includes("registered_params.json") || u.includes("registered_configs.json")) {
                return new Response(JSON.stringify({}), { status: 200 });
            }
            const body = main.blobs.get(u) ?? archive.blobs.get(u);
            if (body !== undefined) return new Response(body, { status: 200 });
            return new Response(null, { status: 404 });
        });
    }

    const MAIN = () =>
        tablesFor("aaa", [
            {
                id: "job-000000000001",
                dandiset: "000111",
                subject: "a",
                version: "1.4.0",
                status: "failed",
                log: logFor("preprocessing", "ValueError: No spikes detected (0 found)"),
            },
            {
                id: "job-000000000002",
                dandiset: "000111",
                subject: "b",
                version: "1.4.0",
                status: "failed",
                log: logFor("job_dispatch", "RuntimeError: File /blobs/1/2/x is not an existing file or folder!"),
            },
            { id: "job-000000000003", dandiset: "000222", subject: "c", version: "1.3.3", status: "successful" },
            {
                id: "job-000000000004",
                dandiset: "001849",
                subject: "t",
                version: "1.4.0",
                status: "failed",
                log: logFor("preprocessing", "ValueError: test dandiset"),
            },
        ]);
    const ARCHIVE = () =>
        tablesFor("bbb", [
            {
                id: "job-000000000005",
                dandiset: "000333",
                subject: "d",
                version: "v1.2.4",
                status: "failed",
                log: logFor("job_dispatch", "RuntimeError: File /blobs/9/8/y is not an existing file or folder!"),
            },
            {
                id: "job-000000000006",
                dandiset: "000333",
                subject: "e",
                version: "v1.2.4",
                status: "failed",
                log: logFor("preprocessing", "ValueError: No spikes detected (3 found)"),
            },
            { id: "job-000000000007", dandiset: "000333", subject: "f", version: "v1.2.4", status: "stalled" },
            { id: "job-000000000008", dandiset: "000444", subject: "g", version: "v1.2.4", status: "failed" }, // no logs at all
        ]);

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="loading"></div>
            <div id="error"></div>
            <div id="filter-banner"></div>
            <div id="summary"></div>
            <div id="layout-bar"></div>
            <div id="runs"></div>
        `;
        sessionStorage.clear();
        // Fixture blob ids repeat across tests; the cross-test memory cache
        // must not serve one test's logs to the next.
        clearBlobMemoryCache();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        sessionStorage.clear();
        window.history.replaceState(null, "", "/");
    });

    it("scans both sources, groups failed jobs by normalized error, and ranks by frequency", async () => {
        window.history.replaceState(null, "", "/?view=issues");
        installFetch(MAIN(), ARCHIVE());

        await loadIssuesData();
        await issuesScanIdle();

        const summary = document.getElementById("summary");
        const statValues = [...summary.querySelectorAll(".stat-item")].map((el) => ({
            label: el.querySelector(".stat-label").textContent,
            value: el.querySelector(".stat-value").textContent.replace(/\s+/g, " ").trim(),
        }));
        // 2 main failures (test dandiset 001849 excluded, like the dashboard) + 3 archive failures (stalled excluded)
        expect(statValues).toEqual([
            { label: "Failed Jobs", value: "5" },
            { label: "Distinct Issues", value: "2" },
            { label: "Logs Scanned", value: "5 / 5" },
            { label: "No Error Details", value: "1" },
        ]);

        const groups = [...document.querySelectorAll(".issue-group")];
        expect(groups.map((group) => group.querySelector(".issue-count-value").textContent)).toEqual(["2", "2", "1"]);
        const messages = groups.map((group) => group.querySelector(".issue-message").textContent);
        expect(messages.slice(0, 2).sort()).toEqual([
            "RuntimeError: File <path> is not an existing file or folder!",
            "ValueError: No spikes detected (<n> found)",
        ]);
        expect(messages[2]).toBe("No error details found in the job's logs");
        expect(groups[2].className).toContain("issue-group-nodetails");

        const spikes = groups.find((group) =>
            group.querySelector(".issue-message").textContent.startsWith("ValueError")
        );
        expect(spikes.innerHTML).toContain("Main queue");
        expect(spikes.innerHTML).toContain("Archive");
        expect(spikes.querySelector(".issue-example code").textContent).toBe(
            "ValueError: No spikes detected (0 found)"
        );
        const rows = [...spikes.querySelectorAll(".issue-jobs tbody tr")];
        expect(rows).toHaveLength(2);
        const links = rows.map((row) => row.querySelector(".issue-job-link").getAttribute("href"));
        expect(links.some((href) => href.includes("view=dashboard") && href.includes("dandiset=000111"))).toBe(true);
        expect(links.some((href) => href.includes("view=archive") && href.includes("dandiset=000333"))).toBe(true);
        expect(rows[0].querySelector(".log-link")).not.toBeNull();
        expect(document.getElementById("layout-bar").style.display).toBe("none");

        // Search bar: issues flavor, with source: instead of status:.
        const banner = document.getElementById("filter-banner");
        expect(banner.innerHTML).toContain("Common Issues");
        // No search applied: no line under the bar.
        expect(banner.querySelector(".run-search-status").hidden).toBe(true);
        const input = banner.querySelector(".run-search-input");
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const keys = [...banner.querySelectorAll(".run-search-option")].map((option) => option.dataset.term);
        expect(keys).toContain("source:");
        expect(keys).not.toContain("status:");
        expect(searchTextToUrl("source:archive")).toContain("view=issues");
    });

    it("honors the source and failure-step filters", async () => {
        window.history.replaceState(null, "", "/?view=issues&source=archive&failureStep=job-dispatch");
        installFetch(MAIN(), ARCHIVE());

        await loadIssuesData();
        await issuesScanIdle();

        // Only the archive manifest was consulted.
        const fetched = global.fetch.mock.calls.map(([u]) => String(u));
        expect(fetched).toContain(ARCHIVE_MANIFEST_URL);
        expect(fetched).not.toContain(MAIN_MANIFEST_URL);

        const groups = [...document.querySelectorAll(".issue-group")];
        expect(groups).toHaveLength(1);
        expect(groups[0].querySelector(".issue-message").textContent).toBe(
            "RuntimeError: File <path> is not an existing file or folder!"
        );
        expect(document.getElementById("summary").querySelector(".stat-failed .stat-value").textContent).toBe("1");
        const banner = document.getElementById("filter-banner");
        expect(banner.querySelector(".run-search-input").value).toBe("failure:job-dispatch source:archive");
        // Both sources stay on offer, though only the archive was loaded.
        const input = banner.querySelector(".run-search-input");
        input.value = "source:";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect([...banner.querySelectorAll(".run-search-option")].map((option) => option.dataset.term)).toEqual([
            "source:archive",
            "source:main",
        ]);
    });

    it("waits for Enter rather than applying as you type, since applying reloads the page", async () => {
        window.history.replaceState(null, "", "/?view=issues&source=archive");
        installFetch(MAIN(), ARCHIVE());
        await loadIssuesData();
        await issuesScanIdle();

        const input = document.querySelector(".run-search-input");
        input.focus();
        input.value = "source:main";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(window.location.search).toBe("?view=issues&source=archive");
        expect(document.querySelector(".run-search-status").textContent).toBe("Press Enter to apply.");
    });

    it("reuses cached records instead of refetching logs on a reload", async () => {
        window.history.replaceState(null, "", "/?view=issues&source=main");
        installFetch(MAIN(), ARCHIVE());
        await loadIssuesData();
        await issuesScanIdle();
        const logFetches = () => global.fetch.mock.calls.filter(([u]) => String(u).includes("aaalog")).length;
        expect(logFetches()).toBe(2);

        await loadIssuesData();
        await issuesScanIdle();
        expect(logFetches()).toBe(2);
        expect([...document.querySelectorAll(".issue-group")]).toHaveLength(2);
    });

    it("renders an empty state and shows errors from the state fetch", async () => {
        renderIssuesPage({ runs: [], scanned: 0, total: 0, filter: {}, done: true });
        expect(document.getElementById("runs").textContent).toContain("No failed jobs match the current filter.");

        window.history.replaceState(null, "", "/?view=issues");
        global.fetch = vi.fn(async () => new Response(null, { status: 500 }));
        await loadIssuesData();
        expect(document.getElementById("error").style.display).toBe("");
        expect(document.getElementById("error").textContent).toContain("HTTP 500");
    });
});
