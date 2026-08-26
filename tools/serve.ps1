#Requires -Version 5.1
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "Ore Factory  http://127.0.0.1:8877/"
python -m http.server 8877 --bind 127.0.0.1
