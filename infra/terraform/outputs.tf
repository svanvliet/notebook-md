# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────

output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "postgresql_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "redis_hostname" {
  value = azurerm_redis_cache.main.hostname
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}

output "container_app_api_fqdn" {
  value = azurerm_container_app.api.ingress[0].fqdn
}

output "container_app_web_fqdn" {
  value = azurerm_container_app.web.ingress[0].fqdn
}

output "container_app_admin_fqdn" {
  value = azurerm_container_app.admin.ingress[0].fqdn
}

output "frontdoor_web_endpoint" {
  value = azurerm_cdn_frontdoor_endpoint.web.host_name
}

output "frontdoor_api_endpoint" {
  value = azurerm_cdn_frontdoor_endpoint.api.host_name
}

output "frontdoor_admin_endpoint" {
  value = azurerm_cdn_frontdoor_endpoint.admin.host_name
}

output "app_insights_connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.main.id
}

# Domain validation tokens — add these as TXT records in GoDaddy
output "domain_validation_web" {
  value       = azurerm_cdn_frontdoor_custom_domain.web.validation_token
  description = "TXT record value for _dnsauth.notebookmd.io"
}

output "domain_validation_api" {
  value       = azurerm_cdn_frontdoor_custom_domain.api.validation_token
  description = "TXT record value for _dnsauth.api.notebookmd.io"
}

output "domain_validation_admin" {
  value       = azurerm_cdn_frontdoor_custom_domain.admin.validation_token
  description = "TXT record value for _dnsauth.admin.notebookmd.io"
}
