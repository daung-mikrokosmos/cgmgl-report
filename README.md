# CGMGL Report Generator

A **frontend-only** web app (no backend, server, or database) that collects report fields in the browser and emits a **`.yml` file** in a fixed layout. You can **preview**, **copy**, and **download** the result. Optional **CSV imports** fill **Basics** (name, location, Plans / Next / Problem) and/or the **Actual** section.

## What it does

1. **Basics** — Text **Name** and select **Location** (`Office` or `WFH`).
2. **Plan** — Dynamic list of plain-text lines (add/remove rows).
3. **Actual** — Dynamic rows with:
   - **name** (required for export)
   - **branch** (optional; omitted from YAML if empty)
   - **status** — `In Progress` or `Completed`
   - **deadline** — optional HTML date (exported as `YYYY-MM-DD`; line omitted if empty)
   - **progress** — range `0`–`100`
4. **Next** and **Problem** — Same pattern as Plan (lists of strings).

Whitespace is **trimmed** on export. **Empty sections** are omitted from the file except **Problem**, which always appears (see above). **Empty optional fields** on Actual rows (e.g. branch, deadline) are omitted per line.

**Generate** requires **Name**, **at least one non-empty Plan**, **at least one non-empty Next**, and **at least one Actual row with a name**. **Problem** is optional in the form; if no problem lines are filled, the YAML still includes a **Problem** section with a single item **`Nothing`**. Missing requirements are shown **together** as inline messages under each field (not alert dialogs). Focus moves to the first invalid field in order: name → plan → next → actual.

## Output format

The generated YAML follows this structure (symbols and indentation preserved):

- Title line: `■ {Name}【{Location}】`
- Sections: `Plan`, `Actual`, `Next` only appear when they have content. **`Problem` is always included** — either your entries or `    - Nothing` when the Problem fields are empty.
- **Actual** entries use nested bullets with `●` for `branch`, `status`, `deadline` (if present), and `progress`. Consecutive tasks are separated by a **blank line** for readability.

**Download filename:** `{Name}_{Date}.yml` where `{Date}` is **today’s local date** in `YYYY-MM-DD`. The name is sanitized for filesystem safety.

## CSV import (Basics)

In the **Basics** card, use **CSV** to load **name**, **place**, and up to **five** items each for plans, next steps, and problems.

**Header row** (required): include a **`name`** column. Also supported:

| Column                  | Meaning                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `name`                  | Report name → Name field                                                                       |
| `place` or `location`   | `Office`, `WFH`, `home`, `remote`, etc. → Location (unrecognized values default to **Office**) |
| `plan1` … `plan5`       | Optional; headers may be `plan_1` … `plan_5` instead                                           |
| `next1` … `next5`       | Optional; `next_1` … also accepted                                                             |
| `problem1` … `problem5` | Optional; `problem_1` … also accepted                                                          |

Only the **first data row** after the header is used. Non-empty cells are read in order (e.g. `plan2` can be filled while `plan1` is empty). Each list is capped at **five** entries. Import **replaces** the Name, Location, Plans, Next, and Problem fields (it does not change **Actual**).

See `sample-basics.csv` for an example.

## CSV import (Actual)

In the **Actual** card, use **CSV** to choose a file. Expected columns (header row):

`name`, `branch`, `status`, `deadline`, `progress`

- Parsing supports **quoted fields** and a UTF-8 **BOM** on the first line.
- **status** must be `In Progress` or `Completed` (otherwise defaults to `In Progress`).
- **progress** is coerced to `0`–`100`.
- Rows without a **name** are skipped. Import **replaces** all existing Actual rows.

## Tech stack

- **HTML**, **CSS**, **JavaScript** only — no frameworks or build step.
- **SVG** icons inlined (no icon font CDN).
- Styling: **full glassmorphism** (frosted panels, mesh gradient background, teal accents), **motion**, **responsive** layout.

## How to run

Open `index.html` in a modern browser (double-click or drag into the browser). No install required.

Under the title, use **Basics sample.csv** and **Actual sample.csv** to download the same files as in the repo (`sample-basics.csv`, `sample-actual.csv`). With a local static server, the app fetches those files; when opened as `file://`, built-in fallbacks are used so downloads still work.

For local development, if your browser blocks some APIs when opened as `file://`, serve the folder with any static server, for example:

```bash
npx --yes serve .
```

## Files

| File                | Role                                  |
| ------------------- | ------------------------------------- |
| `index.html`        | Structure, sections, modal for output |
| `favicon.png`       | App icon (tab / home screen)          |
| `styles.css`        | Glassmorphism layout, animations      |
| `app.js`            | Form logic, YAML builder, CSV parser  |
| `README.md`         | This documentation                    |
| `sample-basics.csv` | Example Basics CSV                    |
| `sample-actual.csv` | Example Actual CSV                    |

## Browser APIs

- **Clipboard** — Copy uses the Clipboard API when available, with a `document.execCommand('copy')` fallback.
- **Download** — Blob URL + temporary `<a download>`.

---

_Generated for offline, privacy-friendly reporting workflows._
