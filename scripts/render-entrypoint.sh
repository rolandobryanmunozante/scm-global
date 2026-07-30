#!/bin/sh
set -eu

echo "Applying SCM Global database migrations..."
MIGRATIONS_DIR=/migrations /migrate.sh

echo "Starting SCM Global on port ${PORT:-10000}..."
node dist/src/server.js &
server_pid=$!

stop_processes() {
  kill "${telemetry_pid:-}" "${server_pid}" 2>/dev/null || true
  wait "${telemetry_pid:-}" "${server_pid}" 2>/dev/null || true
}
trap stop_processes INT TERM

(
  attempt=0
  until wget -q -O /dev/null "http://127.0.0.1:${PORT:-10000}/api/health"; do
    attempt=$((attempt + 1))
    if [ "${attempt}" -ge 30 ]; then
      echo "SCM API did not become ready for telemetry." >&2
      exit 1
    fi
    sleep 2
  done

  export SCM_API_URL="http://127.0.0.1:${PORT:-10000}/api"
  exec node /app/scripts/simulate-telemetry.mjs --continuous
) &
telemetry_pid=$!

wait "${server_pid}"
server_status=$?
kill "${telemetry_pid}" 2>/dev/null || true
wait "${telemetry_pid}" 2>/dev/null || true
exit "${server_status}"
