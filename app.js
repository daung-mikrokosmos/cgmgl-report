/**
 * Report Builder — modular helpers for form state, YAML emission, CSV import.
 */

const $ = (sel, root = document) => root.querySelector(sel);

function setInlineError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    const m = trim(message);
    el.textContent = m;
    el.hidden = !m;
}

function clearInlineFormErrors() {
    setInlineError("error-name", "");
    const nameInput = $("#report-name");
    if (nameInput) nameInput.removeAttribute("aria-invalid");
}

/** Fallback when `fetch` is unavailable (e.g. file://); keep in sync with repo CSV files. */
const SAMPLE_CSV_FALLBACK = {
    "sample-basics.csv": `name,place,plan1,plan2,plan3,plan4,plan5,next1,next2,next3,next4,next5,problem1,problem2,problem3,problem4,problem5
Alex Chen,Office,Finish API design,Write unit tests,Update documentation,,,Ship v1.2 to staging,Pair review with team,Schedule retro,,,None blocking,,,
`,
    "sample-actual.csv": `name,branch,deadline,progress
Auth service hardening,feature/auth-hardening,2026-04-15,65
Dashboard charts bugfix,hotfix/charts-null,2026-04-02,100
Migrate legacy reports,refactor/reports-v2,2026-05-01,10
`,
    "sample-morning.csv": `name,place,plan1,plan2,plan3,plan4,plan5
Alex Chen,Office,Morning standup,Review sprint board,,,
`,
};

function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadSampleCsv(filename) {
    let text;
    try {
        const r = await fetch(filename);
        if (!r.ok) throw new Error("not ok");
        text = await r.text();
    } catch {
        text = SAMPLE_CSV_FALLBACK[filename];
        if (text == null) return;
    }
    downloadTextFile(filename, text);
}

/**
 * Discourages casual DevTools / view-source use. Not secure: assets and logic are still on the client.
 */
function attachInspectGuards() {
    document.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });

    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "F12") {
                e.preventDefault();
                return;
            }
            const k = e.key;
            const u = k.length === 1 ? k.toUpperCase() : k;
            if (e.ctrlKey && e.shiftKey && "IJKCP".includes(u)) {
                e.preventDefault();
                return;
            }
            if (e.ctrlKey && u === "U") {
                e.preventDefault();
                return;
            }
            if (e.metaKey && e.altKey && "CIJU".includes(u)) {
                e.preventDefault();
            }
        },
        { capture: true }
    );
}

function trim(s) {
    return (s ?? "").trim();
}

function escapeYamlString(value) {
    if (/[:#\n\r\t"'\\]/.test(value) || value.startsWith(" ") || value.endsWith(" ")) {
        const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `"${escaped}"`;
    }
    return value;
}

function formatYamlLine(parts) {
    return parts.map((p) => (typeof p === "string" ? p : String(p))).join("");
}

/** Parse simple CSV with optional quotes; first row = headers. */
function parseCsv(text) {
    const rows = [];
    let i = 0;
    const len = text.length;

    function readField() {
        let field = "";
        if (text[i] === '"') {
            i++;
            while (i < len) {
                if (text[i] === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    field += text[i++];
                }
            }
        } else {
            while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
                field += text[i++];
            }
        }
        return field;
    }

    while (i < len) {
        const row = [];
        do {
            row.push(readField());
            if (i < len && text[i] === ",") i++;
        } while (i < len && text[i] !== "\n" && text[i] !== "\r");
        if (text[i] === "\r") i++;
        if (text[i] === "\n") i++;
        if (row.some((c) => trim(c) !== "")) rows.push(row);
    }
    return rows;
}

function normalizeHeader(h) {
    return trim(h).toLowerCase().replace(/\s+/g, "_");
}

const MAX_BASICS_SLOTS = 5;

function headerIndex(headers, ...candidates) {
    for (const c of candidates) {
        const i = headers.indexOf(c);
        if (i >= 0) return i;
    }
    return -1;
}

/** Read plan1…plan5-style columns in order; skips empty cells; max `max` items. */
function collectIndexedSlots(row, headers, base, max) {
    const out = [];
    for (let n = 1; n <= max; n++) {
        const i = headerIndex(headers, `${base}${n}`, `${base}_${n}`);
        if (i < 0) continue;
        const v = trim(row[i]);
        if (v) out.push(v);
    }
    return out.slice(0, max);
}

