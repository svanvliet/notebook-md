# ──────────────────────────────────────────────
# Azure Front Door (Standard tier)
# ──────────────────────────────────────────────

resource "azurerm_cdn_frontdoor_profile" "main" {
  name                = "fd-${var.project}-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  sku_name            = "Standard_AzureFrontDoor"

  tags = local.tags
}

# ── Endpoints ──

resource "azurerm_cdn_frontdoor_endpoint" "web" {
  name                     = "${var.project}-web"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
}

resource "azurerm_cdn_frontdoor_endpoint" "api" {
  name                     = "${var.project}-api"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
}

resource "azurerm_cdn_frontdoor_endpoint" "admin" {
  name                     = "${var.project}-admin"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
}

# ── Origin Groups ──

resource "azurerm_cdn_frontdoor_origin_group" "web" {
  name                     = "og-web"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  session_affinity_enabled = false

  health_probe {
    interval_in_seconds = 60
    path                = "/"
    protocol            = "Https"
    request_type        = "HEAD"
  }

  load_balancing {}
}

resource "azurerm_cdn_frontdoor_origin_group" "api" {
  name                     = "og-api"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  session_affinity_enabled = false

  health_probe {
    interval_in_seconds = 30
    path                = "/api/health"
    protocol            = "Https"
    request_type        = "GET"
  }

  load_balancing {}
}

resource "azurerm_cdn_frontdoor_origin_group" "admin" {
  name                     = "og-admin"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  session_affinity_enabled = false

  health_probe {
    interval_in_seconds = 60
    path                = "/"
    protocol            = "Https"
    request_type        = "HEAD"
  }

  load_balancing {}
}

resource "azurerm_cdn_frontdoor_origin_group" "collab" {
  name                     = "og-collab"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  session_affinity_enabled = true

  load_balancing {}
}

# ── Origins ──

resource "azurerm_cdn_frontdoor_origin" "web" {
  name                          = "origin-web"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.web.id
  enabled                       = true
  host_name                     = azurerm_container_app.web.ingress[0].fqdn
  origin_host_header            = azurerm_container_app.web.ingress[0].fqdn
  http_port                     = 80
  https_port                    = 443
  certificate_name_check_enabled = true
}

resource "azurerm_cdn_frontdoor_origin" "api" {
  name                          = "origin-api"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.api.id
  enabled                       = true
  host_name                     = azurerm_container_app.api.ingress[0].fqdn
  origin_host_header            = azurerm_container_app.api.ingress[0].fqdn
  http_port                     = 80
  https_port                    = 443
  certificate_name_check_enabled = true
}

resource "azurerm_cdn_frontdoor_origin" "admin" {
  name                          = "origin-admin"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.admin.id
  enabled                       = true
  host_name                     = azurerm_container_app.admin.ingress[0].fqdn
  origin_host_header            = azurerm_container_app.admin.ingress[0].fqdn
  http_port                     = 80
  https_port                    = 443
  certificate_name_check_enabled = true
}

resource "azurerm_cdn_frontdoor_origin" "collab" {
  name                          = "origin-collab"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.collab.id
  enabled                       = true
  host_name                     = azurerm_container_app.collab.ingress[0].fqdn
  origin_host_header            = azurerm_container_app.collab.ingress[0].fqdn
  http_port                     = 80
  https_port                    = 443
  certificate_name_check_enabled = true
}

# ── Routes ──
# Collab route on API endpoint — /collab/* is more specific than API catch-all /*
resource "azurerm_cdn_frontdoor_route" "collab" {
  name                          = "route-collab"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.api.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.collab.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.collab.id]
  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.api.id]
  patterns_to_match             = ["/collab", "/collab/*"]
  supported_protocols           = ["Http", "Https"]
  https_redirect_enabled        = true
  forwarding_protocol           = "HttpsOnly"
}

resource "azurerm_cdn_frontdoor_route" "web" {
  name                          = "route-web"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.web.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.web.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.web.id]
  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.web.id, azurerm_cdn_frontdoor_custom_domain.www.id]
  patterns_to_match             = ["/*"]
  supported_protocols           = ["Http", "Https"]
  https_redirect_enabled        = true
  forwarding_protocol           = "HttpsOnly"
}

resource "azurerm_cdn_frontdoor_route" "api" {
  name                          = "route-api"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.api.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.api.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.api.id]
  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.api.id]
  patterns_to_match             = ["/*"]
  supported_protocols           = ["Http", "Https"]
  https_redirect_enabled        = true
  forwarding_protocol           = "HttpsOnly"
}

resource "azurerm_cdn_frontdoor_route" "admin" {
  name                          = "route-admin"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.admin.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.admin.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.admin.id]
  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.admin.id]
  patterns_to_match             = ["/*"]
  supported_protocols           = ["Http", "Https"]
  https_redirect_enabled        = true
  forwarding_protocol           = "HttpsOnly"
}

# ── Custom Domains ──
# Requires CNAME/TXT records in GoDaddy pointing to the Front Door endpoint.
# See infra/dns-records.md for the full list of records to create.

resource "azurerm_cdn_frontdoor_custom_domain" "web" {
  name                     = "domain-web"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  host_name                = var.domain

  tls {
    certificate_type = "ManagedCertificate"
  }
}

resource "azurerm_cdn_frontdoor_custom_domain" "api" {
  name                     = "domain-api"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  host_name                = "api.${var.domain}"

  tls {
    certificate_type = "ManagedCertificate"
  }
}

resource "azurerm_cdn_frontdoor_custom_domain" "www" {
  name                     = "domain-www"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  host_name                = "www.${var.domain}"

  tls {
    certificate_type = "ManagedCertificate"
  }
}

resource "azurerm_cdn_frontdoor_custom_domain" "admin" {
  name                     = "domain-admin"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.main.id
  host_name                = "admin.${var.domain}"

  tls {
    certificate_type = "ManagedCertificate"
  }
}

# ── Custom Domain Associations (link domains to routes) ──

resource "azurerm_cdn_frontdoor_custom_domain_association" "web" {
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.web.id
  cdn_frontdoor_route_ids        = [azurerm_cdn_frontdoor_route.web.id]
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "www" {
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.www.id
  cdn_frontdoor_route_ids        = [azurerm_cdn_frontdoor_route.web.id]
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "api" {
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.api.id
  cdn_frontdoor_route_ids        = [azurerm_cdn_frontdoor_route.api.id, azurerm_cdn_frontdoor_route.collab.id]
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "admin" {
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.admin.id
  cdn_frontdoor_route_ids        = [azurerm_cdn_frontdoor_route.admin.id]
}
