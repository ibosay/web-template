#!/usr/bin/env bash
# Kompiliert wertscan/ (TypeScript strict) in ein temporäres Verzeichnis und führt die Tests aus.
# Kein Netzwerk, kein Scrydex-Key nötig. Aufruf: bash wertscan/run-tests.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx -y -p typescript@5 tsc -p tsconfig.test.json --outDir "$OUT"
WERTSCAN_DIR="$(pwd)" node --test "$OUT"/tests/*.test.js
