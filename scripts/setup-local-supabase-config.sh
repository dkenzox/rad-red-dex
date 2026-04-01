#!/bin/zsh

set -eu

ROOT_DIR="${0:A:h:h}"
OUTPUT_FILE="${ROOT_DIR}/src/supabaseConfig.local.js"
EXAMPLE_FILE="${ROOT_DIR}/src/supabaseConfig.local.example.js"

SUPABASE_URL_VALUE="${1:-${RRDEX_SUPABASE_URL:-${SUPABASE_URL:-}}}"
SUPABASE_ANON_KEY_VALUE="${2:-${RRDEX_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}}"

if [[ -z "${SUPABASE_URL_VALUE}" || -z "${SUPABASE_ANON_KEY_VALUE}" ]] && command -v supabase >/dev/null 2>&1; then
	STATUS_OUTPUT="$(supabase status -o env 2>/dev/null || true)"
	if [[ -z "${SUPABASE_URL_VALUE}" ]]; then
		SUPABASE_URL_VALUE="$(printf "%s\n" "${STATUS_OUTPUT}" | awk -F= '/^(API_URL|SUPABASE_URL)=/ {print $2; exit}')"
	fi
	if [[ -z "${SUPABASE_ANON_KEY_VALUE}" ]]; then
		SUPABASE_ANON_KEY_VALUE="$(printf "%s\n" "${STATUS_OUTPUT}" | awk -F= '/^(ANON_KEY|SUPABASE_ANON_KEY)=/ {print $2; exit}')"
	fi
fi

if [[ -z "${SUPABASE_URL_VALUE}" || -z "${SUPABASE_ANON_KEY_VALUE}" ]]; then
	echo "Missing Supabase URL or anon key."
	echo "Usage:"
	echo "  scripts/setup-local-supabase-config.sh <supabase-url> <anon-key>"
	echo
	echo "Or export one of these pairs before running:"
	echo "  RRDEX_SUPABASE_URL / RRDEX_SUPABASE_ANON_KEY"
	echo "  SUPABASE_URL / SUPABASE_ANON_KEY"
	echo
	echo "If you use the Supabase CLI, this script will also try 'supabase status -o env'."
	echo "Reference example: ${EXAMPLE_FILE}"
	exit 1
fi

cat > "${OUTPUT_FILE}" <<EOF
window.RRDEX_SUPABASE_CONFIG_LOCAL = {
	url: "${SUPABASE_URL_VALUE}",
	anonKey: "${SUPABASE_ANON_KEY_VALUE}",
	sharedTeamRpc: "get_shared_team",
	saveImportFunction: "import-save",
};
EOF

echo "Wrote ${OUTPUT_FILE}"
