#!/usr/bin/env bash
# Prüfbericht für den echten Anbieterbetrieb (Scrydex-Testfälle + EZB). Kein Deployment.
#
#   SCRYDEX_API_KEY=… SCRYDEX_TEAM_ID=… bash wertscan/scripts/provider-report.sh
#   REPORT_FILE=/pfad/bericht.json …   (zusätzlich in Datei schreiben – nicht ins Repository)
#   bash wertscan/scripts/provider-report.sh --mock   (nur Formatprobe, keine echten Daten)
#
# Testkarten: wertscan/scripts/provider-report.cases.json
# Zugangsdaten werden nie ausgegeben (Ausgabe wird zusätzlich geschwärzt).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx -y -p typescript@5 tsc -p tsconfig.test.json --outDir "$OUT" >/dev/null
WERTSCAN_DIR="$(pwd)" node "$OUT/scripts/providerReport.js" "$@"
