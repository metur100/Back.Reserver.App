# Publishes the API to .run/api and runs it from there (Development environment, http://localhost:5280).
# Running from a published copy keeps backend/bin unlocked, so you can build and run tests while the API serves
# the web and mobile apps. Requires `docker compose up -d` (SQL Server + Mailpit) to be running.
param(
    [int]$Port = 5280
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root '.run/api'

dotnet publish (Join-Path $root 'backend/BackReserve.Api/BackReserve.Api.csproj') -c Debug -o $out --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = "http://localhost:$Port"
Push-Location $out
try { dotnet ./BackReserve.Api.dll }
finally { Pop-Location }
