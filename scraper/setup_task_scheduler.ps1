#Requires -RunAsAdministrator

$PythonW  = 'C:\Users\sakur\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe'
$Launcher = 'C:\rank_tracker_run.py'

$a = New-ScheduledTaskAction -Execute $PythonW -Argument $Launcher
$t = New-ScheduledTaskTrigger -Daily -At '10:00'
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName 'AnnekorRankTracker' -Action $a -Trigger $t -Settings $s -RunLevel Limited -Force

Write-Host 'Done: AnnekorRankTracker'