param(
  [switch]$SeedFeb
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (Test-Path ".\\.venv\\Scripts\\Activate.ps1") {
  . ".\\.venv\\Scripts\\Activate.ps1"
} else {
  python -m venv .venv
  . ".\\.venv\\Scripts\\Activate.ps1"
}

pip install -r requirements.txt

# Local dev should not depend on remote Supabase connectivity.
$env:PREFER_LOCAL_DB = "1"
$env:FORCE_SQLITE = "1"
$env:SQLITE_FALLBACK_URL = "sqlite:///./greenlink.dev.v2.db"

# Bootstrap super admin + default Umhlali club/admin in local dev.
$env:GREENLINK_BOOTSTRAP = "1"
$env:GREENLINK_BOOTSTRAP_FORCE_RESET = "1"
$env:GREENLINK_SUPER_ADMIN_EMAIL = "greenlinkgolfsa@gmail.com"
$env:GREENLINK_SUPER_ADMIN_PASSWORD = "GreenLink123!"
$env:GREENLINK_DEFAULT_CLUB_NAME = "Umhlali Country Club"
$env:GREENLINK_DEFAULT_CLUB_SLUG = "umhlali"
$env:GREENLINK_DEFAULT_CLUB_ADMIN_EMAIL = "admin@umhlali.com"
$env:GREENLINK_DEFAULT_CLUB_ADMIN_PASSWORD = "Admin123!"

if ($SeedFeb) {
  python .\\seed_umhlali_feb_2026.py --yes
}

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