function normalizePlace(raw) {
    const s = trim(raw).toLowerCase().replace(/[\s_-]+/g, " ");
    if (s === "office") return "Office";
    if (s === "wfh" || s === "work from home" || s === "home" || s === "remote") return "WFH";
    return "Office";
}

/**
 * First row after header: name, place (→ Office/WFH), plan1…5, next1…5, problem1…5.
 * Returns null if the file does not look like a basics sheet (missing name column).
 */
function csvRowsToBasicsPayload(rows) {
    if (rows.length < 2) return null;
    const headers = rows[0].map(normalizeHeader);
    const row = rows[1];

    const iName = headerIndex(headers, "name");
    if (iName < 0) return null;

    const iPlace = headerIndex(headers, "place", "location");
    const name = trim(row[iName]);
    const placeRaw = iPlace >= 0 ? trim(row[iPlace]) : "";

    const plans = collectIndexedSlots(row, headers, "plan", MAX_BASICS_SLOTS);
    const nexts = collectIndexedSlots(row, headers, "next", MAX_BASICS_SLOTS);
    const problems = collectIndexedSlots(row, headers, "problem", MAX_BASICS_SLOTS);

    return {
        name,
        placeRaw,
        location: normalizePlace(placeRaw),
        plans,
        nexts,
        problems,
    };
}

function csvRowsToActualObjects(rows) {
    if (rows.length < 2) return [];
    const headers = rows[0].map(normalizeHeader);
    const idx = (name) => headers.indexOf(name);

    const iName = idx("name");
    const iBranch = idx("branch");
    const iDeadline = idx("deadline");
    const iProgress = idx("progress");
    const iStatus = idx("status");

    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = iName >= 0 ? trim(row[iName]) : "";
        if (!name) continue;

        let progress = iProgress >= 0 ? Number(trim(row[iProgress])) : NaN;
        if (Number.isNaN(progress) && iStatus >= 0) {
            const st = trim(row[iStatus]).toLowerCase().replace(/[\s_-]+/g, " ");
            progress = st === "completed" ? 100 : 0;
        }
        if (Number.isNaN(progress)) progress = 0;
        progress = Math.max(0, Math.min(100, Math.round(progress)));

        const status = progress >= 100 ? "Completed" : "In Progress";

        const branch = iBranch >= 0 ? trim(row[iBranch]) : "";
        const deadline = iDeadline >= 0 ? trim(row[iDeadline]) : "";

        out.push({ name, branch, status, deadline, progress });
    }
    return out;
}

/** Build YAML per spec; skip empty sections and optional empty fields. */
function buildYaml({ name, location, plans, actuals, nexts, problems }) {
    const blocks = [];

    const title = formatYamlLine(["■ ", escapeYamlString(name), "【", location, "】"]);
    const planItems = plans.map(trim).filter(Boolean);
    if (planItems.length) {
        const planBlock = ["Plan", ...planItems.map((p) => `    - ${escapeYamlString(p)}`)].join("\n");
        blocks.push([title, planBlock].join("\n"));
    } else {
        blocks.push(title);
    }

    const taskChunks = [];
    for (const a of actuals) {
        const n = trim(a.name);
        if (!n) continue;
        const lines = [`    - ${escapeYamlString(n)}`];
        if (trim(a.branch)) {
            lines.push(`        ● branch    - ${escapeYamlString(trim(a.branch))}`);
        }
        lines.push(`        ● status    - ${escapeYamlString(a.status)}`);
        if (trim(a.deadline)) {
            lines.push(`        ● deadline  - ${escapeYamlString(trim(a.deadline))}`);
        }
        lines.push(`        ● progress  - ${a.progress}%`);
        taskChunks.push(lines.join("\n"));
    }
    if (taskChunks.length) {
        blocks.push(["Actual", taskChunks.join("\n\n")].join("\n"));
    }

    const nextItems = nexts.map(trim).filter(Boolean);
    if (nextItems.length) {
        blocks.push(["Next", ...nextItems.map((n) => `    - ${escapeYamlString(n)}`)].join("\n"));
    }

    const problemItems = problems.map(trim).filter(Boolean);
    const problemLines =
        problemItems.length > 0
            ? problemItems.map((p) => `    - ${escapeYamlString(p)}`)
            : ["    - Nothing"];
    blocks.push(["Problem", ...problemLines].join("\n"));

    return blocks.join("\n\n");
}

