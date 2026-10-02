#!/bin/bash
set -e

DOMAIN="${DOMAIN:-127.0.0.1}"
BASE_URL="http://${DOMAIN}"

echo "======================================================="
echo "   REMOTION CREATIVE SUITE - END-TO-END HEALTH CHECK   "
echo "======================================================="
echo "Target Base URL: $BASE_URL"
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0

run_check() {
  local name="$1"
  local url="$2"
  local expected_status="$3"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  echo -n "[TEST $TOTAL_TESTS] Checking $name ($url)... "
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$status" = "$expected_status" ]; then
    echo "✅ PASS (HTTP $status)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo "❌ FAIL (Expected $expected_status, got $status)"
    return 1
  fi
}

# 1. Revideo Studio NLE Frontend
run_check "Revideo Studio HTML" "${BASE_URL}/app/" "200"

# 2. DesignCombo
run_check "DesignCombo HTML" "${BASE_URL}/designcombo/" "200"

# 3. Langflow
run_check "Langflow HTML" "${BASE_URL}/langflow/" "200"
run_check "Langflow Health API" "${BASE_URL}/langflow/health" "200"

# 4. ComfyUI
run_check "ComfyUI HTML" "${BASE_URL}/comfyui/" "200"
run_check "ComfyUI Stats API" "${BASE_URL}/comfyui/system_stats" "200"

# 5. Core Platform
run_check "Traefik Router & Core Backend" "${BASE_URL}/" "200"

echo ""
echo "======================================================="
echo "   SUMMARY: $PASSED_TESTS / $TOTAL_TESTS CHECKS PASSED "
echo "======================================================="

if [ "$PASSED_TESTS" -eq "$TOTAL_TESTS" ]; then
  echo "🚀 ALL 4 APPS IN THE SUITE ARE RUNNING AND FULLY HEALTHY!"
  exit 0
else
  echo "⚠️ Some checks failed."
  exit 1
fi
