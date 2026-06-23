#!/usr/bin/env bash
# Baixa o pandoc (Linux amd64) e instala como sidecar do Tauri.
# Uso: bash scripts/fetch-pandoc.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"
TARGET="$BIN_DIR/pandoc-x86_64-unknown-linux-gnu"
mkdir -p "$BIN_DIR"

if [ -f "$TARGET" ]; then
  echo "pandoc sidecar já existe em $TARGET"
  exit 0
fi

echo "Buscando release mais recente do pandoc..."
URL=$(curl -fsSL https://api.github.com/repos/jgm/pandoc/releases/latest \
  | grep browser_download_url | grep 'linux-amd64.tar.gz' | head -1 | cut -d'"' -f4)
[ -z "$URL" ] && { echo "asset linux-amd64 não encontrado"; exit 1; }

echo "Baixando $URL"
curl -fsSL "$URL" -o /tmp/pandoc.tar.gz
mkdir -p /tmp/pandoc-extract
tar xzf /tmp/pandoc.tar.gz -C /tmp/pandoc-extract
PANDOC=$(find /tmp/pandoc-extract -type f -name pandoc -path '*bin*' | head -1)
cp "$PANDOC" "$TARGET"
chmod +x "$TARGET"
rm -rf /tmp/pandoc.tar.gz /tmp/pandoc-extract
echo "Instalado: $TARGET"
