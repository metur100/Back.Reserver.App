# Deploys the BackReserve API to MonsterASP (IIS shared hosting) via Web Deploy.
#
# Secrets are NOT stored in this script or the repository. They are read from a local, git-ignored file
# (default: .run/monsterasp.env, KEY=VALUE per line). Required keys:
#   MSDEPLOY_SITE, MSDEPLOY_HOST, MSDEPLOY_USER, MSDEPLOY_PASSWORD, PUBLIC_API_URL
# Every other key (e.g. ConnectionStrings__Default, Jwt__SigningKey, App__WebBaseUrl, Cors__AllowedOrigins__0, ...)
# is written as an environment variable into the deployed web.config. See docs/DEPLOYMENT.md.
#
# The app is published self-contained (win-x86 by default, matching the host's 32-bit application pool), so it does not
# depend on the .NET runtime version installed on the host. Migrations run on application start (Database__MigrateOnStartup=true) because the hosted SQL Server is only
# reachable from inside the provider's network.
param(
    [string]$SettingsFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.run/monsterasp.env'),
    [switch]$SkipBuild,
    # MonsterASP application pools run 32-bit by default; a win-x64 build fails there with HTTP 500.32.
    [string]$Runtime = 'win-x86',
    # Writes ASP.NET Core stdout to logs\stdout_*.log on the server (for diagnosing startup failures; turn off again).
    [switch]$StdoutLog
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $SettingsFile)) { throw "Settings file not found: $SettingsFile" }
$settings = [ordered]@{}
foreach ($line in [IO.File]::ReadAllLines($SettingsFile, $utf8)) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $i = $line.IndexOf('=')
    $settings[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
}
foreach ($k in 'MSDEPLOY_SITE', 'MSDEPLOY_HOST', 'MSDEPLOY_USER', 'MSDEPLOY_PASSWORD', 'PUBLIC_API_URL') {
    if (-not $settings.Contains($k)) { throw "Missing $k in $SettingsFile" }
}

$out = Join-Path $root '.run/deploy/site'
if (-not $SkipBuild) {
    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    Write-Host "Publishing (Release, $Runtime, self-contained)..."
    dotnet publish (Join-Path $root 'backend/BackReserve.Api/BackReserve.Api.csproj') -c Release -r $Runtime --self-contained true -o $out --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
}

# web.config with application settings as environment variables (XML-escaped).
$envXml = foreach ($k in $settings.Keys) {
    if ($k -like 'MSDEPLOY_*' -or $k -eq 'PUBLIC_API_URL') { continue }
    '          <environmentVariable name="{0}" value="{1}" />' -f [Security.SecurityElement]::Escape($k), [Security.SecurityElement]::Escape($settings[$k])
}
$webConfig = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath=".\BackReserve.Api.exe" arguments="" stdoutLogEnabled="$(if ($StdoutLog) { 'true' } else { 'false' })" stdoutLogFile=".\logs\stdout" hostingModel="inprocess">
        <environmentVariables>
          <environmentVariable name="ASPNETCORE_ENVIRONMENT" value="Production" />
$($envXml -join "`r`n")
        </environmentVariables>
      </aspNetCore>
      <!-- No <security>/<requestFiltering> section: it is locked on shared hosting and would cause HTTP 500.19.
           The upload size limit is enforced by the application (RequestSizeLimit + Kestrel/IIS server options). -->
    </system.webServer>
  </location>
</configuration>
"@
[IO.File]::WriteAllText((Join-Path $out 'web.config'), $webConfig, $utf8)

$msdeploy = 'C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe'
if (-not (Test-Path $msdeploy)) { throw 'Web Deploy (msdeploy.exe) is not installed.' }
$site = $settings['MSDEPLOY_SITE']
$dest = "contentPath='$site',computerName='https://$($settings['MSDEPLOY_HOST']):8172/msdeploy.axd?site=$site',userName='$($settings['MSDEPLOY_USER'])',password='$($settings['MSDEPLOY_PASSWORD'])',authType='Basic'"

Write-Host "Deploying to $($settings['MSDEPLOY_HOST'])..."
# AppOffline stops the app during the sync (no locked DLLs); uploaded images and logs on the server are preserved.
& $msdeploy -verb:sync "-source:contentPath='$out'" "-dest:$dest" -allowUntrusted -enableRule:AppOffline `
    "-skip:objectName=dirPath,absolutePath=App_Data" "-skip:objectName=dirPath,absolutePath=logs" -retryAttempts:3
if ($LASTEXITCODE -ne 0) { throw "msdeploy failed with exit code $LASTEXITCODE" }

$api = $settings['PUBLIC_API_URL'].TrimEnd('/')
Write-Host "Waiting for $api/health/ready (first start applies migrations)..."
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest "$api/health/ready" -UseBasicParsing -TimeoutSec 30
        if ($r.StatusCode -eq 200) { Write-Host "Healthy: $($r.Content)"; exit 0 }
    } catch { Start-Sleep -Seconds 5 }
}
throw 'The API did not become healthy. Temporarily set stdoutLogEnabled="true" in web.config to inspect startup errors.'