function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function safeFileName(name) {
    const t = trim(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80);
    return t || "report";
}

// ——— DOM: dynamic lists ———

function stringRowTemplate(placeholder, value = "") {
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.innerHTML = `
    <input type="text" class="flex-grow str-input" placeholder="${placeholder}" value="${value.replace(/"/g, "&quot;")}" />
    <button type="button" class="btn icon-btn danger remove-row" title="Remove" aria-label="Remove">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"/></svg>
    </button>
  `;
    return wrap;
}

function clampProgress(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return 0;
    return Math.max(0, Math.min(100, Math.round(x)));
}

function statusFromProgress(p) {
    return clampProgress(p) >= 100 ? "Completed" : "In Progress";
}

function actualBlockTemplate(data = {}) {
    const name = data.name ?? "";
    const branch = data.branch ?? "";
    const deadline = data.deadline ?? "";
    let progress =
        typeof data.progress === "number"
            ? clampProgress(data.progress)
            : clampProgress(data.status === "Completed" ? 100 : 0);

    const wrap = document.createElement("div");
    wrap.className = "actual-block";
    wrap.innerHTML = `
    <div class="actual-grid">
      <label class="field full">
        <span class="label">Name</span>
        <input type="text" class="act-name" value="${String(name).replace(/"/g, "&quot;")}" />
      </label>
      <label class="field">
        <span class="label">Branch</span>
        <input type="text" class="act-branch" placeholder="optional" value="${String(branch).replace(/"/g, "&quot;")}" />
      </label>
      <label class="field">
        <span class="label">Deadline</span>
        <input type="date" class="act-deadline" value="${deadline.replace(/"/g, "&quot;")}" />
      </label>
      <div class="field full progress-field">
        <span class="label">Progress (0–100)</span>
        <div class="progress-row">
          <label class="progress-num-wrap">
            <span class="visually-hidden">Progress percent</span>
            <input type="number" class="act-progress-num" min="0" max="100" step="1" value="${progress}" inputmode="numeric" />
            <span class="progress-num-suffix" aria-hidden="true">%</span>
          </label>
          <div class="progress-bar-track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-valuetext="${progress}%" aria-label="Adjust progress by dragging or clicking the bar">
            <div class="progress-bar-fill act-progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        <p class="act-status-readout" aria-live="polite">${statusFromProgress(progress)}</p>
      </div>
    </div>
    <div style="margin-top:0.65rem;display:flex;justify-content:flex-end;">
      <button type="button" class="btn icon-btn danger remove-actual" title="Remove" aria-label="Remove row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"/></svg>
      </button>
    </div>
  `;

    const num = $(".act-progress-num", wrap);
    const fill = $(".act-progress-fill", wrap);
    const track = $(".progress-bar-track", wrap);
    const readout = $(".act-status-readout", wrap);

    function applyProgress(raw) {
        const p = clampProgress(raw);
        num.value = String(p);
        fill.style.width = `${p}%`;
        track.setAttribute("aria-valuenow", String(p));
        track.setAttribute("aria-valuetext", `${p}%`);
        readout.textContent = statusFromProgress(p);
    }

    function progressFromClientX(clientX) {
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        applyProgress(Math.round(ratio * 100));
    }

    let barDragging = false;

    num.addEventListener("input", () => applyProgress(num.value));
    num.addEventListener("blur", () => applyProgress(num.value));

    track.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        barDragging = true;
        track.classList.add("is-dragging");
        track.setPointerCapture(e.pointerId);
        progressFromClientX(e.clientX);
    });
    track.addEventListener("pointermove", (e) => {
        if (!barDragging) return;
        progressFromClientX(e.clientX);
    });
    function endBarDrag(e) {
        if (barDragging) {
            barDragging = false;
            track.classList.remove("is-dragging");
            if (track.hasPointerCapture(e.pointerId)) {
                track.releasePointerCapture(e.pointerId);
            }
        }
    }
    track.addEventListener("pointerup", endBarDrag);
    track.addEventListener("pointercancel", endBarDrag);

    track.addEventListener("keydown", (e) => {
        const cur = clampProgress(num.value);
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            applyProgress(cur - 1);
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            applyProgress(cur + 1);
        } else if (e.key === "Home") {
            e.preventDefault();
            applyProgress(0);
        } else if (e.key === "End") {
            e.preventDefault();
            applyProgress(100);
        } else if (e.key === "PageDown") {
            e.preventDefault();
            applyProgress(cur - 10);
        } else if (e.key === "PageUp") {
            e.preventDefault();
            applyProgress(cur + 10);
        }
    });

    $(".remove-actual", wrap).addEventListener("click", () => {
        const list = document.getElementById("actual-list");
        if (!list || list.querySelectorAll(".actual-block").length <= 1) return;
        wrap.remove();
        refreshActualRemoveState(list);
    });

    return wrap;
}

