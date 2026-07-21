$a = New-ScheduledTaskAction -Execute 'C:\Users\sakur\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe' -Argument 'watcher.py' -WorkingDirectory 'Z:\全社共有\新_社内共有フォルダ\03_個人ファイル\櫻井\検索順位トラッカーシステム\scraper'
$t = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 2) -Once -At '00:00'
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'AnnekorWatcher' -Action $a -Trigger $t -Settings $s -RunLevel Limited -Force
