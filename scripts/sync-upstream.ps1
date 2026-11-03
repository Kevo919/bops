# Bring OrgoAI's latest Bops into this fork, on this PC: fetches their main and merges it into the branch
# you're on (windows-port). If their changes clash with this fork's, git stops and lists the files; fix
# them (or ask Claude), then `git add` them and `git commit`. Nothing is pushed: you push when it works.
#
#   npm run sync:upstream
$ErrorActionPreference = "Stop"
Set-Location (git rev-parse --show-toplevel).Trim()
if (git status --porcelain) { Write-Error "You have changes that aren't committed. Commit or stash them first."; exit 1 }
if (-not (git remote | Select-String -SimpleMatch "upstream")) { git remote add upstream https://github.com/OrgoAI/bops.git }
git fetch upstream main
$behind = [int](git rev-list --count "HEAD..upstream/main")
if ($behind -eq 0) { Write-Host "Already up to date with OrgoAI."; exit 0 }
Write-Host "OrgoAI has $behind new commit(s). Merging..."
git merge --no-edit upstream/main
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "These files clash with this fork's changes:"
  git diff --name-only --diff-filter=U
  Write-Host "Fix them, then: git add <files>; git commit"
  exit 1
}
npm install --include=dev --no-audit --no-fund
Write-Host "Merged. Try it with: npm run app"
