#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
#  rotate-credentials.sh — Full credential rotation with restart support
#
#  Rotates every secret that was exposed in the tfplan leak, updates
#  terraform.tfvars, runs the encryption-key data migration, applies
#  Terraform, and verifies API health.
#
#  Usage:
#    ./scripts/rotate-credentials.sh              # Start or resume
#    ./scripts/rotate-credentials.sh --reset      # Wipe state and start fresh
#    ./scripts/rotate-credentials.sh --status     # Show progress
#    ./scripts/rotate-credentials.sh --dry-run    # Show what would happen
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$REPO_ROOT/infra/terraform"
TFVARS="$TF_DIR/terraform.tfvars"
STATE_DIR="$REPO_ROOT/.credential-rotation"
STATE_FILE="$STATE_DIR/state"
NEW_VALS_FILE="$STATE_DIR/new-values"
RESOURCE_GROUP="rg-notebookmd-prod"
PG_SERVER="psql-notebookmd-prod"
PG_FIREWALL_RULE="temp-credential-rotation"
API_CONTAINER="ca-notebookmd-api"
API_HEALTH_URL="https://api.notebookmd.io/api/health"
FIREWALL_ADDED=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────

log()  { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }
info() { echo -e "${CYAN}ℹ️  $*${NC}"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}\n"; }

# ── PostgreSQL firewall management ────────────────────────────────────

get_my_ip() {
  curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
    || curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
    || curl -s --max-time 5 https://checkip.amazonaws.com 2>/dev/null \
    || echo ""
}

ensure_pg_firewall() {
  # Add a temporary firewall rule for the current IP if not already added
  if [[ "$FIREWALL_ADDED" == "true" ]]; then
    return 0
  fi

  local my_ip
  my_ip=$(get_my_ip)
  if [[ -z "$my_ip" ]]; then
    err "Could not determine your public IP address"
    err "  Add a firewall rule manually:"
    err "  az postgres flexible-server firewall-rule create --rule-name $PG_FIREWALL_RULE --resource-group $RESOURCE_GROUP --name $PG_SERVER --start-ip-address <YOUR_IP> --end-ip-address <YOUR_IP>"
    return 1
  fi

  info "Adding temporary PostgreSQL firewall rule for ${my_ip}..."
  if az postgres flexible-server firewall-rule create \
    --rule-name "$PG_FIREWALL_RULE" \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER" \
    --start-ip-address "$my_ip" \
    --end-ip-address "$my_ip" \
    -o none 2>/dev/null; then
    FIREWALL_ADDED=true
    log "Firewall rule added for ${my_ip}"
  else
    # Rule may already exist — try updating it
    if az postgres flexible-server firewall-rule update \
      --rule-name "$PG_FIREWALL_RULE" \
      --resource-group "$RESOURCE_GROUP" \
      --name "$PG_SERVER" \
      --start-ip-address "$my_ip" \
      --end-ip-address "$my_ip" \
      -o none 2>/dev/null; then
      FIREWALL_ADDED=true
      log "Firewall rule updated for ${my_ip}"
    else
      err "Failed to create/update firewall rule"
      return 1
    fi
  fi

  # Azure firewall rules need time to propagate
  info "Waiting 10s for firewall rule to propagate..."
  sleep 10
}

remove_pg_firewall() {
  # Remove the temporary firewall rule (safe to call multiple times)
  if [[ "$FIREWALL_ADDED" != "true" ]]; then
    return 0
  fi

  info "Removing temporary PostgreSQL firewall rule..."
  if az postgres flexible-server firewall-rule delete \
    --rule-name "$PG_FIREWALL_RULE" \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER" \
    --yes -o none 2>/dev/null; then
    FIREWALL_ADDED=false
    log "Firewall rule removed"
  else
    warn "Could not remove firewall rule '$PG_FIREWALL_RULE' — please remove it manually:"
    warn "  az postgres flexible-server firewall-rule delete --rule-name $PG_FIREWALL_RULE --resource-group $RESOURCE_GROUP --name $PG_SERVER --yes"
  fi
}

cleanup_on_exit() {
  local exit_code=$?
  remove_pg_firewall
  exit $exit_code
}

trap cleanup_on_exit EXIT

get_state() {
  [[ -f "$STATE_FILE" ]] && cat "$STATE_FILE" || echo "not-started"
}

set_state() {
  mkdir -p "$STATE_DIR"
  echo "$1" > "$STATE_FILE"
}

save_val() {
  mkdir -p "$STATE_DIR"
  # Append or overwrite a key=value in new-values file
  local key="$1" val="$2"
  if [[ -f "$NEW_VALS_FILE" ]] && grep -q "^${key}=" "$NEW_VALS_FILE" 2>/dev/null; then
    # Use a temp file for portability (macOS sed -i differs from GNU)
    local tmp="$NEW_VALS_FILE.tmp"
    grep -v "^${key}=" "$NEW_VALS_FILE" > "$tmp" || true
    echo "${key}=${val}" >> "$tmp"
    mv "$tmp" "$NEW_VALS_FILE"
  else
    echo "${key}=${val}" >> "$NEW_VALS_FILE"
  fi
}

