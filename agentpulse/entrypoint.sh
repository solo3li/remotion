#!/bin/sh
set -e

cleanup() {
    echo "Stopping background services..."
    kill -TERM "$UVICORN_PID" 2>/dev/null || true
    nginx -s quit 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM

echo "Starting AgentPulse FastAPI backend on 127.0.0.1:8787..."
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8787 &
UVICORN_PID=$!

echo "Waiting for FastAPI backend to be ready..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8787/health > /dev/null 2>&1; then
        echo "FastAPI backend is ready!"
        break
    fi
    sleep 1
done

echo "Starting Nginx reverse proxy on port 80..."
nginx -g "daemon off;" &
NGINX_PID=$!

wait "$NGINX_PID"
