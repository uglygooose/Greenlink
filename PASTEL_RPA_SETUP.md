# GreenLink → Sage 50 Pastel Partner (RPA Auto-Import)

This guide sets up a **local Windows Desktop Bot** that automatically imports GreenLink’s exported Pastel journal CSV into **Sage 50 Pastel Partner**, then reports success/failure back to GreenLink.

GreenLink already writes export jobs to disk and the Admin UI already polls for the result via:
- `GET /cashbook/export-job-status?export_date=YYYY-MM-DD&run_id=<runId>`

Your bot’s job is to:
1) Watch the **Ready** folder for new export jobs
2) Import the CSV into Pastel (UI automation)
3) Write a `.result.json` file (Imported or Failed)
4) Move the files to `Imported\` or `Failed\`

---

## 1) Set the export folder (one-time)

On the same Windows machine that runs Pastel (and ideally runs the GreenLink backend), set:

```env
GREENLINK_SAGE_EXPORT_DIR=C:\GreenLink\SageExports
```

If you do not set `GREENLINK_SAGE_EXPORT_DIR` (or `GREENLINK_EXPORT_DIR`), GreenLink defaults to a relative folder:

```text
<greenlink-project>\.tmp\SageExports\
```

GreenLink will create these subfolders automatically:

```text
C:\GreenLink\SageExports\Ready\
C:\GreenLink\SageExports\Imported\
C:\GreenLink\SageExports\Failed\
C:\GreenLink\SageExports\Archive\
```

**Important:** For true “one-click” automation, the GreenLink backend must be able to write to this folder.
- If GreenLink is running on Render, it cannot write to your local `C:\...` drive.
- For the demo, run the backend locally (or use a shared network folder that both the backend and Pastel PC can access).

**Also note:** your browser “download location” (e.g. `Downloads\`) is not what the bot should watch.
The bot should watch the **export folder** above (`...\SageExports\Ready\`) because GreenLink writes the job/CSV there.

---

## 2) What GreenLink writes (per export)

When you click **Export to Sage (CSV)** in GreenLink, it writes 3 files into `Ready\`:

```text
PASTEL_JOURNAL_GREENLINK_YYYYMMDD_<runId>.csv
PASTEL_JOURNAL_GREENLINK_YYYYMMDD_<runId>.audit.json
PASTEL_JOURNAL_GREENLINK_YYYYMMDD_<runId>.job.json
```

The `.job.json` contains:

```json
{
  "runId": "d47cf4c5",
  "date": "2026-02-09",
  "batchRef": "GREENLINK_20260209",
  "csv": "C:\\GreenLink\\SageExports\\Ready\\PASTEL_JOURNAL_GREENLINK_20260209_d47cf4c5.csv",
  "audit": "C:\\GreenLink\\SageExports\\Ready\\PASTEL_JOURNAL_GREENLINK_20260209_d47cf4c5.audit.json"
}
```

---

## 3) What the bot must write (to complete the job)

After importing, write a result file named:

```text
PASTEL_JOURNAL_GREENLINK_YYYYMMDD_<runId>.result.json
```

Put it in **either**:
- `Imported\` (success), or
- `Failed\` (failure)

Minimum shape (what GreenLink expects):

```json
{
  "status": "imported",
  "runId": "d47cf4c5",
  "date": "2026-02-09",
  "batchRef": "GREENLINK_20260209",
  "message": "Imported into Pastel"
}
```

If failed:

```json
{
  "status": "failed",
  "runId": "d47cf4c5",
  "date": "2026-02-09",
  "batchRef": "GREENLINK_20260209",
  "message": "Pastel import failed: <reason>"
}
```

Then move the 3 input files (`.csv`, `.audit.json`, `.job.json`) into the same bucket (`Imported\` or `Failed\`).

---

## 4) Recommended bot: Power Automate Desktop (PAD)

### Bot design (stable for demos)

1) **Loop forever**
2) List files in `Ready\` with extension `*.job.json`
3) For each job file:
   - Derive `baseName` = filename without `.job.json`
   - Ensure `baseName.csv` exists (wait a few seconds if needed)
   - Ensure Pastel is open and logged in (demo password can be stored in PAD as a secure input)
   - Import `baseName.csv` into Pastel via UI automation
   - On success: write `baseName.result.json` into `Imported\` and move files there
   - On failure: write `baseName.result.json` into `Failed\` and move files there
4) Sleep 2–5 seconds and continue

### Pastel UI automation approach

For best reliability:
- Keep Pastel open and signed in to the correct company.
- Navigate to the import screen once, then use PAD’s recorder to capture:
  - `Process → Journals → (select journal entry type) → Batch → Import`
  - File picker open + select file + confirm
- Replace the file path with the variable from the job file.

### Reading the `.job.json` inside PAD (simple option)

PAD can call PowerShell to read JSON and output values.

Example PowerShell (Run PowerShell Script action):

```powershell
param($jobPath)
$job = Get-Content -LiteralPath $jobPath -Raw | ConvertFrom-Json
Write-Output ($job.runId)
Write-Output ($job.date)
Write-Output ($job.batchRef)
Write-Output ($job.csv)
Write-Output ($job.audit)
```

Capture the 5 output lines into PAD variables.

### Writing the `.result.json` inside PAD

Use another PowerShell step:

```powershell
param($resultPath, $status, $runId, $date, $batchRef, $message)

$obj = @{
  status = $status
  runId = $runId
  date = $date
  batchRef = $batchRef
  message = $message
}

$json = $obj | ConvertTo-Json -Depth 5
$json | Out-File -LiteralPath $resultPath -Encoding utf8
```

---

## 5) What you should decide (per client)

Each club can differ; agree these and hardcode them in the PAD flow (or keep in a local config file):
- Which **Pastel company** to open
- Which **journal entry type** to import into (for this GreenLink demo: `05 - General Journal`)
- Whether Pastel needs credentials at startup

---

## 7) Demo default (Sage 50 Pastel Partner)

For the current GreenLink demo:
- Journal: `05 - General Journal`
- Batch type: normal (recommended for daily imports)
- Import action: `Process → Journals → 05 - General Journal → Batch → Import`

---

## 6) Quick checklist

- [ ] `GREENLINK_SAGE_EXPORT_DIR` points to a local, non-OneDrive folder
- [ ] Export creates `.csv`, `.audit.json`, `.job.json` in `Ready\`
- [ ] PAD flow sees a `.job.json`, imports the `.csv`, then writes `.result.json`
- [ ] GreenLink UI changes from “Waiting for Pastel import…” to “Imported” or “Failed”
