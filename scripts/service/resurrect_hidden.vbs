' PHASE-49 A-5 — windowless pm2-resurrect launcher for the ForgeAPI AtLogOn task.
' The AtLogOn task previously ran `node <pm2> resurrect` directly, which opened a
' visible console window at logon; closing that window killed the resurrect before
' the pm2 daemon detached (0xC000013A). wscript + Run window-style 0 launches it
' with NO window at all, removing the console-close kill-vector.
'
' Args: 0 = full path to node.exe, 1 = full path to the pm2 CLI script.
' bWaitOnReturn = False: do not block the logon task on the resurrect.
Option Explicit
Dim sh, cmd
If WScript.Arguments.Count < 2 Then
  WScript.Quit 2
End If
Set sh = CreateObject("WScript.Shell")
cmd = """" & WScript.Arguments(0) & """ """ & WScript.Arguments(1) & """ resurrect"
sh.Run cmd, 0, False
WScript.Quit 0
