' Solo-CRM 자동 동기화를 창 없이 시작 (Windows 시작프로그램에서 실행됨)
' 기록: sync\out\sync.log   /   끄기: npm run sync:stop
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = repo
sh.Run "cmd /c node sync\run.ts --watch >> sync\out\sync-console.log 2>&1", 0, False
