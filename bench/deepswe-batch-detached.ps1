# Starts one DeepSWE baseline batch (bench/deepswe-batch.sh) as a detached process, so a batch that
# runs longer than the calling shell's time limit keeps going. Output goes to
# <bench-dir>/jobs/batch-<from>-<to>.log (stderr to .err); the batch is done when the process exits.
#
# Usage: pwsh bench/deepswe-batch-detached.ps1 <bench-dir> <from> <to>
param([string]$Bench, [int]$From, [int]$To)
$script = (Join-Path $PSScriptRoot "deepswe-batch.sh") -replace '\\', '/'
$log = Join-Path $Bench "jobs/batch-$From-$To.log"
$bash = "C:\Program Files\Git\bin\bash.exe"
# Paths here contain no spaces, so each argument survives Start-Process joining them with spaces.
$p = Start-Process -FilePath $bash -ArgumentList @($script, ($Bench -replace '\\', '/'), $From, $To) `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden -PassThru
"started batch $From-$To (pid $($p.Id)), log $log"
