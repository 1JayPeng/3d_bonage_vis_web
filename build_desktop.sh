#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v python >/dev/null 2>&1; then
  echo "python not found" >&2
  exit 1
fi

python -m pip install --upgrade pip
python -m pip install -r requirements-desktop.txt

# onefile executable under dist/
python -m PyInstaller \
  --noconfirm \
  --clean \
  --name dicom-3d \
  --add-data "index.html:." \
  --add-data "app.js:." \
  --add-data "styles.css:." \
  --add-data "bootstrap_cn_v1.js:." \
  desktop_app.py

echo "Build complete: $ROOT_DIR/dist/dicom-3d"
