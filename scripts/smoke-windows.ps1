#requires -Version 5.1
<#
.SYNOPSIS
Smoke-test a built Windows Bops app, its phone boundary, and authenticated save/tree shutdown.
.EXAMPLE
powershell -NoProfile -File scripts/smoke-windows.ps1 -RepoRoot C:\Users\MBV3n\bops
.NOTES
Quit Bops from its tray first. Refuses an existing app, live port, repo Node process or pairing.
Starts its own hidden Bops without an inspector. Pairing and window-token values stay in
memory and are never printed. Does not edit .env.local. Uses Node 24 and Windows PowerShell APIs;
no npm install, browser automation or provider-check requests are required. Uses the current user's
private window-token file for authenticated saving; this does not test the tray/app.quit lifecycle.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ExePath,
    [string]$WindowTokenPath = (Join-Path $env:APPDATA 'Bops\window-token'),
    [ValidateRange(15, 300)][int]$StartupTimeoutSeconds = 90,
    [ValidateRange(15, 120)][int]$QuitTimeoutSeconds = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$port = 3210 # desktop/main.cjs fixes the app's port; this script does not override it.
$checks = [ordered]@{}
$owned = @{}
$appProcess = $null
$pairCode = $null
$pairHash = $null
$envHashBefore = $null
$http = $null
$metadata = $null
$repo = $null
$exe = $null
$node = $null
$quitRequested = $false

function Write-Check([string]$Name, [bool]$Passed, [string]$Detail) {
    $checks[$Name] = $Passed
    $label = if ($Passed) { 'PASS' } else { 'FAIL' }
    Write-Host "$label [$Name] $Detail"
}

function Get-EnvFingerprint {
    $file = Join-Path $repo '.env.local'
    if (-not (Test-Path -LiteralPath $file)) { return 'absent' }
    return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
}

function Test-PortFree([int]$Number) {
    # Some Windows installations report stale owner-0 listeners. Probe real socket behavior instead.
    foreach ($address in @('127.0.0.1', '::1')) {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $attempt = $client.ConnectAsync($address, $Number)
            if ($attempt.Wait(500) -and $client.Connected) { return $false }
        } catch { } finally { $client.Dispose() }
    }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Number)
    try {
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    } catch { return $false } finally { $listener.Stop() }
}

function Get-ProcessSnapshot { return @(Get-CimInstance Win32_Process) }

