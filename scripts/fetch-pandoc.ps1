# Downloads the latest pandoc Windows x86_64 binary and installs it as the
# Tauri sidecar at src-tauri/binaries/pandoc-x86_64-pc-windows-msvc.exe.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File scripts/fetch-pandoc.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "src-tauri\binaries"
$target = Join-Path $binDir "pandoc-x86_64-pc-windows-msvc.exe"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

if (Test-Path $target) {
    Write-Host "pandoc sidecar já existe em $target"
    exit 0
}

Write-Host "Consultando release mais recente do pandoc..."
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/jgm/pandoc/releases/latest" -Headers @{ "User-Agent" = "writer-app" }
$asset = $rel.assets | Where-Object { $_.name -match "windows-x86_64\.zip$" } | Select-Object -First 1
Write-Host "Baixando $($asset.name) ($([math]::Round($asset.size/1MB,1)) MB)..."

$zip = Join-Path $env:TEMP $asset.name
$ext = Join-Path $env:TEMP "pandoc-extract"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $ext -Force
$exe = Get-ChildItem -Path $ext -Recurse -Filter "pandoc.exe" | Select-Object -First 1
Copy-Item $exe.FullName $target -Force
Remove-Item $zip -Force
Remove-Item $ext -Recurse -Force

Write-Host "Instalado: $target ($([math]::Round((Get-Item $target).Length/1MB,1)) MB)"
