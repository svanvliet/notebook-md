#!/usr/bin/env bash
#
# desktop.sh — Start Notebook.md desktop development
#
# Usage:
#   ./desktop.sh         Start Docker + API + Web, then launch Tauri desktop app
#   ./desktop.sh stop    Stop Docker + API + Web started by this script
#   ./desktop.sh status  Show service status
#   ./desktop.sh logs    Tail API/Web logs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

LOG_DIR="$SCRIPT_DIR/.desktop-dev-logs"
API_PID_FILE="$LOG_DIR/api.pid"
WEB_PID_FILE="$LOG_DIR/web.pid"

print_header() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  🖥️  Notebook.md — Desktop Development${NC}"
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

is_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

wait_for_service() {
  local name="$1" url="$2" max_wait="${3:-30}"
  local elapsed=0
  printf "  Waiting for %-12s " "$name..."
  while ! curl -sf "$url" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [[ "$elapsed" -ge "$max_wait" ]]; then
      echo -e "${RED}TIMEOUT${NC}"
      return 1
    fi
  done
  echo -e "${GREEN}ready${NC}"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${RED}Required command not found: ${cmd}${NC}"
    exit 1
  fi
}

do_stop() {
  echo -e "${YELLOW}Stopping desktop dev services...${NC}"

  if is_running "$WEB_PID_FILE"; then
    local pid
    pid="$(cat "$WEB_PID_FILE")"
    echo "  Stopping web dev server (PID $pid)"
    kill "$pid" 2>/dev/null || true
    rm -f "$WEB_PID_FILE"
  fi

  if is_running "$API_PID_FILE"; then
    local pid
    pid="$(cat "$API_PID_FILE")"
    echo "  Stopping API server (PID $pid)"
    kill "$pid" 2>/dev/null || true
    rm -f "$API_PID_FILE"
  fi

  echo "  Stopping Docker services..."
  docker compose down 2>/dev/null || true

  echo -e "${GREEN}Desktop dev services stopped.${NC}"
}

do_status() {
  echo ""
  echo -e "${BOLD}Desktop Dev Status:${NC}"

  for svc in db cache mailpit; do
    local state
    state="$(docker compose ps --format '{{.State}}' "$svc" 2>/dev/null || echo "stopped")"
    if [[ "$state" == "running" ]]; then
      echo -e "  ${GREEN}●${NC} $svc ($state)"
    else
      echo -e "  ${RED}●${NC} $svc ($state)"
    fi
  done

  if is_running "$API_PID_FILE"; then
    echo -e "  ${GREEN}●${NC} api (PID $(cat "$API_PID_FILE"))"
  else
    echo -e "  ${RED}●${NC} api (stopped)"
  fi

  if is_running "$WEB_PID_FILE"; then
    echo -e "  ${GREEN}●${NC} web (PID $(cat "$WEB_PID_FILE"))"
  else
    echo -e "  ${RED}●${NC} web (stopped)"
  fi

  echo ""
  echo "  URLs:"
  echo "    Web       http://localhost:5173"
  echo "    API       http://localhost:3001"
  echo "    Health    http://localhost:3001/api/health"
  echo "    Mailpit   http://localhost:8025"
  echo ""
}

do_logs() {
  mkdir -p "$LOG_DIR"
  touch "$LOG_DIR/api.log" "$LOG_DIR/web.log"
  echo -e "${BOLD}Tailing desktop dev logs (Ctrl+C to stop)...${NC}"
  tail -f "$LOG_DIR/api.log" "$LOG_DIR/web.log"
}

do_start() {
  print_header

  require_cmd npm
  require_cmd curl
  require_cmd docker

  mkdir -p "$LOG_DIR"

  if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
    echo -e "${RED}Dependencies not installed. Run 'npm install' first.${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Starting Docker services...${NC}"
  docker compose up -d db cache mailpit >/dev/null

  if ! is_running "$API_PID_FILE"; then
    echo -e "${YELLOW}Starting API dev server...${NC}"
    npm run dev:api >"$LOG_DIR/api.log" 2>&1 &
    echo $! >"$API_PID_FILE"
  else
    echo -e "${GREEN}API dev server already running.${NC}"
  fi

  if ! is_running "$WEB_PID_FILE"; then
    echo -e "${YELLOW}Starting web dev server...${NC}"
    npm run dev:web >"$LOG_DIR/web.log" 2>&1 &
    echo $! >"$WEB_PID_FILE"
  else
    echo -e "${GREEN}Web dev server already running.${NC}"
  fi

  wait_for_service "API" "http://localhost:3001/api/health" 45
  wait_for_service "Web" "http://localhost:5173" 45

  echo ""
  echo -e "${GREEN}Desktop prerequisites are ready.${NC}"
  echo "  API log: $LOG_DIR/api.log"
  echo "  Web log: $LOG_DIR/web.log"
  echo ""
  echo -e "${YELLOW}Launching Tauri desktop app...${NC}"
  echo "  Close the Tauri window or press Ctrl+C here when you're done."
  echo ""

  npm run dev:desktop
}

case "${1:-start}" in
  start)
    do_start
    ;;
  stop)
    do_stop
    ;;
  status)
    do_status
    ;;
  logs)
    do_logs
    ;;
  *)
    echo "Usage: ./desktop.sh [stop|status|logs]"
    exit 1
    ;;
esac