function collectStrings(container) {
    return Array.from(container.querySelectorAll(".str-input")).map((el) => trim(el.value));
}

function collectActuals(container) {
    return Array.from(container.querySelectorAll(".actual-block")).map((block) => {
        const progress = clampProgress($(".act-progress-num", block).value);
        return {
            name: trim($(".act-name", block).value),
            branch: trim($(".act-branch", block).value),
            status: statusFromProgress(progress),
            deadline: trim($(".act-deadline", block).value),
            progress,
        };
    });
}

function stringListLockedTitle(container) {
    switch (container?.id) {
        case "plan-list":
            return "At least one plan is needed";
        case "next-list":
            return "At least one next is needed";
        case "problem-list":
            return "At least one problem is needed";
        default:
            return "At least one item required";
    }
}

function refreshStringListRemoveState(container) {
    if (!container) return;
    const rows = container.querySelectorAll(".row");
    const single = rows.length <= 1;
    const locked = stringListLockedTitle(container);
    rows.forEach((row) => {
        const btn = row.querySelector(".remove-row");
        if (!btn) return;
        btn.disabled = single;
        btn.setAttribute("aria-disabled", single ? "true" : "false");
        btn.title = single ? locked : "Remove";
    });
}

function refreshActualRemoveState(container) {
    if (!container) return;
    const blocks = container.querySelectorAll(".actual-block");
    const single = blocks.length <= 1;
    blocks.forEach((block) => {
        const btn = block.querySelector(".remove-actual");
        if (!btn) return;
        btn.disabled = single;
        btn.setAttribute("aria-disabled", single ? "true" : "false");
        btn.title = single ? "At least one actual is needed" : "Remove row";
    });
}

