#!/usr/bin/env bash
# start.sh — better-ccflare 서버 시작 스크립트

# 스크립트가 위치한 디렉토리의 부모(프로젝트 루트)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/bin/.server.pid"
LOG_FILE="${LOG_FILE:-$PROJECT_DIR/bin/server.log}"
PORT="${PORT:-8080}"

# bun 경로 탐색 (PATH에 없는 경우 대비)
if ! command -v bun &>/dev/null; then
  for candidate in \
    "$HOME/.bun/bin/bun" \
    "/usr/local/bin/bun" \
    "/opt/homebrew/bin/bun"; do
    if [[ -x "$candidate" ]]; then
      export PATH="$(dirname "$candidate"):$PATH"
      break
    fi
  done
fi

if ! command -v bun &>/dev/null; then
  echo "ERROR: bun을 찾을 수 없습니다. PATH를 확인해주세요." >&2
  exit 1
fi

# 이미 실행 중인지 확인
if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "already running (PID $PID). Use bin/stop.sh to stop it first."
    exit 1
  else
    echo "Stale PID file found. Removing..."
    rm -f "$PID_FILE"
  fi
fi

cd "$PROJECT_DIR"

echo "Starting better-ccflare on port $PORT..."
echo "Log: $LOG_FILE"

# 백그라운드로 서버 실행
PORT="$PORT" nohup bun apps/server/src/server.ts --port "$PORT" \
  >> "$LOG_FILE" 2>&1 &

SERVER_PID=$!

# PID 저장
echo "$SERVER_PID" > "$PID_FILE"

# 프로세스가 즉시 죽지 않는지 잠깐 확인
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "ERROR: 서버 시작에 실패했습니다. 로그를 확인하세요: $LOG_FILE" >&2
  tail -20 "$LOG_FILE" >&2
  exit 1
fi

echo "Started (PID $SERVER_PID)"
echo "Dashboard: http://localhost:$PORT"
