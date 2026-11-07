# Holds a Windows Job Object (kill on close) on one Claude Code run, so nothing it started outlives
# the turn even if Bops itself dies: the sitter owns the job's handle; when Claude Code exits, or the
# Bops process that started the sitter is gone, the sitter ends, the handle closes, and Windows ends
# every process still in the job (children joined it the moment Claude Code spawned them).
# Started by lib/server/pc-task-runner.ts (runClaudeTurn, Windows only) as:
#   powershell -NoProfile -ExecutionPolicy Bypass -File win-job-sitter.ps1 -Child <claudePid> -Parent <bopsPid>
# When this script can't run or can't make the job, it says so in %LOCALAPPDATA%\Bops-team\win-job-sitter.log
# and leaves; stopClaude's taskkill of the whole tree still ends a turn's processes the ordinary way.
param([int]$Child, [int]$Parent)
if (-not $Child -or -not $Parent) { exit 1 }
$log = Join-Path $env:LOCALAPPDATA "Bops-team\win-job-sitter.log"
function Note([string]$what) {
  try { Add-Content -Path $log -Value ("{0} child={1} parent={2}: {3}" -f (Get-Date -Format o), $Child, $Parent, $what) } catch {}
}

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

# Compile once per machine: the assembly is kept beside the log, so a later sitter starts (and so
# assigns the turn's Claude Code) without compiling again.
$dir = Join-Path $env:LOCALAPPDATA "Bops-team"
$dll = Join-Path $dir "win-job-sitter.dll"
try {
  if (Test-Path $dll) { Add-Type -Path $dll }
  else {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Add-Type -TypeDefinition $src -OutputAssembly $dll -OutputType Library
    Add-Type -Path $dll
  }
} catch { Note "compile failed: $($_.Exception.Message)"; exit 1 }

$job = [BopsJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { Note "CreateJobObject failed"; exit 1 }
$limits = New-Object BopsJob+Extended
$limits.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
$size = [Runtime.InteropServices.Marshal]::SizeOf([type][BopsJob+Extended])
if (-not [BopsJob]::SetInformationJobObject($job, 9, [ref]$limits, $size)) { Note "SetInformationJobObject failed"; exit 1 }

# The job on Claude Code itself; everything it spawns joins with it (no breakaway is allowed).
# AssignProcessToJobObject needs PROCESS_SET_QUOTA (0x0100) and PROCESS_TERMINATE (0x0001); SYNCHRONIZE
# (0x00100000) is what makes the handle waitable. Handles, not PIDs: a handle can't be reused.
$childHandle = [BopsJob]::OpenProcess(0x0101 -bor 0x00100000, $false, $Child)
if ($childHandle -eq [IntPtr]::Zero) { Note "OpenProcess(child) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"; exit 1 }
if (-not [BopsJob]::AssignProcessToJobObject($job, $childHandle)) {
  Note "assign failed (err $([Runtime.InteropServices.Marshal]::GetLastWin32Error())); the tree stop (taskkill) is what ends this turn's processes"
  exit 1
}
$parentHandle = [BopsJob]::OpenProcess(0x00100000, $false, $Parent)
if ($parentHandle -eq [IntPtr]::Zero) { Note "OpenProcess(parent) failed"; exit 1 }

# Wait on the handles themselves: whichever signals first (Claude Code exits, or Bops is gone) ends
# the sitter, closing the job's handle, which ends whatever of the turn is still running.
[void][BopsJob]::WaitForMultipleObjects(2, @($childHandle, $parentHandle), $false, -1)
