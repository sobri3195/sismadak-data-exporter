#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3 belum tersedia. Pasang Python 3.10 atau lebih baru, lalu jalankan ulang.'
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
printf '\nMasukkan URL SISMADAK di langkah berikutnya; login dilakukan sendiri di browser.\n'
.venv/bin/python collect.py --resume
