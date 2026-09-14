$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
python -m venv .venv
if ($LASTEXITCODE) { throw 'Python 3.11 or 3.12 is required.' }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE) { throw 'Dependency installation failed.' }
& .\.venv\Scripts\python.exe -m flytris fetch
if ($LASTEXITCODE) { throw 'Data download failed.' }
Write-Host 'Ready. Run: .\.venv\Scripts\python.exe -m flytris experiment --out runs/local'
