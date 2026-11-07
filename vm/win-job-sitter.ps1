# Holds a Windows Job Object (kill on close) on one Claude Code run, so nothing it started outlives
# the turn even if Bops itself dies: the sitter owns the job's handle; when Claude Code exits, or the
# Bops process that started the sitter is gone, the sitter ends, the handle closes, and Windows ends
# every process still in the job (children joined it the moment Claude Code spawned them).
# Started by lib/server/pc-task-runner.ts (runClaudeTurn, Windows only) as:
#   powershell -NoProfile -ExecutionPolicy Bypass -File win-job-sitter.ps1 -Child <claudePid> -Parent <bopsPid>
# When this script can't run or can't make the job, nothing changes: stopClaude's taskkill of the
# whole tree still ends a turn's processes the ordinary way.
param([int]$Child, [int]$Parent)
if (-not $Child -or -not $Parent) { exit 1 }
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
try { Add-Type -TypeDefinition $src } catch { exit 1 }

$job = [BopsJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { exit 1 }
$limits = New-Object BopsJob+Extended
$limits.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
$size = [Runtime.InteropServices.Marshal]::SizeOf([type][BopsJob+Extended])
if (-not [BopsJob]::SetInformationJobObject($job, 9, [ref]$limits, $size)) { exit 1 }

# The job on Claude Code itself; everything it spawns joins with it (no breakaway is allowed).
# Assign needs PROCESS_SET_QUOTA and PROCESS_TERMINATE. When it's denied (the CLI already sits in a
# job that won't take a second one), the job can hold nothing: leave, and the ordinary stop (taskkill
# of the whole tree) is what ends the turn's processes, as before.
$process = [BopsJob]::OpenProcess(0x0401, $false, $Child)
if ($process -eq [IntPtr]::Zero) { exit 1 }
if (-not [BopsJob]::AssignProcessToJobObject($job, $process)) { exit 1 }

# Stay while Claude Code runs AND Bops is alive; leaving closes the handle, ending the job.
while ($true) {
  Start-Sleep -Milliseconds 250
  if (-not (Get-Process -Id $Child -ErrorAction SilentlyContinue)) { break }
  if (-not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { break }
}
