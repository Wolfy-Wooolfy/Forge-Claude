' PHASE-49 A-5 — windowless pm2 launcher for the ForgeAPI AtLogOn task.
' The AtLogOn task previously ran `node <pm2> resurrect` directly, which opened a
' visible console window at logon; closing that window killed the launch before
' the pm2 daemon detached (0xC000013A). wscript + Run window-style 0 launches it
' with NO window at all, removing the console-close kill-vector.
'
' PHASE-56 W-0 — BOOT AUTO-START REPAIR (PHASE-55 backlog 5 / R-18(c), MEASURED).
' `pm2 resurrect` restores the SAVED pm2 process list, but INSTALL_FORGE.bat:76-80
' deliberately clears it (`pm2 delete forge` + `pm2 save --force`) so nothing can
' race Task Scheduler at boot. Measured on the owner's machine 2026-08-04:
' %USERPROFILE%\.pm2\dump.pm2 == `[]` (2 bytes) WHILE a live forge process was
' running — i.e. a logon resurrect had nothing to restore and Forge did NOT
' auto-start. The repair: when the task passes an ecosystem config path, launch
' `pm2 start "<ecosystem>" --update-env` instead, which depends on NO saved dump.
' The saved list stays empty, so the boot race INSTALL_FORGE.bat guards against
' stays closed and its "sole boot mechanism" comment becomes true again.
'
' Args: 0 = full path to node.exe
'       1 = full path to the pm2 CLI script
'       2 = OPTIONAL full path to ecosystem.config.js
'           present  -> `pm2 start "<ecosystem>" --update-env`  (PHASE-56 W-0)
'           absent   -> `pm2 resurrect`                          (pre-PHASE-56 behaviour,
'                                                                 byte-identical command)
' bWaitOnReturn = False: do not block the logon task on the launch.
'
' Coexistence with RUN_FORGE.bat (PHASE-55 W-4): both resolve inside the SAME pm2
' daemon. Task-then-RUN_FORGE — RUN_FORGE's tolerant `pm2 delete forge` removes the
' task-started managed entry cleanly before its port sweep. RUN_FORGE-then-task —
' `pm2 start` against an already-online app is a no-op warn, so the running process
' is not restarted. Neither order fights the other.
Option Explicit
Dim sh, cmd
If WScript.Arguments.Count < 2 Then
  WScript.Quit 2
End If
Set sh = CreateObject("WScript.Shell")
cmd = """" & WScript.Arguments(0) & """ """ & WScript.Arguments(1) & """"
If WScript.Arguments.Count >= 3 Then
  cmd = cmd & " start """ & WScript.Arguments(2) & """ --update-env"
Else
  cmd = cmd & " resurrect"
End If
sh.Run cmd, 0, False
WScript.Quit 0
