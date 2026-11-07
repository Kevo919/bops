# Holds a Windows Job Object (kill on close) on one Claude Code run, so nothing it started outlives
# the turn even if Bops itself dies: the sitter owns the job's handle; when Claude Code exits, or the
# Bops process that started the sitter is gone, the sitter ends, the handle closes, and Windows ends
# every process still in the job (children joined it the moment Claude Code spawned them).
# Started by lib/server/pc-task-runner.ts (runClaudeTurn, Windows only) as:
#   powershell -NoProfile -ExecutionPolicy Bypass -File win-job-sitter.ps1 -Child <claudePid> -Parent <bopsPid>
# When this script can't run or can't make the job, it says so in %LOCALAPPDATA%\Bops-team\win-job-sitter.log,
# writes <GoFile>.failed (so the launcher stops waiting and the turn fails closed, never running outside
# the job), and leaves. Every failure before the assignment goes through Fail.
param([int]$Child, [int]$Parent, [string]$GoFile = "")
$log = Join-Path $env:LOCALAPPDATA "Bops-team\win-job-sitter.log"
function Note([string]$what) {
  try { Add-Content -Path $log -Value ("{0} child={1} parent={2}: {3}" -f (Get-Date -Format o), $Child, $Parent, $what) } catch {}
}
$assigned = $false
function Fail([string]$what) {
  Note $what
  if ($GoFile -and -not $assigned) { try { Set-Content -Path "$GoFile.failed" -Value $what -NoNewline } catch {} }
  exit 1
}
# Anything this script didn't foresee fails the same way, so the launcher never waits it out.
trap { Fail "unexpected: $($_.Exception.Message)" }
if (-not $Child -or -not $Parent) { Fail "missing -Child or -Parent" }

$src = @'
using System;
using System.Runtime.InteropServices;

public static class BopsJob {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObject(IntPtr attrs, string name);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetInformationJobObject(IntPtr job, int info, ref Extended limits, int size);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr OpenProcess(int access, bool inherit, int pid);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern int WaitForMultipleObjects(int count, IntPtr[] handles, bool waitAll, int ms);

  [StructLayout(LayoutKind.Sequential)]
  public struct Basic {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit, PriorityClass, SchedulingClass;
    public UIntPtr Affinity;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct IoCounters {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct Extended {
    public Basic BasicLimitInformation;
    public IoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
}
'@

# Compile once per source: the assembly is cached beside the log under a hash of its own source, so a
# changed sitter takes effect at once (the cache never serves an old build) and a later sitter starts
# (and so assigns the turn's Claude Code) without compiling again. Two sitters starting at once on a
# machine with no cache each compile to their own temp name and move it into place; whichever moves
# second finds the final file already there, which is just as good (same source, same hash).
$dir = Join-Path $env:LOCALAPPDATA "Bops-team"
$sha = [Security.Cryptography.SHA256]::Create()
$hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($src)))).Replace("-", "").Substring(0, 16).ToLowerInvariant()
$dll = Join-Path $dir "win-job-sitter.$hash.dll"
try {
  if (Test-Path $dll) { Add-Type -Path $dll }
  else {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $tmpDll = Join-Path $dir ("win-job-sitter.$hash.{0}.tmp.dll" -f [guid]::NewGuid().ToString("N"))
    Add-Type -TypeDefinition $src -OutputAssembly $tmpDll -OutputType Library
    try { Move-Item -LiteralPath $tmpDll -Destination $dll -ErrorAction Stop }
    catch {
      # Another sitter got there first: its build is this build.
      if (-not (Test-Path $dll)) { throw }
      Remove-Item -LiteralPath $tmpDll -ErrorAction SilentlyContinue
    }
    Add-Type -Path $dll
    # Old builds of the assembly don't pile up (only finished builds: another sitter's .tmp.dll is left alone).
    Get-ChildItem $dir -Filter "win-job-sitter.*.dll" | Where-Object { $_.Name -match '^win-job-sitter\.[0-9a-f]{16}\.dll$' -and $_.Name -ne "win-job-sitter.$hash.dll" } | Remove-Item -ErrorAction SilentlyContinue
  }
} catch { Fail "compile failed: $($_.Exception.Message)" }

$job = [BopsJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { Fail "CreateJobObject failed" }
$limits = New-Object BopsJob+Extended
$limits.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
$size = [Runtime.InteropServices.Marshal]::SizeOf([type][BopsJob+Extended])
if (-not [BopsJob]::SetInformationJobObject($job, 9, [ref]$limits, $size)) { Fail "SetInformationJobObject failed" }

$parentHandle = [BopsJob]::OpenProcess(0x00100000, $false, $Parent)

# The job on Claude Code itself; everything it spawns joins with it (no breakaway is allowed).
# AssignProcessToJobObject needs PROCESS_SET_QUOTA (0x0100) and PROCESS_TERMINATE (0x0001); SYNCHRONIZE
# (0x00100000) is what makes the handle waitable. Handles, not PIDs: a handle can't be reused.
$childHandle = [BopsJob]::OpenProcess(0x0101 -bor 0x00100000, $false, $Child)
if ($childHandle -eq [IntPtr]::Zero) { Fail "OpenProcess(child) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
if (-not [BopsJob]::AssignProcessToJobObject($job, $childHandle)) {
  Fail "assign failed (err $([Runtime.InteropServices.Marshal]::GetLastWin32Error())); the launcher won't start the turn"
}
$assigned = $true
# The launcher waits for this file before it runs the CLI (win-job-launcher.cjs): only once the
# assignment took does the CLI start, so nothing it forks can predate the job. No GoFile given (an
# older runner, or a direct use of the sitter) means no one is waiting on it.
# A go file that can't be written ends the sitter, so the job closes and takes the launcher with it.
if ($GoFile) { try { Set-Content -Path $GoFile -Value "go" -NoNewline -ErrorAction Stop } catch { Note "go file couldn't be written: $($_.Exception.Message)"; exit 1 } }

# Wait on the handles themselves: whichever signals first (Claude Code exits, or Bops is gone) ends
# the sitter, closing the job's handle, which ends whatever of the turn is still running. When the
# parent can't be watched (OpenProcess failed: it may already be gone, or rights changed), say so and
# watch only Claude Code - a sitter that can't watch must never end a turn that's still running; the
# runner's own tree-kill at the turn's end is the fallback for a Bops that dies unwatched.
if ($parentHandle -eq [IntPtr]::Zero) {
  Note "parent unwatchable (err $([Runtime.InteropServices.Marshal]::GetLastWin32Error())); watching the turn only"
  [void][BopsJob]::WaitForMultipleObjects(1, @($childHandle), $false, -1)
} else {
  [void][BopsJob]::WaitForMultipleObjects(2, @($childHandle, $parentHandle), $false, -1)
}
