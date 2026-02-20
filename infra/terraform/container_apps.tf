# ──────────────────────────────────────────────
# User Assigned Managed Identity for Container Apps
# ──────────────────────────────────────────────

resource "azurerm_user_assigned_identity" "container_apps" {
  name                = "id-${var.project}-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  tags = local.tags
}

# Grant managed identity pull access to Container Registry
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.container_apps.principal_id
}

# ──────────────────────────────────────────────
# Container Apps Environment
# ──────────────────────────────────────────────

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.project}-${var.environment}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  tags = local.tags
}

# ──────────────────────────────────────────────
# API Container App
# ──────────────────────────────────────────────

resource "azurerm_container_app" "api" {
  name                         = "ca-${var.project}-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Multiple"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_apps.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.container_apps.id
  }

  ingress {
    external_enabled = true
    target_port      = 3001
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 5

    container {
      name   = "api"
      image  = "${azurerm_container_registry.main.login_server}/api:latest"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3001"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "REDIS_URL"
        secret_name = "redis-url"
      }
      env {
        name        = "SESSION_SECRET"
        secret_name = "session-secret"
      }
      env {
        name        = "ENCRYPTION_KEY"
        secret_name = "encryption-key"
      }
      env {
        name  = "CORS_ORIGIN"
        value = "https://${var.domain}"
      }
      env {
        name  = "ADMIN_ORIGIN"
        value = "https://admin.${var.domain}"
      }
      env {
        name  = "APP_URL"
        value = "https://${var.domain}"
      }
      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.main.connection_string
      }
      env {
        name  = "SMTP_HOST"
        value = "smtp.sendgrid.net"
      }
      env {
        name  = "SMTP_PORT"
        value = "587"
      }
      env {
        name  = "SMTP_USER"
        value = "apikey"
      }
      env {
        name        = "SMTP_PASS"
        secret_name = "sendgrid-api-key"
      }
      env {
        name  = "SMTP_FROM"
        value = "noreply@${var.domain}"
      }
      env {
        name        = "GITHUB_CLIENT_ID"
        secret_name = "github-client-id"
      }
      env {
        name        = "GITHUB_CLIENT_SECRET"
        secret_name = "github-client-secret"
      }
      env {
        name        = "MICROSOFT_CLIENT_ID"
        secret_name = "microsoft-client-id"
      }
      env {
        name        = "MICROSOFT_CLIENT_SECRET"
        secret_name = "microsoft-client-secret"
      }
      env {
        name        = "GOOGLE_CLIENT_ID"
        secret_name = "google-client-id"
      }
      env {
        name        = "GOOGLE_CLIENT_SECRET"
        secret_name = "google-client-secret"
      }
      env {
        name        = "GITHUB_APP_ID"
        secret_name = "github-app-id"
      }
      env {
        name        = "GITHUB_APP_CLIENT_ID"
        secret_name = "github-app-client-id"
      }
      env {
        name        = "GITHUB_APP_CLIENT_SECRET"
        secret_name = "github-app-client-secret"
      }
      env {
        name        = "GITHUB_WEBHOOK_SECRET"
        secret_name = "github-webhook-secret"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/api/health"
        port      = 3001
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/api/health"
        port      = 3001
      }
    }
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.db_connection_string.id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }
  secret {
    name                = "redis-url"
    key_vault_secret_id = azurerm_key_vault_secret.redis_connection_string.id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }
  secret {
    name                = "session-secret"
    key_vault_secret_id = azurerm_key_vault_secret.session_secret.id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }
  secret {
    name                = "encryption-key"
    key_vault_secret_id = azurerm_key_vault_secret.encryption_key.id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }
  secret {
    name  = "sendgrid-api-key"
    value = var.sendgrid_api_key
  }
  secret {
    name  = "github-client-id"
    value = var.github_client_id
  }
  secret {
    name  = "github-client-secret"
    value = var.github_client_secret
  }
  secret {
    name  = "microsoft-client-id"
    value = var.microsoft_client_id
  }
  secret {
    name  = "microsoft-client-secret"
    value = var.microsoft_client_secret
  }
  secret {
    name  = "google-client-id"
    value = var.google_client_id
  }
  secret {
    name  = "google-client-secret"
    value = var.google_client_secret
  }
  secret {
    name  = "github-app-id"
    value = var.github_app_id
  }
  secret {
    name  = "github-app-client-id"
    value = var.github_app_client_id
  }
  secret {
    name  = "github-app-client-secret"
    value = var.github_app_client_secret
  }
  secret {
    name  = "github-webhook-secret"
    value = var.github_webhook_secret
  }

  tags = local.tags
}

# ──────────────────────────────────────────────
# Web Container App (SPA)
# ──────────────────────────────────────────────

resource "azurerm_container_app" "web" {
  name                         = "ca-${var.project}-web"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Multiple"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_apps.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.container_apps.id
  }

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "web"
      image  = "${azurerm_container_registry.main.login_server}/web:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  tags = local.tags
}

# ──────────────────────────────────────────────
# Admin Container App (SPA)
# ──────────────────────────────────────────────

resource "azurerm_container_app" "admin" {
  name                         = "ca-${var.project}-admin"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Multiple"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_apps.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.container_apps.id
  }

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "admin"
      image  = "${azurerm_container_registry.main.login_server}/admin:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  tags = local.tags
}
