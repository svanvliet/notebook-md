#!/usr/bin/env bash
#
# dev.sh — Start all Notebook.md services for local development
#
# Usage:
#   ./dev.sh          Start everything (Docker + API + Web)
#   ./dev.sh stop     Stop everything
#   ./dev.sh logs     Tail all logs
#   ./dev.sh status   Check service health
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure Docker CLI is on PATH (macOS Docker Desktop)
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

LOG_DIR="$SCRIPT_DIR/.dev-logs"
API_PID_FILE="$LOG_DIR/api.pid"
WEB_PID_FILE="$LOG_DIR/web.pid"
ADMIN_PID_FILE="$LOG_DIR/admin.pid"
SMEE_PID_FILE="$LOG_DIR/smee.pid"

# ─── Helpers ──────────────────────────────────────────────────────────────────

print_header() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  📓 Notebook.md — Local Development${NC}"
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_urls() {
  echo ""
  echo -e "${BOLD}  URLs:${NC}"
  echo -e "    ${CYAN}Web App${NC}        http://localhost:5173"
  echo -e "    ${CYAN}Admin Console${NC}  http://localhost:5174"
  echo -e "    ${CYAN}API Server${NC}     http://localhost:3001"
  echo -e "    ${CYAN}API Health${NC}     http://localhost:3001/api/health"
  echo -e "    ${CYAN}Mailpit UI${NC}     http://localhost:8025"
  echo -e "    ${CYAN}PostgreSQL${NC}     localhost:5432  (notebookmd / localdev)"
  echo -e "    ${CYAN}Redis${NC}          localhost:6379"
  echo ""
  echo -e "${BOLD}  Dev accounts:${NC}"
  echo -e "    ${YELLOW}Admin${NC}          admin@localhost / admin123"
  echo -e "    ${YELLOW}Mock OAuth${NC}     http://localhost:3001/auth/oauth/mock"
  echo ""
  echo -e "${BOLD}  Logs:${NC}"
  echo -e "    ${GREEN}API${NC}            $LOG_DIR/api.log"
  echo -e "    ${GREEN}Web${NC}            $LOG_DIR/web.log"
  echo -e "    ${GREEN}Admin${NC}          $LOG_DIR/admin.log"
  echo -e "    ${GREEN}Smee${NC}           $LOG_DIR/smee.log"
  echo -e "    ${GREEN}Docker${NC}         docker compose logs -f"
  echo ""
}

wait_for_service() {
  local name="$1" url="$2" max_wait="${3:-30}"
  local elapsed=0
  printf "  Waiting for %-14s " "$name..."
  while ! curl -sf "$url" > /dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ $elapsed -ge $max_wait ]; then
      echo -e "${RED}TIMEOUT${NC}"
      return 1
    fi
  done
  echo -e "${GREEN}ready${NC}"
}

is_running() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

# ─── Stop ─────────────────────────────────────────────────────────────────────

do_stop() {
  echo -e "${YELLOW}Stopping services...${NC}"

  # Stop web dev server
  if is_running "$WEB_PID_FILE"; then
    local pid; pid=$(cat "$WEB_PID_FILE")
    echo "  Stopping web dev server (PID $pid)"
    kill "$pid" 2>/dev/null || true
    rm -f "$WEB_PID_FILE"
  fi

  # Stop admin dev server
  if is_running "$ADMIN_PID_FILE"; then
    local pid; pid=$(cat "$ADMIN_PID_FILE")
    echo "  Stopping admin dev server (PID $pid)"
    kill "$pid" 2>/dev/null || true
    rm -f "$ADMIN_PID_FILE"
  fi

  # Stop smee proxy
  if is_running "$SMEE_PID_FILE"; then
    local pid; pid=$(cat "$SMEE_PID_FILE")
    echo "  Stopping webhook proxy (PID $pid)"
    kill "$pid" 2>/dev/null || true
    rm -f "$SMEE_PID_FILE"
  fi

  # Stop API server
  if is_running "$API_PID_FILE"; then
    local pid; pid=$(cat "$API_PID_FILE")
    echo "  Stopping API server (PID $pid)"
    kill "$pid" 2>/dev/null || true
    rm -f "$API_PID_FILE"
  fi

  # Stop Docker services
  echo "  Stopping Docker services..."
  docker compose down 2>/dev/null || true

  echo -e "${GREEN}All services stopped.${NC}"
}