function init() {
    attachInspectGuards();

    $("#download-sample-basics").addEventListener("click", () => downloadSampleCsv("sample-basics.csv"));
    $("#download-sample-actual").addEventListener("click", () => downloadSampleCsv("sample-actual.csv"));
    $("#download-sample-morning").addEventListener("click", () => downloadSampleCsv("sample-morning.csv"));

    const planList = $("#plan-list");
    const actualList = $("#actual-list");
    const nextList = $("#next-list");
    const problemList = $("#problem-list");

    function bindRemoveDelegation(container) {
        container.addEventListener("click", (e) => {
            const btn = e.target.closest(".remove-row");
            if (!btn || btn.disabled || !container.contains(btn)) return;
            if (container.querySelectorAll(".row").length <= 1) return;
            const row = btn.closest(".row");
            row?.remove();
            refreshStringListRemoveState(container);
        });
    }
    bindRemoveDelegation(planList);
    bindRemoveDelegation(nextList);
    bindRemoveDelegation(problemList);

    $("#report-name").addEventListener("input", () => {
        if (trim($("#report-name").value)) {
            setInlineError("error-name", "");
            $("#report-name").removeAttribute("aria-invalid");
        }
    });

    $("#add-plan").addEventListener("click", () => {
        planList.appendChild(stringRowTemplate("Plan item"));
        refreshStringListRemoveState(planList);
    });
    $("#add-next").addEventListener("click", () => {
        nextList.appendChild(stringRowTemplate("Next item"));
        refreshStringListRemoveState(nextList);
    });
    $("#add-problem").addEventListener("click", () => {
        problemList.appendChild(stringRowTemplate("Problem item"));
        refreshStringListRemoveState(problemList);
    });
    $("#add-actual").addEventListener("click", () => {
        actualList.appendChild(actualBlockTemplate());
        refreshActualRemoveState(actualList);
    });

    function fillStringList(container, values, placeholder) {
        container.innerHTML = "";
        const list = values.slice(0, MAX_BASICS_SLOTS).filter((v) => trim(v));
        if (list.length === 0) {
            container.appendChild(stringRowTemplate(placeholder));
            refreshStringListRemoveState(container);
            return;
        }
        list.forEach((v) => container.appendChild(stringRowTemplate(placeholder, v)));
        refreshStringListRemoveState(container);
    }

    $("#basics-csv").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "").replace(/^\uFEFF/, "");
            const rows = parseCsv(text);
            const payload = csvRowsToBasicsPayload(rows);
            if (!payload) {
                alert('Basics CSV needs a header row with a "name" column and at least one data row.');
                return;
            }
            $("#report-name").value = payload.name;
            $("#report-location").value = payload.location;
            fillStringList(planList, payload.plans, "Plan item");
            fillStringList(nextList, payload.nexts, "Next item");
            fillStringList(problemList, payload.problems, "Problem item");
        };
        reader.readAsText(file, "UTF-8");
    });

    $("#actual-csv").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "").replace(/^\uFEFF/, "");
            const rows = parseCsv(text);
            const objs = csvRowsToActualObjects(rows);
            if (!objs.length) return;
            actualList.innerHTML = "";
            objs.forEach((o) => actualList.appendChild(actualBlockTemplate(o)));
            refreshActualRemoveState(actualList);
        };
        reader.readAsText(file, "UTF-8");
    });

    // Seed one row each
    planList.appendChild(stringRowTemplate("Plan item"));
    actualList.appendChild(actualBlockTemplate());
    nextList.appendChild(stringRowTemplate("Next item"));
    problemList.appendChild(stringRowTemplate("Problem item"));
    refreshStringListRemoveState(planList);
    refreshStringListRemoveState(nextList);
    refreshStringListRemoveState(problemList);
    refreshActualRemoveState(actualList);

    const overlay = $("#modal-overlay");
    const yamlOut = $("#yaml-output");
    let lastDownloadName = "report.yml";
    let lastYaml = "";

    function openModal(yaml, filename) {
        lastYaml = yaml;
        lastDownloadName = filename;
        yamlOut.value = yaml;
        overlay.hidden = false;
        document.body.style.overflow = "hidden";
        yamlOut.focus();
        yamlOut.select();
    }

    function closeModal() {
        overlay.hidden = true;
        document.body.style.overflow = "";
        $("#toast").textContent = "";
    }

    $("#generate-btn").addEventListener("click", () => {
        clearInlineFormErrors();

        const name = trim($("#report-name").value);
        const location = $("#report-location").value;

        if (!name) {
            setInlineError("error-name", "Please enter a name.");
            $("#report-name").setAttribute("aria-invalid", "true");
            $("#report-name").focus();
            $("#error-name").scrollIntoView({ block: "nearest", behavior: "smooth" });
            return;
        }

        const plans = collectStrings(planList);
        const nexts = collectStrings(nextList);
        const actualsRaw = collectActuals(actualList);

        const yaml = buildYaml({
            name,
            location,
            plans,
            actuals: actualsRaw,
            nexts,
            problems: collectStrings(problemList),
        });

        const fname = `${safeFileName(name)}_${todayYmd()}.yml`;
        openModal(yaml, fname);
    });

    $("#modal-close").addEventListener("click", closeModal);
    $(".close-modal", overlay).addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !overlay.hidden) closeModal();
    });

    $("#copy-btn").addEventListener("click", async () => {
        const toast = $("#toast");
        try {
            await navigator.clipboard.writeText(lastYaml);
            toast.textContent = "Copied to clipboard.";
        } catch {
            yamlOut.select();
            document.execCommand("copy");
            toast.textContent = "Copied (fallback).";
        }
        setTimeout(() => {
            if (toast.textContent.startsWith("Copied")) toast.textContent = "";
        }, 2500);
    });

    $("#download-btn").addEventListener("click", () => {
        const blob = new Blob([lastYaml], { type: "text/yaml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = lastDownloadName;
        a.click();
        URL.revokeObjectURL(url);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
