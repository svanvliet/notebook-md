# ──────────────────────────────────────────────
# Azure Monitor / Application Insights
# ──────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.project}-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 90

  tags = local.tags
}

resource "azurerm_application_insights" "main" {
  name                = "ai-${var.project}-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = local.tags
}

# ──────────────────────────────────────────────
# Action Group (alert notification target)
# ──────────────────────────────────────────────

resource "azurerm_monitor_action_group" "ops" {
  name                = "ag-${var.project}-ops"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "nbmd-ops"

  email_receiver {
    name          = "ops-email"
    email_address = var.alert_email
  }

  tags = local.tags
}

# ──────────────────────────────────────────────
# Availability Tests (ping endpoints)
# ──────────────────────────────────────────────

resource "azurerm_application_insights_standard_web_test" "api_health" {
  name                    = "avail-api-health"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr", "us-il-ch1-azr", "us-ca-sjc-azr"]
  frequency               = 300
  timeout                 = 30
  enabled                 = true

  request {
    url = "https://api.${var.domain}/api/health"
  }

  validation_rules {
    expected_status_code = 200
  }

  tags = local.tags
}

resource "azurerm_application_insights_standard_web_test" "web" {
  name                    = "avail-web"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr", "us-il-ch1-azr"]
  frequency               = 300
  timeout                 = 30
  enabled                 = true

  request {
    url = "https://${var.domain}"
  }

  validation_rules {
    expected_status_code = 200
  }

  tags = local.tags
}

resource "azurerm_application_insights_standard_web_test" "admin" {
  name                    = "avail-admin"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr", "us-il-ch1-azr"]
  frequency               = 300
  timeout                 = 30
  enabled                 = true

  request {
    url = "https://admin.${var.domain}"
  }

  validation_rules {
    expected_status_code = 200
  }

  tags = local.tags
}

# ──────────────────────────────────────────────
# Alert Rules
# ──────────────────────────────────────────────

# API health check failure
resource "azurerm_monitor_metric_alert" "api_availability" {
  name                = "alert-api-availability"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "API health endpoint is failing from multiple locations"
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "availabilityResults/availabilityPercentage"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 90
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = local.tags
}

# Server error rate spike (5xx responses)
resource "azurerm_monitor_metric_alert" "error_rate" {
  name                = "alert-error-rate"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Server error rate (5xx) is elevated"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/failed"
    aggregation      = "Count"
    operator         = "GreaterThan"
    threshold        = 10
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = local.tags
}

# High API latency
resource "azurerm_monitor_metric_alert" "high_latency" {
  name                = "alert-high-latency"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "API response time is consistently high"
  severity            = 3
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/duration"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 3000
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = local.tags
}