load_val() {
  [[ -f "$NEW_VALS_FILE" ]] && grep "^${1}=" "$NEW_VALS_FILE" 2>/dev/null | head -1 | cut -d= -f2- || echo ""
}

read_tfvar() {
  # Extract a value from terraform.tfvars (handles quoted strings)
  local key="$1"
  grep "^${key}" "$TFVARS" 2>/dev/null | head -1 | sed 's/^[^=]*=[[:space:]]*"\(.*\)"/\1/' || echo ""
}

prompt_secret() {
  local name="$1" instructions="$2"
  local existing
  existing=$(load_val "$name")
  if [[ -n "$existing" ]]; then
    info "Using previously saved value for ${name}"
    return 0
  fi

  echo ""
  echo -e "${BOLD}ACTION REQUIRED: Rotate ${name}${NC}"
  echo -e "${CYAN}${instructions}${NC}"
  echo ""
  read -rp "Paste the new value for ${name} (or 'skip' to defer): " value
  if [[ "$value" == "skip" ]]; then
    warn "Skipping ${name} — you must rotate this manually later!"
    save_val "$name" "__SKIPPED__"
    return 1
  fi
  save_val "$name" "$value"
  log "Saved ${name}"
}

prompt_multiline_secret() {
  local name="$1" instructions="$2"
  # Multi-line secrets are stored in their own file to avoid delimiter issues
  local pem_file="$STATE_DIR/${name}.pem"

  if [[ -f "$pem_file" ]]; then
    info "Using previously saved value for ${name}"
    return 0
  fi

  echo ""
  echo -e "${BOLD}ACTION REQUIRED: Rotate ${name}${NC}"
  echo -e "${CYAN}${instructions}${NC}"
  echo ""
  read -rp "Enter path to .pem file (or 'paste' to paste, 'skip' to defer): " input

  if [[ "$input" == "skip" ]]; then
    warn "Skipping ${name} — you must rotate this manually later!"
    save_val "$name" "__SKIPPED__"
    return 1
  fi

  mkdir -p "$STATE_DIR"
  if [[ "$input" == "paste" ]]; then
    echo "Paste PEM content below (reading ends automatically after -----END line):"
    local raw_value=""
    while IFS= read -r line; do
      raw_value="${raw_value}${line}
"
      if [[ "$line" == -----END* ]]; then
        break
      fi
    done
    printf '%s' "$raw_value" > "$pem_file"
  else
    # Treat input as a file path (expand ~ if present)
    local filepath="${input/#\~/$HOME}"
    if [[ ! -f "$filepath" ]]; then
      err "File not found: ${filepath}"
      return 1
    fi
    cp "$filepath" "$pem_file"
  fi

  # Also set a marker in new-values so the skipped-check works
  save_val "$name" "__PEM_FILE__"
  log "Saved ${name}"
}

update_tfvar() {
  local key="$1" val="$2"
  local escaped_val
  escaped_val=$(printf '%s' "$val" | sed 's/[&/\]/\\&/g')

  if grep -q "^${key}[[:space:]]*=" "$TFVARS" 2>/dev/null; then
    # Replace existing line (handles simple quoted values)
    sed -i.bak "s|^${key}[[:space:]]*=.*|${key} = \"${escaped_val}\"|" "$TFVARS"
  elif grep -q "^# *${key}[[:space:]]*=" "$TFVARS" 2>/dev/null; then
    # Uncomment and set
    sed -i.bak "s|^# *${key}[[:space:]]*=.*|${key} = \"${escaped_val}\"|" "$TFVARS"
  else
    # Append
    echo "${key} = \"${escaped_val}\"" >> "$TFVARS"
  fi
  rm -f "$TFVARS.bak"
}

update_tfvar_heredoc() {
  # Write a multi-line value (PEM key) using Terraform heredoc syntax
  local key="$1"
  local pem_file="$STATE_DIR/${key}.pem"

  if [[ ! -f "$pem_file" ]]; then
    err "PEM file not found at: ${pem_file}"
    return 1
  fi

  # Remove any existing entry for this key (single-line or heredoc block)
  local tmp="$TFVARS.tmp"
  # Use awk to remove both formats:
  #   key = "value"           (single line)
  #   key = <<-EOT ... EOT    (heredoc block)
  awk -v key="$key" '
    BEGIN { skip=0 }
    # Match heredoc start: key = <<-EOT or key = <<EOT
    $0 ~ "^" key "[[:space:]]*=.*<<-?EOT" { skip=1; next }
    # Match heredoc end
    skip && /^[[:space:]]*EOT[[:space:]]*$/ { skip=0; next }
    # Match single-line: key = "..."
    !skip && $0 ~ "^" key "[[:space:]]*=" { next }
    # Skip lines inside heredoc
    skip { next }
    # Print everything else
    { print }
  ' "$TFVARS" > "$tmp"
  mv "$tmp" "$TFVARS"

  # Append new heredoc block
  {
    echo "${key} = <<-EOT"
    cat "$pem_file"
    echo "EOT"
  } >> "$TFVARS"
}

