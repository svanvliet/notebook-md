# Notebook.md — First Deployment Guide

This guide walks through deploying Notebook.md to Azure from scratch.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and authenticated (`az login`)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) ≥ 1.5 installed
- [Docker](https://docs.docker.com/get-docker/) installed and running
- GitHub repo with Actions enabled
- Domain `notebookmd.io` managed in GoDaddy

## Step 1: Bootstrap Terraform State

Run once to create the Azure Storage Account for Terraform remote state:

```bash
cd infra/terraform
chmod +x bootstrap-state.sh
./bootstrap-state.sh
```

## Step 2: Configure Secrets

Copy and fill in `terraform.tfvars`:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Required values:

| Variable | How to generate |
|----------|----------------|
| `subscription_id` | `az account show --query id -o tsv` |
| `db_admin_password` | `openssl rand -base64 32` |
| `session_secret` | `openssl rand -base64 48` |
| `encryption_key` | `openssl rand -hex 16` (32 hex chars = 16 bytes displayed as 32 chars) |
| `sendgrid_api_key` | From SendGrid dashboard → Settings → API Keys |

OAuth credentials can be empty initially (`""`) — add them when you configure each provider.

## Step 3: Provision ACR First

Container Apps need images in ACR before they can start. Create the resource group and registry first:

```bash
terraform init
terraform apply \
  -target=azurerm_resource_group.main \
  -target=azurerm_container_registry.main
```

Note the ACR login server from the output (e.g., `crnotebookmdprod.azurecr.io`).

## Step 4: Build & Push Initial Images

```bash
cd ../..  # back to repo root
ACR_NAME=crnotebookmdprod

# Login to ACR
az acr login --name $ACR_NAME

# Build and push all 4 images
docker build -f docker/Dockerfile.web -t $ACR_NAME.azurecr.io/web:latest .
docker push $ACR_NAME.azurecr.io/web:latest

docker build -f docker/Dockerfile.api -t $ACR_NAME.azurecr.io/api:latest .
docker push $ACR_NAME.azurecr.io/api:latest

docker build -f docker/Dockerfile.admin -t $ACR_NAME.azurecr.io/admin:latest .
docker push $ACR_NAME.azurecr.io/admin:latest

docker build -f docker/Dockerfile.collab -t $ACR_NAME.azurecr.io/collab:latest .
docker push $ACR_NAME.azurecr.io/collab:latest
```

## Step 5: Full Terraform Apply

Now create all remaining resources (DB, Redis, Key Vault, Container Apps, Front Door, Monitoring):

```bash
cd infra/terraform
terraform apply
```

This takes ~15-20 minutes (Redis and PostgreSQL are the slowest). Review the plan carefully before confirming.

Save the outputs — you'll need them for DNS:

```bash
terraform output
terraform output domain_validation_web
terraform output domain_validation_api
terraform output domain_validation_admin
```

## Step 6: Configure DNS (GoDaddy)

Follow `infra/dns-records.md` for the complete record list. Summary:

1. **Validation TXT records** (add first, required for TLS cert provisioning):
   - `_dnsauth` → `{domain_validation_web}`
   - `_dnsauth.api` → `{domain_validation_api}`
   - `_dnsauth.admin` → `{domain_validation_admin}`

2. **CNAME records** (point domains to Front Door):
   - `www` → `{frontdoor_web_endpoint}`
   - `api` → `{frontdoor_api_endpoint}`
   - `admin` → `{frontdoor_admin_endpoint}`

3. **Root domain (`@`)**: GoDaddy doesn't support CNAME on root. Options:
   - Use GoDaddy forwarding: `notebookmd.io` → `https://www.notebookmd.io`
   - Or transfer DNS to Azure DNS / Cloudflare for CNAME flattening

4. **Email (SPF + DMARC)** — see dns-records.md §4

Allow up to 48 hours for DNS propagation (usually minutes). Azure Front Door will auto-provision TLS certificates once validation TXT records are verified.

## Step 7: Set Up GitHub Actions (OIDC)

Create a service principal for CI/CD with federated identity (no stored secrets):

```bash
# Create Azure AD app registration
az ad app create --display-name "notebookmd-github-actions"

# Note the appId from the output, then:
APP_ID=<appId from above>

# Create service principal
az ad sp create --id $APP_ID

# Get the SP object ID
SP_OID=$(az ad sp show --id $APP_ID --query id -o tsv)

# Grant Contributor role on the resource group
az role assignment create \
  --role Contributor \
  --assignee-object-id $SP_OID \
  --assignee-principal-type ServicePrincipal \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-notebookmd-prod"

# Grant AcrPush for Docker image push
az role assignment create \
  --role AcrPush \
  --assignee-object-id $SP_OID \
  --assignee-principal-type ServicePrincipal \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-notebookmd-prod/providers/Microsoft.ContainerRegistry/registries/crnotebookmdprod"

# Add federated credential for GitHub Actions (production environment)
az ad app federated-credential create --id $APP_ID --parameters '{
  "name": "github-actions-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:svanvliet/notebook-md:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

## Step 8: Configure GitHub Repository

In GitHub repo settings (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `AZURE_CLIENT_ID` | `$APP_ID` from Step 7 |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

Create a **production** environment (Settings → Environments → New environment):
- Name: `production`
- Add required reviewers (optional but recommended)

## Step 9: Tag v0.1.0 & Deploy

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the deploy workflow which will:
1. Build & push versioned images (`api:0.1.0`, `web:0.1.0`, `admin:0.1.0`, `collab:0.1.0`)
2. Run database migrations (001–003)
3. Deploy updated Container Apps
4. Health check the API

Monitor at: https://github.com/svanvliet/notebook-md/actions

## Step 10: Verify & Smoke Test

```bash
# API health
curl -s https://api.notebookmd.io/api/health | jq .

# Web app
open https://notebookmd.io     # or https://www.notebookmd.io

# Admin console
open https://admin.notebookmd.io
```

Smoke test checklist:
- [ ] Sign up with email
- [ ] Verify email verification is sent (check SendGrid activity)
- [ ] Create a local notebook
- [ ] Edit a markdown document
- [ ] Check cookie consent banner
- [ ] Check legal pages (Privacy, Terms)
- [ ] Verify admin console loads
- [ ] Create a Cloud notebook (requires cloud_notebooks flag enabled)
- [ ] Verify real-time collab connects (WebSocket at `wss://api.notebookmd.io/collab`)

## Step 11: Promote Admin Account

After signing up, promote your account to admin:

```bash
# Exec into the API container
az containerapp exec \
  --name ca-notebookmd-api \
  --resource-group rg-notebookmd-prod \
  --command "node cli/promote-admin.js your@email.com"
```

## Estimated Costs (Monthly)

All 4 container apps are configured with `min_replicas = 0` (scale-to-zero) to minimize idle costs during pre-launch. With near-zero traffic, containers scale down completely and you pay only for actual usage. Expect 5–10s cold starts on first request after idle.

| Resource | SKU | ~Cost |
|----------|-----|-------|
| PostgreSQL Flexible Server | B_Standard_B1ms | $0 (free tier) |
| Redis Cache | Basic C0 | $16 |
| Container Apps (4 apps) | Consumption, scale-to-zero | $0–5 (idle); ~$660 (always-on) |
| Front Door | Standard | $35 |
| Container Registry | Basic | $5 |
| Key Vault | Standard | $0–1 |
| Log Analytics + App Insights | 90-day retention, 1 geo | $0–5 |
| **Total (scale-to-zero)** | | **~$57–67/mo** |

> **When ready for production traffic**, set `min_replicas = 1` on `api` and `web` in `container_apps.tf` to eliminate cold starts for end users. This adds ~$490/mo.

## Troubleshooting

**Container App won't start:**
```bash
az containerapp logs show --name ca-notebookmd-api --resource-group rg-notebookmd-prod --type system
az containerapp logs show --name ca-notebookmd-api --resource-group rg-notebookmd-prod --type console
```

**Collab WebSocket not connecting:**
```bash
az containerapp logs show --name ca-notebookmd-collab --resource-group rg-notebookmd-prod --type console
# Verify Front Door routes /collab/* to collab origin
az afd route show --profile-name fd-notebookmd-prod --resource-group rg-notebookmd-prod --endpoint-name notebookmd-api --route-name route-collab
```

**Database connection issues:**
```bash
# Test connectivity from your machine (need firewall rule for your IP)
psql "$(terraform output -raw postgresql_fqdn)" -U notebookmd_admin
```

**Front Door domain validation pending:**
```bash
az afd custom-domain show --profile-name fd-notebookmd-prod --resource-group rg-notebookmd-prod --custom-domain-name domain-web --query domainValidationState
```

**Migration job failed:**
```bash
az containerapp job execution list --name migrate-0.1.0 --resource-group rg-notebookmd-prod
```
