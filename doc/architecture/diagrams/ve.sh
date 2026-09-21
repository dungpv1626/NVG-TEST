#!/usr/bin/env bash
# Dựng lại mọi sơ đồ từ nguồn Mermaid. Nguồn `.mmd` là bản gốc trong Git; `.png` và `.svg`
# là bản sinh ra, nhúng vào SAD.docx.
#
#   npm install @mermaid-js/mermaid-cli --no-save --prefix /tmp/sad
#   PATH=/tmp/sad/node_modules/.bin:$PATH ./doc/architecture/diagrams/ve.sh
set -euo pipefail
cd "$(dirname "$0")"
for f in *.mmd; do
  ten="${f%.mmd}"
  mmdc -i "$f" -o "$ten.png" -c mermaid-config.json -b white -w 1800 -s 2 --quiet
  mmdc -i "$f" -o "$ten.svg" -c mermaid-config.json -b white --quiet
  echo "  $ten.png  $ten.svg"
done