# ── Validation ────────────────────────────────────────────────────────

validate_environment() {
  header "Validating environment for credential rotation"
  local failures=0

  # 1. Azure CLI
  info "Checking Azure CLI login..."
  if az account show &>/dev/null; then
    local sub_name sub_id
    sub_name=$(az account show --query "name" -o tsv 2>/dev/null)
    sub_id=$(az account show --query "id" -o tsv 2>/dev/null)
    local expected_sub
    expected_sub=$(read_tfvar "subscription_id")
    if [[ -n "$expected_sub" && "$sub_id" != "$expected_sub" ]]; then
      err "FAIL: Wrong Azure subscription"
      err "  Current:  ${sub_id} (${sub_name})"
      err "  Expected: ${expected_sub}"
      err "  Fix: az account set --subscription ${expected_sub}"
      failures=$((failures + 1))
    else
      log "Azure CLI: ${sub_name} (${sub_id:0:8}...)"
    fi
  else
    err "FAIL: Not logged in to Azure (run: az login)"
    failures=$((failures + 1))
  fi

  # 2. Terraform backend
  info "Checking Terraform state backend..."
  local tf_output
  tf_output=$(cd "$TF_DIR" && terraform init -input=false -no-color 2>&1)
  if echo "$tf_output" | grep -q "successfully initialized"; then
    log "Terraform backend accessible"
  else
    err "FAIL: Terraform init failed"
    err "  $(echo "$tf_output" | tail -3)"
    failures=$((failures + 1))
  fi

  # 3. Key Vault
  info "Checking Key Vault access..."
  if az keyvault secret show --name database-url --vault-name kv-notebookmd-prod --query "name" -o tsv &>/dev/null; then
    log "Key Vault: kv-notebookmd-prod accessible"
  else
    err "FAIL: Cannot access Key Vault kv-notebookmd-prod"
    err "  Check tenant and access policies"
    failures=$((failures + 1))
  fi

  # 4. PostgreSQL
  info "Checking PostgreSQL server..."
  if az postgres flexible-server show --name "$PG_SERVER" --resource-group "$RESOURCE_GROUP" --query "state" -o tsv &>/dev/null; then
    local pg_state
    pg_state=$(az postgres flexible-server show --name "$PG_SERVER" --resource-group "$RESOURCE_GROUP" --query "state" -o tsv 2>/dev/null)
    log "PostgreSQL: ${PG_SERVER} (${pg_state})"
  else
    err "FAIL: Cannot access PostgreSQL server ${PG_SERVER}"
    failures=$((failures + 1))
  fi

  # 5. Container App
  info "Checking Container App..."
  if az containerapp show --name "$API_CONTAINER" --resource-group "$RESOURCE_GROUP" --query "name" -o tsv &>/dev/null; then
    log "Container App: ${API_CONTAINER} accessible"
  else
    err "FAIL: Cannot access Container App ${API_CONTAINER}"
    failures=$((failures + 1))
  fi

  # 6. Microsoft AD app
  info "Checking Microsoft AD app..."
  local ms_client_id
  ms_client_id=$(read_tfvar "microsoft_client_id")
  if [[ -n "$ms_client_id" ]]; then
    local app_name
    app_name=$(az ad app list --filter "appId eq '${ms_client_id}'" --query "[0].displayName" -o tsv 2>/dev/null)
    if [[ -n "$app_name" ]]; then
      log "Azure AD app: ${app_name} (${ms_client_id:0:8}...)"
    else
      warn "WARN: Could not find Azure AD app for ${ms_client_id:0:8}..."
      warn "  microsoft_client_secret will require manual rotation"
    fi
  fi

  # 7. Azure AI resource
  info "Checking Azure AI resource..."
  local ai_endpoint
  ai_endpoint=$(read_tfvar "azure_ai_endpoint")
  if [[ -n "$ai_endpoint" ]]; then
    local ai_name
    ai_name=$(az cognitiveservices account list \
      --query "[?contains(properties.endpoint, '$(echo "$ai_endpoint" | sed "s|/$||")')].name" \
      -o tsv 2>/dev/null | head -1) || true
    if [[ -n "$ai_name" ]]; then
      log "Azure AI: ${ai_name}"
    else
      warn "WARN: Could not find Azure AI resource for ${ai_endpoint}"
      warn "  azure_ai_api_key will require manual rotation"
    fi
  fi

  # 8. Node.js pg module
  info "Checking Node.js pg module..."
  if node -e "require('pg')" &>/dev/null; then
    log "Node.js pg module available"
  else
    err "FAIL: Node.js pg module not found (run: npm install)"
    failures=$((failures + 1))
  fi

  # 9. Database connectivity (auto-manages firewall rule)
  info "Checking database connectivity..."
  local db_url
  db_url=$(az keyvault secret show --name database-url --vault-name kv-notebookmd-prod --query "value" -o tsv 2>/dev/null) || true
  if [[ -n "$db_url" ]]; then
    # First attempt — may fail due to firewall
    local db_test
    db_test=$(DATABASE_URL="$db_url" node -e "
      setTimeout(() => { console.log('FAIL:connection timed out (firewall?)'); process.exit(1); }, 10000);
      const pg = require('pg');
      const c = new pg.Client({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, ssl: {rejectUnauthorized: false}});
      c.connect()
        .then(() => c.query('SELECT 1 as ok'))
        .then(() => { console.log('OK'); c.end(); process.exit(0); })
        .catch(e => { console.log('FAIL:' + e.message); c.end(); process.exit(1); });
    " 2>/dev/null) || true

    # If first attempt failed (likely firewall), auto-add rule and retry
    if [[ "$db_test" != "OK" ]]; then
      warn "Direct DB connection failed — adding temporary firewall rule..."
      if ensure_pg_firewall; then
        info "Retrying database connection..."
        db_test=$(DATABASE_URL="$db_url" node -e "
          setTimeout(() => { console.log('FAIL:connection timed out'); process.exit(1); }, 15000);
          const pg = require('pg');
          const c = new pg.Client({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 12000, ssl: {rejectUnauthorized: false}});
          c.connect()
            .then(() => c.query('SELECT 1 as ok'))
            .then(() => { console.log('OK'); c.end(); process.exit(0); })
            .catch(e => { console.log('FAIL:' + e.message); c.end(); process.exit(1); });
        " 2>/dev/null) || true
      fi
    fi

    if [[ "$db_test" == "OK" ]]; then
      log "Database: connection verified"

      # Count rows to migrate
      local counts
      counts=$(DATABASE_URL="$db_url" node -e "
        setTimeout(() => { console.log('query timed out'); process.exit(1); }, 10000);
        const pg = require('pg');
        const c = new pg.Client({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, ssl: {rejectUnauthorized: false}});
        c.connect()
          .then(() => c.query(\"SELECT (SELECT count(*) FROM identity_links WHERE access_token_enc IS NOT NULL) as links, (SELECT count(*) FROM users WHERE totp_secret_enc IS NOT NULL) as totp\"))
          .then(r => { console.log(r.rows[0].links + ' identity_links, ' + r.rows[0].totp + ' TOTP users'); c.end(); process.exit(0); })
          .catch(e => { console.log('query failed'); c.end(); process.exit(1); });
      " 2>/dev/null) || true
      info "Data to re-encrypt: ${counts}"
    else
      err "FAIL: Database connection failed (even after adding firewall rule)"
      echo "$db_test" | grep "^FAIL:" | while read -r line; do err "  $line"; done
      failures=$((failures + 1))
    fi
  else
    warn "WARN: Could not fetch DATABASE_URL (Key Vault may be inaccessible)"
  fi

  # 10. API health
  info "Checking API health endpoint..."
  local http_status
  http_status=$(curl -sf -o /dev/null -w "%{http_code}" "$API_HEALTH_URL" 2>/dev/null || echo "000")
  if [[ "$http_status" == "200" ]]; then
    log "API health: HTTP 200"
  else
    warn "WARN: API health returned HTTP ${http_status} (may be in scale-to-zero)"
  fi

  # Summary
  echo ""
  if [[ $failures -eq 0 ]]; then
    header "✅ ALL CHECKS PASSED — ready to rotate"
    return 0
  else
    header "❌ ${failures} CHECK(S) FAILED — fix before running rotation"
    return 1
  fi
}

# ── Precondition checks ──────────────────────────────────────────────

check_prereqs() {
  header "Checking prerequisites"

  local missing=0
  for cmd in az terraform openssl node curl; do
    if ! command -v "$cmd" &>/dev/null; then
      err "Required command not found: ${cmd}"
      missing=1
    fi
  done
  [[ $missing -eq 1 ]] && exit 1

  if [[ ! -f "$TFVARS" ]]; then
    err "terraform.tfvars not found at $TFVARS"
    exit 1
  fi

  # Verify Azure login
  if ! az account show &>/dev/null; then
    err "Not logged in to Azure. Run: az login"
    exit 1
  fi

  # Verify correct Azure subscription
  local expected_sub
  expected_sub=$(read_tfvar "subscription_id")
  if [[ -n "$expected_sub" ]]; then
    local current_sub
    current_sub=$(az account show --query "id" -o tsv 2>/dev/null)
    if [[ "$current_sub" != "$expected_sub" ]]; then
      err "Wrong Azure subscription!"
      err "  Current:  ${current_sub}"
      err "  Expected: ${expected_sub} (from terraform.tfvars)"
      err "Run: az login   (then select the correct account)"
      err " or: az account set --subscription ${expected_sub}"
      exit 1
    fi
    log "Azure subscription verified: ${expected_sub:0:8}..."
  fi

  # Verify Terraform is initialized
  if [[ ! -d "$TF_DIR/.terraform" ]]; then
    info "Initializing Terraform..."
    (cd "$TF_DIR" && terraform init -input=false) || {
      err "Terraform init failed — check your Azure credentials and backend config"
      exit 1
    }
  fi

  log "All prerequisites met"
}

# ── Steps ─────────────────────────────────────────────────────────────

step_generate_auto() {
  header "Step 1/7: Generating auto-rotatable secrets"

  if [[ -z "$(load_val db_admin_password)" ]]; then
    save_val "db_admin_password" "$(openssl rand -base64 32 | tr -d '=/+' | head -c 30)"
    log "Generated new db_admin_password"
  else
    info "db_admin_password already generated"
  fi

  if [[ -z "$(load_val session_secret)" ]]; then
    save_val "session_secret" "$(openssl rand -base64 48)"
    log "Generated new session_secret"
  else
    info "session_secret already generated"
  fi

  if [[ -z "$(load_val encryption_key)" ]]; then
    save_val "encryption_key" "$(openssl rand -hex 16)"
    log "Generated new encryption_key (32 hex chars = 16 bytes)"
  else
    info "encryption_key already generated"
  fi

  if [[ -z "$(load_val github_webhook_secret)" ]]; then
    save_val "github_webhook_secret" "$(openssl rand -hex 32)"
    log "Generated new github_webhook_secret"
  else
    info "github_webhook_secret already generated"
  fi

  set_state "auto-generated"
}

step_rotate_microsoft() {
  local existing
  existing=$(load_val "microsoft_client_secret")
  if [[ -n "$existing" ]]; then
    info "microsoft_client_secret already rotated"
    return 0
  fi

  info "Rotating Microsoft OAuth client secret via Azure CLI..."
  local ms_client_id
  ms_client_id=$(read_tfvar "microsoft_client_id")
  if [[ -z "$ms_client_id" ]]; then
    warn "microsoft_client_id not found in tfvars — falling back to manual prompt"
    return 1
  fi

  # Find the Azure AD app by client ID
  local app_object_id
  app_object_id=$(az ad app list --filter "appId eq '${ms_client_id}'" --query "[0].id" -o tsv 2>/dev/null) || true
  if [[ -z "$app_object_id" ]]; then
    warn "Could not find Azure AD app for client ID ${ms_client_id} — falling back to manual prompt"
    return 1
  fi

  local new_secret
  new_secret=$(az ad app credential reset \
    --id "$app_object_id" \
    --display-name "rotated-$(date +%Y%m%d)" \
    --query "password" -o tsv 2>/dev/null) || {
    warn "az ad app credential reset failed — falling back to manual prompt"
    return 1
  }

  save_val "microsoft_client_secret" "$new_secret"
  log "Rotated microsoft_client_secret via Azure CLI"
}

step_rotate_azure_ai() {
  local existing
  existing=$(load_val "azure_ai_api_key")
  if [[ -n "$existing" ]]; then
    info "azure_ai_api_key already rotated"
    return 0
  fi

  info "Rotating Azure AI API key via Azure CLI..."
  local endpoint
  endpoint=$(read_tfvar "azure_ai_endpoint")
  if [[ -z "$endpoint" ]]; then
    warn "azure_ai_endpoint not found in tfvars — falling back to manual prompt"
    return 1
  fi

  # Find the Cognitive Services account that matches this endpoint.
  # Endpoints vary in format (e.g., https://eastus.api.cognitive.microsoft.com/,
  # https://my-resource.openai.azure.com/) so we search by endpoint match.
  local resource_info
  resource_info=$(az cognitiveservices account list \
    --query "[?contains(properties.endpoint, '$(echo "$endpoint" | sed "s|/$||")')].{name:name, rg:resourceGroup}" \
    -o tsv 2>/dev/null | head -1) || true

  if [[ -z "$resource_info" ]]; then
    # Try broader search: list all and find by endpoint substring
    resource_info=$(az cognitiveservices account list \
      --query "[].{name:name, rg:resourceGroup, ep:properties.endpoint}" -o tsv 2>/dev/null \
      | grep -i "$(echo "$endpoint" | sed 's|https://||;s|/$||')" | head -1) || true
  fi

  if [[ -z "$resource_info" ]]; then
    warn "Could not find Azure AI resource for endpoint ${endpoint}"
    warn "Falling back to manual prompt"
    return 1
  fi

  local resource_name ai_rg
  resource_name=$(echo "$resource_info" | awk '{print $1}')
  ai_rg=$(echo "$resource_info" | awk '{print $2}')

  info "Found resource: ${resource_name} in ${ai_rg}"

  local new_key
  new_key=$(az cognitiveservices account keys regenerate \
    --name "$resource_name" \
    --resource-group "$ai_rg" \
    --key-name key1 \
    --query "key1" -o tsv 2>/dev/null) || {
    warn "az cognitiveservices keys regenerate failed — falling back to manual prompt"
    return 1
  }

  save_val "azure_ai_api_key" "$new_key"
  log "Rotated azure_ai_api_key via Azure CLI"
}

step_prompt_manual() {
  header "Step 2/7: Credential rotation (auto + manual)"

  info "Automating rotations where CLI/API is available..."
  info "Already-entered values are preserved (restart-safe)."
  echo ""

  # ── CLI-automated rotations ──
  step_rotate_microsoft || \
    prompt_secret "microsoft_client_secret" \
      "Go to: https://portal.azure.com → Azure Active Directory
       → App registrations → Notebook.md → Certificates & secrets
       → New client secret → Copy the Value" || true

  step_rotate_azure_ai || \
    prompt_secret "azure_ai_api_key" \
      "Go to: Azure Portal → Azure OpenAI / AI Foundry resource
       → Keys and Endpoint → Regenerate Key 1 → Copy it" || true

  # ── Manual-only rotations (no API/CLI exists) ──
  echo ""
  info "The following credentials must be rotated manually (no CLI/API available):"
  echo ""

  prompt_secret "sendgrid_api_key" \
    "Go to: https://app.sendgrid.com/settings/api_keys
     → Create API Key → Full Access → Copy the key
     (The old key was already revoked by SendGrid)" || true

  prompt_secret "github_client_secret" \
    "Go to: https://github.com/settings/developers → OAuth Apps → notebook-md
     → Generate a new client secret → Copy it" || true

  prompt_secret "github_app_client_secret" \
    "Go to: https://github.com/settings/apps/notebook-md
     → Client secrets → Generate a new client secret → Copy it" || true

  prompt_multiline_secret "github_app_private_key" \
    "Go to: https://github.com/settings/apps/notebook-md
     → Private keys → Generate a private key
     → Download the .pem file" || true

  prompt_secret "google_client_secret" \
    "Go to: https://console.cloud.google.com/apis/credentials
     → OAuth 2.0 Client IDs → Notebook.md
     → Reset Secret → Copy the new secret" || true

  prompt_secret "brave_search_api_key" \
    "Go to: https://api.search.brave.com/app/keys
     → Generate new API key → Copy it" || true

  # Check if any were skipped
  local skipped=0
  for key in sendgrid_api_key github_client_secret github_app_client_secret \
             github_app_private_key microsoft_client_secret google_client_secret \
             azure_ai_api_key brave_search_api_key; do
    local val
    val=$(load_val "$key")
    if [[ "$val" == "__SKIPPED__" ]]; then
      warn "SKIPPED: ${key}"
      skipped=$((skipped + 1))
    fi
  done

  if [[ $skipped -gt 0 ]]; then
    warn "${skipped} credential(s) were skipped — they will keep their OLD (compromised) values!"
    read -rp "Continue anyway? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy] ]] || exit 1
  fi

  set_state "manual-collected"
}

step_reencrypt_data() {
  header "Step 3/7: Re-encrypting database data"

  local old_key new_key db_url
  old_key=$(read_tfvar "encryption_key")
  new_key=$(load_val "encryption_key")

  if [[ -z "$old_key" ]]; then
    err "Cannot read old encryption_key from $TFVARS"
    exit 1
  fi
  if [[ -z "$new_key" ]]; then
    err "New encryption_key not generated"
    exit 1
  fi
  if [[ "$old_key" == "$new_key" ]]; then
    warn "Old and new encryption keys are the same — skipping migration"
    set_state "data-reencrypted"
    return
  fi

  # Get the production DATABASE_URL from current Key Vault
  info "Fetching production DATABASE_URL from Key Vault..."
  db_url=$(az keyvault secret show \
    --name database-url \
    --vault-name "kv-notebookmd-prod" \
    --query "value" -o tsv 2>/dev/null) || {
    err "Failed to read DATABASE_URL from Key Vault. Are you logged in to Azure?"
    exit 1
  }

  # Ensure we can reach the database (add firewall rule if needed)
  ensure_pg_firewall || {
    err "Cannot open database firewall. Re-encryption requires direct DB access."
    exit 1
  }

  info "Running re-encryption migration..."
  if DATABASE_URL="$db_url" node "$REPO_ROOT/scripts/reencrypt-data.mjs" "$old_key" "$new_key"; then
    log "Database re-encryption complete"
  else
    err "Re-encryption failed! Database was rolled back — no data loss."
    exit 1
  fi

  set_state "data-reencrypted"
}

step_update_tfvars() {
  header "Step 4/7: Updating terraform.tfvars"

  # Backup current tfvars
  cp "$TFVARS" "$STATE_DIR/terraform.tfvars.backup.$(date +%s)"
  info "Backed up current terraform.tfvars"

  # Auto-generated secrets
  for key in db_admin_password session_secret encryption_key github_webhook_secret; do
    local val
    val=$(load_val "$key")
    if [[ -n "$val" ]]; then
      update_tfvar "$key" "$val"
      log "Updated ${key}"
    fi
  done

  # Manually rotated secrets
  for key in sendgrid_api_key github_client_secret github_app_client_secret \
             microsoft_client_secret google_client_secret azure_ai_api_key \
             brave_search_api_key; do
    local val
    val=$(load_val "$key")
    if [[ -n "$val" && "$val" != "__SKIPPED__" ]]; then
      update_tfvar "$key" "$val"
      log "Updated ${key}"
    elif [[ "$val" == "__SKIPPED__" ]]; then
      warn "Keeping old value for ${key} (was skipped)"
    fi
  done

  # GitHub App private key (multi-line — stored in separate .pem file)
  local pem_file="$STATE_DIR/github_app_private_key.pem"
  local pk_marker
  pk_marker=$(load_val "github_app_private_key")

  # If PEM was saved by old code directly in new-values, extract it to .pem file
  if [[ -z "$pk_marker" ]] || [[ "$pk_marker" == "__SKIPPED__" ]]; then
    : # handled below
  elif [[ "$pk_marker" != "__PEM_FILE__" ]] && [[ ! -f "$pem_file" ]]; then
    # Old format: PEM content stored inline — but only first line was captured
    warn "PEM key was stored in old format — please re-provide it"
  fi

  if [[ -f "$pem_file" ]]; then
    update_tfvar_heredoc "github_app_private_key"
    log "Updated github_app_private_key"
  elif [[ "$pk_marker" == "__SKIPPED__" ]]; then
    warn "Keeping old value for github_app_private_key (was skipped)"
  else
    warn "No .pem file at ${pem_file} — github_app_private_key NOT updated"
    warn "  To fix: copy your .pem file there and re-run from this step"
  fi

  log "terraform.tfvars updated"
  set_state "tfvars-updated"
}

step_terraform_plan() {
  header "Step 5/7: Terraform plan"

  info "Running terraform plan..."
  (cd "$TF_DIR" && terraform plan -out=rotation.tfplan -input=false)

  echo ""
  echo -e "${BOLD}Review the plan above carefully.${NC}"
  read -rp "Apply this plan? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    warn "Aborted. Re-run the script to resume from this step."
    exit 1
  fi

  set_state "plan-approved"
}

step_terraform_apply() {
  header "Step 6/7: Terraform apply"

  info "Applying terraform changes..."
  (cd "$TF_DIR" && terraform apply rotation.tfplan)

  if [[ $? -ne 0 ]]; then
    err "Terraform apply failed!"
    err "Fix the issue and re-run this script — it will resume from this step."
    exit 1
  fi

  # Clean up plan file
  rm -f "$TF_DIR/rotation.tfplan"

  log "Terraform apply complete — all secrets updated in Azure"
  set_state "applied"
}

step_verify() {
  header "Step 7/7: Verifying deployment"

  info "Waiting for API to become healthy..."
  local attempts=0 max=30

  while [[ $attempts -lt $max ]]; do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$API_HEALTH_URL" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      log "API is healthy (HTTP 200)"
      break
    fi
    attempts=$((attempts + 1))
    echo "  Attempt ${attempts}/${max} — status: ${status}"
    sleep 10
  done

  if [[ $attempts -ge $max ]]; then
    err "API health check failed after $((max * 10)) seconds!"
    err "Check logs: az containerapp logs show --name $API_CONTAINER --resource-group $RESOURCE_GROUP --type console"
    err "You may need to rollback: ./scripts/manual-rollback.sh"
    exit 1
  fi

  # Verify email would work (can't send test, but check SMTP config)
  info "Checking container secrets were updated..."
  local secret_count
  secret_count=$(az containerapp secret list \
    --name "$API_CONTAINER" \
    --resource-group "$RESOURCE_GROUP" \
    --query "length(@)" -o tsv 2>/dev/null) || true

  if [[ -n "$secret_count" && "$secret_count" -gt 10 ]]; then
    log "Container has ${secret_count} secrets configured"
  else
    warn "Could not verify container secrets (count: ${secret_count:-unknown})"
  fi

  set_state "verified"

  header "🎉 ROTATION COMPLETE"
  echo -e "${GREEN}All credentials have been rotated and deployed.${NC}"
  echo ""
  echo "Post-rotation checklist:"
  echo "  □ Test sign-in with each OAuth provider (GitHub, Google, Microsoft)"
  echo "  □ Test email delivery (sign up flow or password reset)"
  echo "  □ Test AI content generation"
  echo "  □ Test GitHub repo integration (if used)"
  echo "  □ Verify 2FA still works for any users with TOTP enabled"
  echo "  □ Update the webhook secret in GitHub App settings to match:"
  echo "    $(load_val github_webhook_secret)"
  echo ""
  echo "State files are in $STATE_DIR — delete when satisfied:"
  echo "  rm -rf $STATE_DIR"
}

# ── CLI ───────────────────────────────────────────────────────────────

show_status() {
  local state
  state=$(get_state)
  echo "Current state: ${state}"
  echo ""
  echo "Steps:"
  local steps=("not-started" "auto-generated" "manual-collected" "data-reencrypted" "tfvars-updated" "plan-approved" "applied" "verified")
  local labels=("Generate auto secrets" "Collect manual secrets" "Re-encrypt DB data" "Update terraform.tfvars" "Terraform plan" "Terraform apply" "Verify health")

  local current_found=false
  for i in "${!labels[@]}"; do
    local step_state="${steps[$((i + 1))]}"
    if [[ "$current_found" == "true" ]]; then
      echo -e "  ⬜ ${labels[$i]}"
    elif [[ "$state" == "$step_state" ]]; then
      echo -e "  ${GREEN}✅ ${labels[$i]}${NC}"
      current_found=true
    elif [[ "$state" == "not-started" ]]; then
      echo -e "  ⬜ ${labels[$i]}"
    else
      echo -e "  ${GREEN}✅ ${labels[$i]}${NC}"
    fi
  done
}

main() {
  case "${1:-}" in
    --reset)
      rm -rf "$STATE_DIR"
      log "State cleared — starting fresh on next run"
      exit 0
      ;;
    --status)
      show_status
      exit 0
      ;;
    --dry-run)
      info "DRY RUN — would execute these steps:"
      echo "  1. Generate db_admin_password, session_secret, encryption_key, github_webhook_secret"
      echo "  2. Auto-rotate microsoft_client_secret (az ad), azure_ai_api_key (az cognitiveservices)"
      echo "     Prompt for: sendgrid, github oauth, github app+PEM, google, brave"
      echo "  3. Re-encrypt identity_links + users.totp_secret_enc with new encryption key"
      echo "  4. Update terraform.tfvars with all new values"
      echo "  5. terraform plan + terraform apply"
      echo "  6. Verify API health at $API_HEALTH_URL"
      exit 0
      ;;
    --validate)
      validate_environment
      exit $?
      ;;
    --help|-h)
      echo "Usage: $0 [--reset|--status|--dry-run|--validate|--help]"
      echo ""
      echo "  (no args)   Start or resume credential rotation"
      echo "  --reset     Clear all state and start fresh"
      echo "  --status    Show current progress"
      echo "  --dry-run   Show what would happen without doing anything"
      echo "  --validate  Test all CLI commands and resource access (read-only)"
      echo "  --help      Show this help"
      exit 0
      ;;
  esac

  echo -e "${BOLD}"
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║           CREDENTIAL ROTATION — notebook-md              ║"
  echo "║                                                           ║"
  echo "║  This script rotates all compromised production secrets,  ║"
  echo "║  migrates encrypted data, and deploys via Terraform.      ║"
  echo "║                                                           ║"
  echo "║  Progress is checkpointed — safe to interrupt & resume.   ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  local state
  state=$(get_state)
  info "Current state: ${state}"

  check_prereqs

  # Resume from last completed step (ordered fall-through)
  local steps_to_run=()
  case "$state" in
    not-started)       steps_to_run=(generate_auto prompt_manual reencrypt_data update_tfvars terraform_plan terraform_apply verify) ;;
    auto-generated)    steps_to_run=(prompt_manual reencrypt_data update_tfvars terraform_plan terraform_apply verify) ;;
    manual-collected)  steps_to_run=(reencrypt_data update_tfvars terraform_plan terraform_apply verify) ;;
    data-reencrypted)  steps_to_run=(update_tfvars terraform_plan terraform_apply verify) ;;
    tfvars-updated)    steps_to_run=(terraform_plan terraform_apply verify) ;;
    plan-approved)     steps_to_run=(terraform_apply verify) ;;
    applied)           steps_to_run=(verify) ;;
    verified)
      log "Rotation already complete! Use --reset to start over."
      exit 0
      ;;
    *)
      err "Unknown state: ${state}. Use --reset to start fresh."
      exit 1
      ;;
  esac

  for step in "${steps_to_run[@]}"; do
    "step_${step}"
  done
}

main "$@"
