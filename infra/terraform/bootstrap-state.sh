#!/usr/bin/env bash
# Bootstrap the Azure Storage Account for Terraform state.
# Run this ONCE before the first `terraform init`.
set -euo pipefail

RESOURCE_GROUP="rg-notebookmd-tfstate"
STORAGE_ACCOUNT="stnotebookmdtfstate"
CONTAINER="tfstate"
LOCATION="eastus2"

echo "Creating resource group for Terraform state..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "Creating storage account..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --encryption-services blob \
  --min-tls-version TLS1_2 \
  --output none

echo "Creating blob container..."
az storage container create \
  --name "$CONTAINER" \
  --account-name "$STORAGE_ACCOUNT" \
  --auth-mode login \
  --output none

echo ""
echo "✅ Terraform state backend ready."
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Storage Account: $STORAGE_ACCOUNT"
echo "   Container: $CONTAINER"
echo ""
echo "Next: cd infra/terraform && terraform init"
