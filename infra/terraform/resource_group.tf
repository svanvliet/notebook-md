# ──────────────────────────────────────────────
# Resource Group
# ──────────────────────────────────────────────

resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project}-${var.environment}"
  location = var.location

  tags = local.tags
}

locals {
  tags = {
    project     = var.project
    environment = var.environment
    managed_by  = "terraform"
  }
  # Database name without hyphens (matches dev setup)
  db_name = replace(var.project, "-", "")
}
