$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $backendDir
$candidates = @(
    (Join-Path $repoRoot ".venv\Scripts\python.exe"),
    (Join-Path $backendDir "venv\Scripts\python.exe"),
    "python",
    "py"
)

$python = $null
foreach ($candidate in $candidates) {
    try {
        $cmd = Get-Command $candidate -ErrorAction Stop
        & $cmd.Source -c "import sys; print(sys.version)" *> $null
        if ($LASTEXITCODE -eq 0) {
            $python = $cmd.Source
            break
        }
    } catch {
        continue
    }
}

if (-not $python) {
    Write-Error "Python was not found. Install Python 3.9+ or recreate backend\venv."
    exit 1
}

Set-Location $backendDir
Write-Host "Using Python: $python"
Write-Host "Starting backend at http://127.0.0.1:8000"
& $python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