# ─── Status ───────────────────────────────────────────────────────────────────

do_status() {
  echo ""
  echo -e "${BOLD}Service Status:${NC}"

  # Docker services
  for svc in db cache mailpit; do
    local state
    state=$(docker compose ps --format '{{.State}}' "$svc" 2>/dev/null || echo "stopped")
    if [ "$state" = "running" ]; then
      echo -e "  ${GREEN}●${NC} $svc ($state)"
    else
      echo -e "  ${RED}●${NC} $svc ($state)"
    fi
  done

  # API
  if is_running "$API_PID_FILE"; then
    local health
    health=$(curl -sf http://localhost:3001/api/health 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "unreachable")
    echo -e "  ${GREEN}●${NC} api (PID $(cat "$API_PID_FILE"), health: $health)"
  else
    echo -e "  ${RED}●${NC} api (stopped)"
  fi

  # Web
  if is_running "$WEB_PID_FILE"; then
    echo -e "  ${GREEN}●${NC} web (PID $(cat "$WEB_PID_FILE"))"
  else
    echo -e "  ${RED}●${NC} web (stopped)"
  fi

  # Admin
  if is_running "$ADMIN_PID_FILE"; then
    echo -e "  ${GREEN}●${NC} admin (PID $(cat "$ADMIN_PID_FILE"))"
  else
    echo -e "  ${RED}●${NC} admin (stopped)"
  fi

  # Smee
  if is_running "$SMEE_PID_FILE"; then
    echo -e "  ${GREEN}●${NC} smee webhook proxy (PID $(cat "$SMEE_PID_FILE"))"
  else
    echo -e "  ${YELLOW}●${NC} smee webhook proxy (not running)"
  fi

  echo ""
}

# ─── Logs ─────────────────────────────────────────────────────────────────────

do_logs() {
  echo -e "${BOLD}Tailing all logs (Ctrl+C to stop)...${NC}"
  echo ""
  tail -f "$LOG_DIR/api.log" "$LOG_DIR/web.log" 2>/dev/null
}

# ─── Start ────────────────────────────────────────────────────────────────────

do_start() {
  print_header

  # Create log directory
  mkdir -p "$LOG_DIR"

  # Stop anything already running
  if is_running "$API_PID_FILE" || is_running "$WEB_PID_FILE"; then
    echo -e "${YELLOW}Stopping existing services first...${NC}"
    do_stop
    echo ""
  fi

  # ── 1. Docker services ──────────────────────────────────────────────────
  echo -e "${BOLD}[1/6] Starting Docker services...${NC}"
  docker compose up -d

  # Wait for Docker health checks
  printf "  Waiting for services...    "
  local docker_ready=false
  for i in $(seq 1 30); do
    local all_healthy=true
    for svc in db cache; do
      local health
      health=$(docker compose ps --format '{{.Health}}' "$svc" 2>/dev/null || echo "")
      if [[ "$health" != *"healthy"* ]]; then
        all_healthy=false
        break
      fi
    done
    if $all_healthy; then
      docker_ready=true
      break
    fi
    sleep 1
  done

  if $docker_ready; then
    echo -e "${GREEN}ready${NC}"
    echo -e "  ${GREEN}●${NC} PostgreSQL, Redis, Mailpit — ${GREEN}healthy${NC}"
  else
    echo -e "${YELLOW}timeout${NC}"
    echo -e "  ${YELLOW}⚠${NC}  Docker services may still be starting..."
  fi

  # ── 2. Run migrations ───────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}[2/6] Running database migrations...${NC}"
  DATABASE_URL="postgres://notebookmd:localdev@localhost:5432/notebookmd" \
    npx --workspace=apps/api node-pg-migrate up --migrations-dir apps/api/migrations --migration-file-language sql 2>&1 | \
    grep -E "(Migrating|complete|already)" || echo "  Migrations up to date"

  # Ensure test database exists and is migrated
  docker exec notebook-md-db-1 psql -U notebookmd -d notebookmd -tc \
    "SELECT 1 FROM pg_database WHERE datname = 'notebookmd_test'" | grep -q 1 || \
    docker exec notebook-md-db-1 psql -U notebookmd -d notebookmd -c \
    "CREATE DATABASE notebookmd_test OWNER notebookmd" > /dev/null 2>&1
  DATABASE_URL="postgres://notebookmd:localdev@localhost:5432/notebookmd_test" \
    npx --workspace=apps/api node-pg-migrate up --migrations-dir migrations --migration-file-language sql 2>&1 > /dev/null

  # ── 3. Start API server ─────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}[3/6] Starting API server...${NC}"
  npx --workspace=apps/api tsx watch src/index.ts > "$LOG_DIR/api.log" 2>&1 &
  echo $! > "$API_PID_FILE"
  echo "  API server starting (PID $(cat "$API_PID_FILE"))..."

  # Wait for API to be ready
  wait_for_service "API" "http://localhost:3001/api/health" 15

  # ── 4. Start web dev server ─────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}[4/6] Starting web dev server...${NC}"
  npx --workspace=apps/web vite --host > "$LOG_DIR/web.log" 2>&1 &
  echo $! > "$WEB_PID_FILE"
  echo "  Web dev server starting (PID $(cat "$WEB_PID_FILE"))..."

  wait_for_service "Web" "http://localhost:5173" 15

  # ── 5. Start admin dev server ──────────────────────────────────────────
  echo ""
  echo -e "${BOLD}[5/6] Starting admin dev server...${NC}"
  npx --workspace=apps/admin vite --host > "$LOG_DIR/admin.log" 2>&1 &
  echo $! > "$ADMIN_PID_FILE"
  echo "  Admin dev server starting (PID $(cat "$ADMIN_PID_FILE"))..."

  wait_for_service "Admin" "http://localhost:5174" 15

  # ── 6. Start webhook proxy (smee.io) if configured ────────────────────
  # Load WEBHOOK_PROXY_URL from .env
  WEBHOOK_PROXY_URL=""
  if [ -f .env ]; then
    WEBHOOK_PROXY_URL=$(grep -E '^WEBHOOK_PROXY_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi

  if [ -n "$WEBHOOK_PROXY_URL" ]; then
    echo ""
    echo -e "${BOLD}[6/6] Starting webhook proxy (smee.io)...${NC}"
    npx smee -u "$WEBHOOK_PROXY_URL" -t http://localhost:3001/webhooks/github -p 3001 > "$LOG_DIR/smee.log" 2>&1 &
    echo $! > "$SMEE_PID_FILE"
    echo "  Smee proxy starting (PID $(cat "$SMEE_PID_FILE"))..."
    echo "  Forwarding: $WEBHOOK_PROXY_URL → http://localhost:3001/webhooks/github"
  else
    echo ""
    echo -e "  ${YELLOW}⚠${NC}  Webhook proxy skipped (WEBHOOK_PROXY_URL not set in .env)"
  fi

  # ── Done! ───────────────────────────────────────────────────────────────
  echo ""
  echo -e "${GREEN}${BOLD}✓ All services running!${NC}"
  print_urls

  echo -e "${BOLD}Commands:${NC}"
  echo "  ./dev.sh stop      Stop all services"
  echo "  ./dev.sh status    Check service health"
  echo "  ./dev.sh logs      Tail API & Web logs"
  echo ""
  echo -e "${YELLOW}Tailing logs... (Ctrl+C to detach — services keep running)${NC}"
  echo ""

  # Tail logs
  local logfiles=("$LOG_DIR/api.log" "$LOG_DIR/web.log" "$LOG_DIR/admin.log")
  [ -f "$LOG_DIR/smee.log" ] && logfiles+=("$LOG_DIR/smee.log")
  tail -f "${logfiles[@]}" 2>/dev/null || true
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-start}" in
  start)  do_start ;;
  stop)   do_stop ;;
  status) do_status ;;
  logs)   do_logs ;;
  promote-admin)
    if [ -z "${2:-}" ]; then
      echo -e "${RED}Usage: ./dev.sh promote-admin <email>${NC}"
      exit 1
    fi
    echo -e "${BOLD}Promoting ${2} to admin...${NC}"
    DATABASE_URL="postgres://notebookmd:localdev@localhost:5432/notebookmd" \
      node apps/api/cli/promote-admin.js "$2"
    ;;
  *)
    echo "Usage: ./dev.sh [start|stop|status|logs|promote-admin <email>]"
    exit 1
    ;;
esac
