param(
  [Parameter(Mandatory=$true)]
  [string]$ResultPath,

  [Parameter(Mandatory=$true)]
  [ValidateSet("imported","failed","pending","unknown")]
  [string]$Status,

  [Parameter(Mandatory=$true)]
  [string]$RunId,

  [Parameter(Mandatory=$true)]
  [string]$Date,

  [Parameter(Mandatory=$true)]
  [string]$BatchRef,

  [Parameter(Mandatory=$false)]
  [string]$Message = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$obj = @{
  status   = $Status
  runId    = $RunId
  date     = $Date
  batchRef = $BatchRef
  message  = $Message
}

$json = ($obj | ConvertTo-Json -Depth 5)

$dir = Split-Path -Parent $ResultPath
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# Write UTF-8 without BOM (Pastel is sensitive to BOM in CSV; JSON is fine, but keep clean anyway).
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ResultPath, $json, $utf8NoBom)

