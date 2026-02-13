param(
  [Parameter(Mandatory=$true)]
  [string]$JobPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $JobPath)) {
  throw "Job file not found: $JobPath"
}

$job = Get-Content -LiteralPath $JobPath -Raw | ConvertFrom-Json

# Output one value per line so Power Automate Desktop can capture them easily.
Write-Output ($job.runId  | ForEach-Object { "$_" })
Write-Output ($job.date   | ForEach-Object { "$_" })
Write-Output ($job.batchRef | ForEach-Object { "$_" })
Write-Output ($job.csv    | ForEach-Object { "$_" })
Write-Output ($job.audit  | ForEach-Object { "$_" })