function Test-RepoCommand([string]$CommandLine) {
    if (-not $CommandLine) { return $false }
    $prefix = [regex]::Escape($repo.Replace('\', '/').TrimEnd('/'))
    return [regex]::IsMatch($CommandLine.Replace('\', '/'), $prefix + '(?=[/"''\s]|$)', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Get-RepoNodes($Snapshot) {
    return @($Snapshot | Where-Object {
        $_.Name -ieq 'node.exe' -and (Test-RepoCommand $_.CommandLine)
    })
}

function Remember-OwnedProcesses {
    if (-not $appProcess) { return }
    $snapshot = Get-ProcessSnapshot
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($item in $snapshot) {
            $id = [int]$item.ProcessId
            if ($owned.ContainsKey($id)) { continue }
            $parentId = [int]$item.ParentProcessId
            if (-not $owned.ContainsKey($parentId)) { continue }
            $parent = @($snapshot | Where-Object { [int]$_.ProcessId -eq $parentId })
            # Never follow a reused PID belonging to another process.
            if ($parent.Count -ne 1 -or $parent[0].CreationDate -ne $owned[$parentId]) { continue }
            if ($item.CreationDate -lt $owned[$parentId]) { continue }
            $owned[$id] = $item.CreationDate
            $changed = $true
        }
    }
}

function Get-OwnedAlive {
    $snapshot = Get-ProcessSnapshot
    return @($snapshot | Where-Object {
        $owned.ContainsKey([int]$_.ProcessId) -and $_.CreationDate -eq $owned[[int]$_.ProcessId]
    })
}

# Every helper receives configuration through stdin, not a command line or temporary file. Its
# stdout/stderr are privately captured. Even failure diagnostics never print the helper's output.
function Invoke-PrivateNode([hashtable]$Options, [int]$TimeoutSeconds = 30) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Options | ConvertTo-Json -Compress -Depth 6)))
    $source = @'
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports, createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { pathToFileURL } from 'node:url';
const config = JSON.parse(Buffer.from('__CONFIG__', 'base64').toString('utf8'));
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24 or newer is required');
const remote = config.repo && path.join(config.repo, '.data', 'remote.json');
const hashAt = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).hash; } catch { return null; } };
function bundleInfo(exe) {
  const resources = path.join(path.dirname(exe), 'resources');
  const archive = path.join(resources, 'app.asar');
  if (!fs.existsSync(archive)) return JSON.parse(fs.readFileSync(path.join(resources, 'app', 'desktop', 'repo.json'), 'utf8'));
  const fd = fs.openSync(archive, 'r');
  try {
    const prefix = Buffer.alloc(8);
    if (fs.readSync(fd, prefix, 0, 8, 0) !== 8) throw new Error('Invalid ASAR header');
    const size = prefix.readUInt32LE(4);
    if (size < 8 || size > 32 * 1024 * 1024) throw new Error('Invalid ASAR size');
    const header = Buffer.alloc(size);
    if (fs.readSync(fd, header, 0, size, 8) !== size) throw new Error('Short ASAR header');
    const length = header.readUInt32LE(4);
    if (length > size - 8) throw new Error('Invalid ASAR JSON');
    const entry = JSON.parse(header.subarray(8, 8 + length).toString('utf8')).files?.desktop?.files?.['repo.json'];
    if (!entry || entry.link) throw new Error('Bundled repo.json missing');
    if (entry.unpacked) return JSON.parse(fs.readFileSync(path.join(`${archive}.unpacked`, 'desktop', 'repo.json'), 'utf8'));
    const offset = Number(entry.offset), bytes = Number(entry.size);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(bytes) || bytes < 2 || bytes > 65536) throw new Error('Invalid repo metadata size');
    const body = Buffer.alloc(bytes);
    if (fs.readSync(fd, body, 0, bytes, 8 + size + offset) !== bytes) throw new Error('Short repo metadata');
    return JSON.parse(body.toString('utf8'));
  } finally { fs.closeSync(fd); }
}
async function savedTreeShutdown() {
  if (!Number.isSafeInteger(config.pid) || config.pid <= 0) throw new Error('Invalid owned root');
  function processIdentity(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid process id');
    const script = `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { @{ pid=[int]$p.ProcessId; exe=$p.ExecutablePath; created=$p.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress }`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return output ? JSON.parse(output) : null;
  }
  function verifyRoot() {
    const identity = processIdentity(config.pid);
    if (!identity || identity.created !== config.created || typeof identity.exe !== 'string' || fs.realpathSync(identity.exe).toLowerCase() !== fs.realpathSync(config.exe).toLowerCase()) throw new Error('Owned app identity changed');
  }
  verifyRoot();
  const token = fs.readFileSync(config.tokenFile, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Window token unavailable');
  const base = `http://127.0.0.1:${config.port}`;
  const nonce = randomBytes(16).toString('hex');
  const healthResponse = await fetch(`${base}/api/health?nonce=${nonce}`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  const health = await healthResponse.json();
  const proof = createHmac('sha256', token).update(nonce).digest('hex');
  if (!healthResponse.ok || health.bops !== true || health.build !== config.build || typeof health.proof !== 'string' || !/^[0-9a-f]{64}$/.test(health.proof) || !timingSafeEqual(Buffer.from(health.proof, 'hex'), Buffer.from(proof, 'hex'))) throw new Error('Server window-token proof failed');
  const response = await fetch(`${base}/api/restart`, { method: 'POST', redirect: 'error', headers: { 'x-bops-window': token, origin: base }, signal: AbortSignal.timeout(20000) });
  const saved = await response.json();
  if (!response.ok || saved.ok !== true) throw new Error('Server save did not succeed');
  const expected = config.owned.find(item => item.pid === saved.pid);
  const server = expected && processIdentity(saved.pid);
  if (!expected || !server || server.created !== expected.created) throw new Error('Saved server is not an owned descendant');
  verifyRoot(); // Recheck after HTTP awaits, immediately before the existing targeted tree stop.
  const { stopServerTree } = require(path.join(config.repo, 'desktop', 'windows.cjs'));
  stopServerTree(config.pid, config.port, token);
  return { saved: true, stopped: true };
}
let result;
switch (config.mode) {
  case 'metadata': {
    const meta = bundleInfo(config.exe);
    if (typeof meta.path !== 'string' || meta.built !== true) throw new Error('Expected a built repository-linked Bops');
    const actual = fs.realpathSync(meta.path), expected = fs.realpathSync(config.repo);
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error('Bundled repo differs from requested repo');
    if (!fs.existsSync(path.join(actual, '.next', 'BUILD_ID'))) throw new Error('Built server is missing');
    result = { repo: actual, built: true, build: fs.readFileSync(path.join(actual, '.next', 'BUILD_ID'), 'utf8').trim() };
    break;
  }
  case 'pair': {
    if (fs.existsSync(remote) || fs.existsSync(`${remote}.tmp`)) throw new Error('Pairing appeared before pair');
    const originalWrite = fs.writeFileSync, originalLog = console.log;
    let output = '', ownedHash = null;
    // Execute the unchanged CLI, privately capturing its output. Audit only its exact temporary
    // pairing write, so the parent knows ownership even if rename/validation fails afterward.
    // No RNG or pairing logic is replaced; this wrapper lives only in the disposable helper.
    fs.writeFileSync = function(file, data, ...args) {
      const value = originalWrite.call(fs, file, data, ...args);
      if (path.resolve(String(file)) === path.resolve(`${remote}.tmp`)) {
        const hash = JSON.parse(String(data)).hash;
        if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid pairing hash');
        ownedHash = hash;
        process.stdout.write(`${JSON.stringify({ ownership: hash })}\n`);
      }
      return value;
    };
    syncBuiltinESMExports();
    console.log = (...values) => { output += `${values.join(' ')}\n`; };
    try {
      process.chdir(config.repo);
      await import(pathToFileURL(path.join(config.repo, 'scripts', 'pair-phone.mjs')).href);
      const code = output.match(/^\s*([A-Za-z0-9_-]{43})\s*$/m)?.[1];
      if (!code) throw new Error('Pair command did not return a valid code');
      const hash = createHash('sha256').update(code).digest('hex');
      if (hashAt(remote) !== hash || hash !== ownedHash) throw new Error('Pairing ownership could not be verified');
      result = { paired: true, code, hash };
    } catch {
      result = { paired: false, hash: ownedHash };
    } finally {
      console.log = originalLog;
      fs.writeFileSync = originalWrite;
      syncBuiltinESMExports();
    }
    break;
  }
  case 'unpair': {
    if (fs.existsSync(remote) && hashAt(remote) !== config.hash) throw new Error('Pairing changed; refusing to remove another pairing');
    if (fs.existsSync(`${remote}.tmp`) && hashAt(`${remote}.tmp`) !== config.hash) throw new Error('Temporary pairing is not ours');
    execFileSync(process.execPath, [path.join(config.repo, 'scripts', 'pair-phone.mjs'), '--off'], { cwd: config.repo, encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (fs.existsSync(`${remote}.tmp`)) fs.unlinkSync(`${remote}.tmp`);
    result = { unpaired: !fs.existsSync(remote) && !fs.existsSync(`${remote}.tmp`) };
    break;
  }
  case 'save-stop': result = await savedTreeShutdown(); break;
  default: throw new Error('Unknown helper action');
}
console.log(JSON.stringify(result));
'@
    $source = $source.Replace('__CONFIG__', $encoded)
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $node
    $start.Arguments = '--input-type=module'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $helper = [Diagnostics.Process]::new()
    $helper.StartInfo = $start
    try {
        [void]$helper.Start()
        $stdout = $helper.StandardOutput.ReadToEndAsync()
        $stderr = $helper.StandardError.ReadToEndAsync()
        $helper.StandardInput.Write($source)
        $helper.StandardInput.Close()
        $timedOut = -not $helper.WaitForExit($TimeoutSeconds * 1000)
        if ($timedOut) {
            $helper.Kill() # Only this private helper process, never a name-based kill.
            $helper.WaitForExit()
        }
        $privateOutput = $stdout.GetAwaiter().GetResult()
        [void]$stderr.GetAwaiter().GetResult()
        $lastRecord = $null
        foreach ($line in ($privateOutput -split '\r?\n' | Where-Object { $_.Trim() })) {
            $lastRecord = $line | ConvertFrom-Json
            if ($Options.mode -eq 'pair' -and $lastRecord.PSObject.Properties['ownership']) {
                if ($lastRecord.ownership -match '^[0-9a-f]{64}$') { $script:pairHash = $lastRecord.ownership }
            }
        }
        if ($timedOut) { throw 'Private helper timed out.' }
        if ($helper.ExitCode -ne 0) { throw 'Private helper failed; output withheld to protect pairing data.' }
        return $lastRecord
    } finally { $helper.Dispose() }
}

function Stop-OwnedApp {
    Remember-OwnedProcesses
    $root = Get-CimInstance Win32_Process -Filter "ProcessId=$($appProcess.Id)"
    if (-not $root -or $root.CreationDate -ne $owned[$appProcess.Id] -or $root.ExecutablePath -ine $exe) {
        throw 'Owned app identity changed; refusing tree shutdown.'
    }
    $identities = @(Get-OwnedAlive | ForEach-Object {
        @{ pid = [int]$_.ProcessId; created = $_.CreationDate.ToUniversalTime().ToString('o') }
    })
    return Invoke-PrivateNode @{ mode = 'save-stop'; repo = $repo; pid = $appProcess.Id; exe = $exe; created = $root.CreationDate.ToUniversalTime().ToString('o'); owned = $identities; tokenFile = $WindowTokenPath; port = $port; build = $metadata.build } -TimeoutSeconds 100
}

function Request([string]$Path, [string]$HostHeader, [string]$Code = '') {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "http://127.0.0.1:$port$Path")
    $response = $null
    try {
        $request.Headers.Host = $HostHeader
        if ($Code) { [void]$request.Headers.TryAddWithoutValidation('Cookie', "bops_remote=$Code") }
        $response = $http.SendAsync($request).GetAwaiter().GetResult()
        $body = if ($Path -in @('/api/health', '/api/pings')) { $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() } else { $null }
        return @{ Status = [int]$response.StatusCode; Body = $body }
    } finally { if ($response) { $response.Dispose() }; $request.Dispose() }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Windows is required.' }
    $repo = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath.TrimEnd('\')
    if (-not $ExePath) { $ExePath = Join-Path $repo 'dist-desktop\win-unpacked\Bops.exe' }
    $exe = (Resolve-Path -LiteralPath $ExePath).ProviderPath
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    if ($env:ELECTRON_RUN_AS_NODE) { throw 'ELECTRON_RUN_AS_NODE must not be set for this smoke test.' }
    $metadata = Invoke-PrivateNode @{ mode = 'metadata'; repo = $repo; exe = $exe }
    $repo = $metadata.repo
    if (-not (Test-Path -LiteralPath (Join-Path $repo 'scripts\pair-phone.mjs'))) { throw 'Pair helper is missing.' }
    $snapshot = Get-ProcessSnapshot
    if (@($snapshot | Where-Object { $_.Name -ieq 'Bops.exe' }).Count -gt 0) { throw 'Quit the existing Bops app from its tray first.' }
    if (@($snapshot | Where-Object { $_.Name -ieq 'electron.exe' -and (Test-RepoCommand $_.CommandLine) }).Count -gt 0) { throw 'A development Electron app for this repo is already running.' }
    if (@(Get-RepoNodes $snapshot).Count -gt 0) { throw 'A Node process for this repository is already running.' }
    if (-not (Test-PortFree $port)) { throw 'Port 3210 is in use or cannot be bound.' }
    foreach ($file in @('.data\remote.json', '.data\remote.json.tmp')) {
        if (Test-Path -LiteralPath (Join-Path $repo $file)) { throw 'An existing pairing or temporary pairing must not be overwritten.' }
    }
    $envHashBefore = Get-EnvFingerprint
    Write-Check 'preflight' $true 'Built app points to the requested repo; no app, server listener or pairing exists.'

    $appProcess = Start-Process -FilePath $exe -ArgumentList '--hidden' -WindowStyle Hidden -PassThru
    $rootProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($appProcess.Id)"
    if (-not $rootProcess) { throw 'The app exited before startup.' }
    $owned[[int]$rootProcess.ProcessId] = $rootProcess.CreationDate
    Add-Type -AssemblyName System.Net.Http
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.UseCookies = $false
    $handler.AllowAutoRedirect = $false
    $handler.UseProxy = $false
    $http = [System.Net.Http.HttpClient]::new($handler)
    $http.Timeout = [TimeSpan]::FromSeconds(5)
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $healthy = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        Remember-OwnedProcesses
        $appProcess.Refresh()
        if ($appProcess.HasExited) { break }
        try {
            $health = Request '/api/health' "127.0.0.1:$port"
            $value = $health.Body | ConvertFrom-Json
            if ($health.Status -eq 200 -and $value.bops -eq $true -and $value.build -eq $metadata.build) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    Write-Check 'health' $healthy 'Owned app health must report Bops and the bundled repository build ID.'
    if (-not $healthy) { throw 'App health did not become ready.' }
    Remember-OwnedProcesses
    $pair = Invoke-PrivateNode @{ mode = 'pair'; repo = $repo }
    if (-not $pair.paired) { throw 'Pairing failed; owned files will be removed by cleanup.' }
    $pairCode = $pair.code
    $pairHash = $pair.hash
    $pair = $null
    Write-Check 'pair' $true 'Fresh phone code created and its stored hash verified; code withheld.'
    $remoteHost = "smoke-$([Guid]::NewGuid().ToString('N')).invalid:$port"
    foreach ($case in @(
        @{ Name = 'pings-paired'; Path = '/api/pings'; Code = $pairCode; Expected = 200 },
        @{ Name = 'pings-unpaired'; Path = '/api/pings'; Code = ''; Expected = 403 },
        @{ Name = 'modules-phone-denied'; Path = '/api/modules'; Code = $pairCode; Expected = 403 }
    )) {
        $answer = Request $case.Path $remoteHost $case.Code
        $ok = $answer.Status -eq $case.Expected
        if ($ok -and $case.Name -eq 'pings-paired') {
            $payload = $answer.Body | ConvertFrom-Json
            $ok = $payload.PSObject.Properties.Name -contains 'pings' -and $payload.pings -is [Array]
        }
        Write-Check $case.Name $ok "HTTP $($answer.Status); expected $($case.Expected), using a non-loopback Host."
        if (-not $ok) { throw 'A phone access boundary failed.' }
    }
    $off = Invoke-PrivateNode @{ mode = 'unpair'; repo = $repo; hash = $pairHash }
    if (-not $off.unpaired) { throw 'Pairing was not removed.' }
    $answer = Request '/api/pings' $remoteHost $pairCode
    Write-Check 'revoked-code' ($answer.Status -eq 403) "Old code returned HTTP $($answer.Status); expected 403."
    if ($answer.Status -ne 403) { throw 'Revoked code was accepted.' }
    Remember-OwnedProcesses
    $quit = Stop-OwnedApp
    $quitRequested = $quit.saved -and $quit.stopped
} catch {
    # Only our controlled PowerShell errors are shown; helper output and response bodies stay private.
    Write-Check 'execution' $false $_.Exception.Message
} finally {
    if ($pairHash -and $repo) {
        try {
            $off = Invoke-PrivateNode @{ mode = 'unpair'; repo = $repo; hash = $pairHash }
            Write-Check 'pairing-cleanup' ([bool]$off.unpaired) 'Only the smoke pairing was removed; no remote.json or temporary pairing remains.'
        } catch { Write-Check 'pairing-cleanup' $false 'Could not safely remove smoke pairing; another pairing is never overwritten.' }
    }
    $pairCode = $null
    if ($appProcess) {
        try {
            Remember-OwnedProcesses
            $appProcess.Refresh()
            if (-not $appProcess.HasExited -and -not $quitRequested) {
                $quit = Stop-OwnedApp
                $quitRequested = $quit.saved -and $quit.stopped
            }
            $deadline = [DateTime]::UtcNow.AddSeconds($QuitTimeoutSeconds)
            do {
                Remember-OwnedProcesses
                $remaining = @(Get-OwnedAlive)
                if ($remaining.Count -eq 0 -and (Test-PortFree $port)) { break }
                Start-Sleep -Milliseconds 500
            } while ([DateTime]::UtcNow -lt $deadline)
            $naturalStop = $remaining.Count -eq 0 -and (Test-PortFree $port)
            Write-Check 'saved-tree-shutdown' ($quitRequested -and $naturalStop) 'Authenticated save succeeded; existing stopServerTree stopped only our app tree and freed its port.'
        } catch { Write-Check 'saved-tree-shutdown' $false 'Authenticated save and owned-tree shutdown could not be verified.' }
        # Fallback is cleanup only, never a passing lifecycle result. Every PID must still have the
        # creation time captured beneath our own app; never kill by process name or repo substring.
        try {
            Remember-OwnedProcesses
            $remaining = @(Get-OwnedAlive)
            # Stop our app root first so its restart loop cannot create another server during cleanup.
            $root = @($remaining | Where-Object { [int]$_.ProcessId -eq $appProcess.Id })
            foreach ($item in @($root) + @($remaining | Where-Object { [int]$_.ProcessId -ne $appProcess.Id } | Sort-Object CreationDate)) {
                $now = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.ProcessId)"
                if ($now -and $now.CreationDate -eq $item.CreationDate) {
                    Stop-Process -Id ([int]$item.ProcessId) -Force -ErrorAction Stop
                }
            }
            if ($remaining.Count -gt 0) { Write-Check 'forced-cleanup' $false 'Fallback terminated only recorded owned PIDs; saved-tree shutdown test failed.' }
            $clean = @(Get-OwnedAlive).Count -eq 0 -and @(Get-RepoNodes (Get-ProcessSnapshot)).Count -eq 0 -and (Test-PortFree $port)
            Write-Check 'process-cleanup' $clean 'No owned descendants, repository Node processes or live server listener remain.'
        } catch { Write-Check 'process-cleanup' $false 'Could not verify complete cleanup; inspect the app and port before retrying.' }
        $appProcess.Dispose()
    }
    if ($envHashBefore -and $repo) {
        try { Write-Check 'env-unchanged' ((Get-EnvFingerprint) -eq $envHashBefore) '.env.local SHA-256 (or absence) matches its pre-test state.' }
        catch { Write-Check 'env-unchanged' $false 'Could not verify .env.local remains unchanged.' }
    }
    if ($http) { $http.Dispose() }
}

foreach ($required in @('preflight', 'health', 'pair', 'pings-paired', 'pings-unpaired', 'modules-phone-denied', 'revoked-code', 'pairing-cleanup', 'saved-tree-shutdown', 'process-cleanup', 'env-unchanged')) {
    if (-not $checks.Contains($required)) { Write-Check $required $false 'Not run because an earlier check failed.' }
}
if (@($checks.Values | Where-Object { $_ -eq $false }).Count -gt 0) {
    Write-Host 'FAIL Windows smoke test. No credentials were printed; review the failed checks above.'
    exit 1
}
Write-Host 'PASS Windows smoke test: startup, pairing boundaries, revocation, saved-tree shutdown, cleanup and unchanged environment.'
exit 0
