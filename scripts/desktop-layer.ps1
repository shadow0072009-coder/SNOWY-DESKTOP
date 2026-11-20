# Qor oynasini Windows ish stoli qatlamiga (WorkerW) joylashtiradi.
# Natija: qor oynalar ORQASIDA, ish stoli fonida qoladi — o'yin paytida GPU yuki nolga tushadi.
# Foydalanish: powershell -NoProfile -ExecutionPolicy Bypass -File desktop-layer.ps1 -Hwnd 12345 -Width 1920 -Height 1080
param(
  [Parameter(Mandatory = $true)][long]$Hwnd,
  [int]$X = 0,
  [int]$Y = 0,
  [int]$Width = 0,
  [int]$Height = 0
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class QorDesktop {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetParent(IntPtr child, IntPtr parent);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindow(string cls, string win);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    public static string Attach(long raw, int x, int y, int w, int h) {
        IntPtr hwnd = new IntPtr(raw);
        if (!IsWindow(hwnd)) return "FAIL window";

        IntPtr progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero) {
            IntPtr tmp;
            // 0x052C — Explorer'ga WorkerW qatlamini yaratishni buyuradi.
            SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out tmp);
        }

        // Ikonalarni saqlovchi WorkerW ni topamiz; fon qatlami — undan keyingi WorkerW.
        IntPtr iconHost = IntPtr.Zero;
        IntPtr cur = IntPtr.Zero;
        while (true) {
            cur = FindWindowEx(IntPtr.Zero, cur, "WorkerW", null);
            if (cur == IntPtr.Zero) break;
            if (FindWindowEx(cur, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
                iconHost = cur;
                break;
            }
        }

        IntPtr target = IntPtr.Zero;
        if (iconHost != IntPtr.Zero) target = FindWindowEx(IntPtr.Zero, iconHost, "WorkerW", null);
        if (target == IntPtr.Zero) target = iconHost;
        if (target == IntPtr.Zero) target = progman;
        if (target == IntPtr.Zero) return "FAIL host";

        SetParent(hwnd, target);

        // SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOZORDER
        SetWindowPos(hwnd, IntPtr.Zero, x, y, w, h, 0x0010 | 0x0040 | 0x0004);
        return "OK " + target.ToInt64();
    }
}
'@

[QorDesktop]::Attach($Hwnd, $X, $Y, $Width, $Height)
