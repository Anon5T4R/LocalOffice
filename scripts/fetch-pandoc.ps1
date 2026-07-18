# Baixa o pandoc (Windows x86_64) e instala como sidecar do Tauri em
# src-tauri/binaries/pandoc-x86_64-pc-windows-msvc.exe.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fetch-pandoc.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# VERSÃO FIXA + SHA256 (2026-07-18)
#
# Era `releases/latest` da API do pandoc: cada build embarcava uma versão
# diferente, sem registro e sem verificação. No caso do pandoc isso é pior que
# nos outros — ele é o conversor de DOCX/ODT, e mudança de versão pode mudar o
# RESULTADO da conversão de documentos do usuário sem ninguém notar.
#
# PRA ATUALIZAR: pegar a versão em github.com/jgm/pandoc/releases, baixar os
# dois artefatos, rodar `sha256sum`, trocar as constantes aqui e no
# `fetch-pandoc.sh` — sempre a MESMA versão nos dois.
# ---------------------------------------------------------------------------
$pdVersion = "3.10"
$pdAsset = "pandoc-3.10-windows-x86_64.zip"
$pdSha256 = "bb808d00fd58762299d64582a9b4c3e4b106cd929e62c5f19bcdcb496f1e54ae"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "src-tauri\binaries"
$target = Join-Path $binDir "pandoc-x86_64-pc-windows-msvc.exe"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

if (Test-Path $target) {
    Write-Host "pandoc sidecar já existe em $target"
    exit 0
}

$url = "https://github.com/jgm/pandoc/releases/download/$pdVersion/$pdAsset"
Write-Host "Baixando $url ..."
$zip = Join-Path $env:TEMP $pdAsset
Invoke-WebRequest -Uri $url -OutFile $zip

# Confere ANTES de extrair: binário adulterado não chega a ser descompactado.
$got = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
if ($got -ne $pdSha256) {
    Remove-Item $zip -Force
    throw "SHA256 NAO BATE!`n  esperado: $pdSha256`n  recebido: $got`nDownload corrompido ou adulterado. Nada foi instalado."
}
Write-Host "sha256 conferido: $got"

$ext = Join-Path $env:TEMP "pandoc-extract"
if (Test-Path $ext) { Remove-Item $ext -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $ext -Force
$exe = Get-ChildItem -Path $ext -Recurse -Filter "pandoc.exe" | Select-Object -First 1
if (-not $exe) { throw "pandoc.exe não encontrado dentro do zip ($pdVersion)" }
Copy-Item $exe.FullName $target -Force
Remove-Item $zip -Force
Remove-Item $ext -Recurse -Force

Write-Host "Instalado: $target ($pdVersion)"
