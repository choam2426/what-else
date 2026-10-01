# Starts one DeepSWE baseline batch (bench/deepswe-batch.sh) as a detached process, so a batch that
# runs longer than the calling shell's time limit keeps going. Output goes to
# <bench-dir>/jobs/<job>-<from>-<to>.log (stderr to .err); the batch is done when the process exits.
#
# Usage: pwsh bench/deepswe-batch-detached.ps1 <bench-dir> <from> <to> [-List hard-set.txt] [-Job name]
param([string]$Bench, [int]$From, [int]$To, [string]$List = "order-seed0.txt", [string]$Job = "baseline-sonnet55")
$env:TASKS_FILE = $List
$env:JOB = $Job
$script = (Join-Path $PSScriptRoot "deepswe-batch.sh") -replace '\\', '/'
$log = Join-Path $Bench "jobs/$Job-$From-$To.log"
$bash = "C:\Program Files\Git\bin\bash.exe"
# Paths here contain no spaces, so each argument survives Start-Process joining them with spaces.
$p = Start-Process -FilePath $bash -ArgumentList @($script, ($Bench -replace '\\', '/'), $From, $To) `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden -PassThru
"started batch $From-$To (pid $($p.Id)), log $log"
