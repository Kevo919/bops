# Sets up this checkout on Windows, the way scripts/setup.sh does on a Mac, and says what's left.
# Run it again any time: it only adds what's missing, and never overwrites your .env.local.
#   1. Node 22 or newer, and the dependencies (npm install).
#   2. .env.local from .env.example, when there's none.
#   3. Says what you still need: your keys, Google Chrome for tasks on this PC.
#
#   npm run setup:win
$ErrorActionPreference = "Stop"
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root
Write-Host "Setting up $root"

# 1. Node and the dependencies.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "Install Node 22 or newer first (https://nodejs.org)."; exit 1 }
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { Write-Error "Node $major is too old: Bops needs Node 22 or newer (https://nodejs.org)."; exit 1 }
# --include=dev: with NODE_ENV=production set in the environment, npm would skip the build tools Bops needs.
npm install --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. Settings.
if (-not (Test-Path .env.local)) {
  Copy-Item .env.example .env.local
  Write-Host "  - .env.local made from .env.example: fill in OPENAI_API_KEY and OPENAI_EXECUTOR_API_KEY (and ORGO_API_KEY), or sign in with Orgo."
} else {
  Write-Host "  - .env.local is there already: left as it is."
}

# 3. What's left.
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Write-Host "  - Google Chrome: $chrome" } else { Write-Host "  - Install Google Chrome so bots can work on this PC (optional)." }
Write-Host ""
Write-Host "Done. Start Bops with:  npm run app"
