<#
  Samples the memory and CPU of a process tree every IntervalMs.

  The tree is every live descendant of RootPid, found from the parent PID of
  each process (Toolhelp32 snapshot: the same ParentProcessId as
  Win32_Process, without the ~100 ms cost of a WMI query per tick). A child
  only counts if it was created after its parent, so a reused PID never joins
  the tree. The sampler walks downward from the root, so it never measures
  itself.

  CSV columns, one row per process per tick:
    t       unix time in ms
    pid, ppid, name
    ws      working set (WorkingSet64), bytes
    priv    private commit (PrivateUsage = PrivateMemorySize64), bytes
    wsPriv  private working set ("Working Set - Private"), bytes
    cpuMs   kernel + user CPU time so far, ms

  Prints READY once the helper is compiled. Stops when StopFile exists or the
  root process exits.
#>
param(
  [Parameter(Mandatory = $true)][int]$RootPid,
  [Parameter(Mandatory = $true)][string]$OutFile,
  [int]$IntervalMs = 100,
  [string]$StopFile = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class ReqoraTreeSampler
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32W
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_MEMORY_COUNTERS_EX2
    {
        public uint cb;
        public uint PageFaultCount;
        public UIntPtr PeakWorkingSetSize;
        public UIntPtr WorkingSetSize;
        public UIntPtr QuotaPeakPagedPoolUsage;
        public UIntPtr QuotaPagedPoolUsage;
        public UIntPtr QuotaPeakNonPagedPoolUsage;
        public UIntPtr QuotaNonPagedPoolUsage;
        public UIntPtr PagefileUsage;
        public UIntPtr PeakPagefileUsage;
        public UIntPtr PrivateUsage;
        public UIntPtr PrivateWorkingSetSize;
        public ulong SharedCommitUsage;
    }

    const uint TH32CS_SNAPPROCESS = 0x2;
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32W entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32W entry);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool K32GetProcessMemoryInfo(IntPtr process, ref PROCESS_MEMORY_COUNTERS_EX2 counters, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr process, out uint code);

    class Entry
    {
        public uint Pid;
        public uint Ppid;
        public string Name;
    }

    class Sample
    {
        public Entry Entry;
        public long Creation;
        public ulong Ws;
        public ulong Priv;
        public ulong WsPriv;
        public long CpuMs;
    }

    static List<Entry> Snapshot()
    {
        List<Entry> list = new List<Entry>();
        IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == INVALID_HANDLE_VALUE) return list;
        try
        {
            PROCESSENTRY32W entry = new PROCESSENTRY32W();
            entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
            bool more = Process32FirstW(snapshot, ref entry);
            while (more)
            {
                Entry item = new Entry();
                item.Pid = entry.th32ProcessID;
                item.Ppid = entry.th32ParentProcessID;
                item.Name = entry.szExeFile;
                list.Add(item);
                more = Process32NextW(snapshot, ref entry);
            }
        }
        finally
        {
            CloseHandle(snapshot);
        }
        return list;
    }

    static Sample Measure(Entry entry)
    {
        IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, entry.Pid);
        if (handle == IntPtr.Zero) return null;
        try
        {
            PROCESS_MEMORY_COUNTERS_EX2 counters = new PROCESS_MEMORY_COUNTERS_EX2();
            counters.cb = (uint)Marshal.SizeOf(typeof(PROCESS_MEMORY_COUNTERS_EX2));
            if (!K32GetProcessMemoryInfo(handle, ref counters, counters.cb)) return null;
            long creation, exit, kernel, user;
            if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)) return null;
            Sample sample = new Sample();
            sample.Entry = entry;
            sample.Creation = creation;
            sample.Ws = counters.WorkingSetSize.ToUInt64();
            sample.Priv = counters.PrivateUsage.ToUInt64();
            sample.WsPriv = counters.PrivateWorkingSetSize.ToUInt64();
            sample.CpuMs = (kernel + user) / 10000;
            return sample;
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    static bool IsAlive(uint pid)
    {
        IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (handle == IntPtr.Zero) return false;
        try
        {
            uint code;
            return GetExitCodeProcess(handle, out code) && code == 259;
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    /// Breadth-first from the root; a child must not be older than its parent.
    static List<Sample> Tree(uint root)
    {
        List<Entry> all = Snapshot();
        Dictionary<uint, List<Entry>> children = new Dictionary<uint, List<Entry>>();
        Entry rootEntry = null;
        foreach (Entry entry in all)
        {
            if (entry.Pid == root) rootEntry = entry;
            if (entry.Pid == entry.Ppid) continue;
            List<Entry> list;
            if (!children.TryGetValue(entry.Ppid, out list))
            {
                list = new List<Entry>();
                children[entry.Ppid] = list;
            }
            list.Add(entry);
        }
        List<Sample> result = new List<Sample>();
        if (rootEntry == null) return result;
        Sample rootSample = Measure(rootEntry);
        if (rootSample == null) return result;
        Queue<Sample> queue = new Queue<Sample>();
        queue.Enqueue(rootSample);
        while (queue.Count > 0)
        {
            Sample parent = queue.Dequeue();
            result.Add(parent);
            List<Entry> list;
            if (!children.TryGetValue(parent.Entry.Pid, out list)) continue;
            foreach (Entry child in list)
            {
                Sample sample = Measure(child);
                if (sample != null && sample.Creation >= parent.Creation) queue.Enqueue(sample);
            }
        }
        return result;
    }

    public static int Run(int rootPid, string outFile, int intervalMs, string stopFile)
    {
        uint root = (uint)rootPid;
        int ticks = 0;
        using (StreamWriter writer = new StreamWriter(outFile, false, new UTF8Encoding(false)))
        {
            writer.WriteLine("t,pid,ppid,name,ws,priv,wsPriv,cpuMs");
            writer.Flush();
            Stopwatch clock = Stopwatch.StartNew();
            DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            while (true)
            {
                if (!string.IsNullOrEmpty(stopFile) && File.Exists(stopFile)) break;
                if (!IsAlive(root)) break;
                long t = (long)(DateTime.UtcNow - epoch).TotalMilliseconds;
                List<Sample> tree = Tree(root);
                StringBuilder lines = new StringBuilder();
                foreach (Sample sample in tree)
                {
                    lines.Append(t).Append(',')
                        .Append(sample.Entry.Pid).Append(',')
                        .Append(sample.Entry.Ppid).Append(',')
                        .Append(sample.Entry.Name.Replace(",", "_")).Append(',')
                        .Append(sample.Ws).Append(',')
                        .Append(sample.Priv).Append(',')
                        .Append(sample.WsPriv).Append(',')
                        .Append(sample.CpuMs).Append('\n');
                }
                writer.Write(lines.ToString());
                writer.Flush();
                ticks++;
                long wait = (long)ticks * intervalMs - clock.ElapsedMilliseconds;
                if (wait > 0) Thread.Sleep((int)wait);
            }
        }
        return ticks;
    }
}
'@

[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
$ticks = [ReqoraTreeSampler]::Run($RootPid, $OutFile, $IntervalMs, $StopFile)
[Console]::Out.WriteLine("DONE $ticks")
