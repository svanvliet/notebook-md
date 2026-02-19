# ──────────────────────────────────────────────
# Azure Cache for Redis
# ──────────────────────────────────────────────

resource "azurerm_redis_cache" "main" {
  name                          = "redis-${var.project}-${var.environment}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  capacity                      = 0
  family                        = "C"
  sku_name                      = "Basic"
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true
  redis_version                 = "7"

  redis_configuration {}

  tags = local.tags
}
