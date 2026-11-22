# Solo-CRM: open the Windows Explorer-style "Select Folder" dialog and print the chosen path.
# Output: "OK:<base64 UTF-8 path>" or "CANCEL" (base64 keeps non-ASCII paths intact).
# Arguments are base64 UTF-8 too, for the same reason.
param([string]$StartB64 = "", [string]$TitleB64 = "")

$ErrorActionPreference = "Stop"
function FromB64([string]$s) { if ($s) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s)) } else { "" } }
$start = FromB64 $StartB64
$title = FromB64 $TitleB64

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class SoloFolderPicker {
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    class FileOpenDialogRCW { }

    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName();
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel();
        void GetResult(out IShellItem ppsi);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes();
        void Compare();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

    const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
    const uint SIGDN_FILESYSPATH = 0x80058000;

    public static string Pick(IntPtr owner, string start, string title, string ok) {
        IFileDialog dlg = (IFileDialog)new FileOpenDialogRCW();
        uint opts; dlg.GetOptions(out opts);
        dlg.SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        if (!string.IsNullOrEmpty(title)) dlg.SetTitle(title);
        if (!string.IsNullOrEmpty(ok)) dlg.SetOkButtonLabel(ok);
        if (!string.IsNullOrEmpty(start) && System.IO.Directory.Exists(start)) {
            try {
                Guid iid = typeof(IShellItem).GUID; IShellItem item;
                SHCreateItemFromParsingName(start, IntPtr.Zero, ref iid, out item);
                dlg.SetFolder(item);
            } catch { }
        }
        int hr = dlg.Show(owner);
        if (hr == unchecked((int)0x800704C7)) return null; // ERROR_CANCELLED: user closed the dialog
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);
        IShellItem result; dlg.GetResult(out result);
        IntPtr p; result.GetDisplayName(SIGDN_FILESYSPATH, out p);
        string path = Marshal.PtrToStringUni(p); Marshal.FreeCoTaskMem(p);
        return path;
    }
}
"@

# Invisible topmost owner window so the dialog comes to the front even though sync runs hidden
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0
$owner.StartPosition = "CenterScreen"; $owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show(); $owner.Activate()
try {
    $okLabel = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("7J20IO2PtOuNlCDshKDtg50="))  # "이 폴더 선택"
    $path = [SoloFolderPicker]::Pick($owner.Handle, $start, $title, $okLabel)
} finally { $owner.Close() }

if ($path) { "OK:" + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($path)) } else { "CANCEL" }
