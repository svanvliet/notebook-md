# DNS Records for notebookmd.io

Configure these records in GoDaddy DNS management for the `notebookmd.io` domain.

## 1. Front Door Custom Domains

These point your custom domains to Azure Front Door. The `{fd-endpoint}` values come from `terraform output` after the initial `terraform apply`.

| Type  | Host              | Value                                              | TTL  |
|-------|-------------------|----------------------------------------------------|------|
| CNAME | `www`             | `{frontdoor_web_endpoint}` (e.g., `notebookmd-web-xxxxx.z01.azurefd.net`) | 3600 |
| CNAME | `api`             | `{frontdoor_api_endpoint}` (e.g., `notebookmd-api-xxxxx.z01.azurefd.net`) | 3600 |
| CNAME | `admin`           | `{frontdoor_admin_endpoint}` (e.g., `notebookmd-admin-xxxxx.z01.azurefd.net`) | 3600 |

> **Note:** GoDaddy forwards root domain (`@`) to `www.notebookmd.io`. Both `notebookmd.io` and `www.notebookmd.io` are configured as Front Door custom domains with managed TLS.

## 2. Front Door Domain Validation

These TXT records prove domain ownership to Azure. Values come from `terraform output domain_validation_*` after applying the custom domain resources.

| Type | Host                   | Value                            | TTL  |
|------|------------------------|----------------------------------|------|
| TXT  | `_dnsauth`             | `{domain_validation_web}`        | 3600 |
| TXT  | `_dnsauth.www`         | `{domain_validation_www}`        | 3600 |
| TXT  | `_dnsauth.api`         | `{domain_validation_api}`        | 3600 |
| TXT  | `_dnsauth.admin`       | `{domain_validation_admin}`      | 3600 |

## 3. SendGrid (Transactional Email)

Already configured — these records authenticate `noreply@notebookmd.io` for email delivery.

| Type  | Host             | Value                                          |
|-------|------------------|-------------------------------------------------|
| CNAME | `url7759`        | `sendgrid.net`                                  |
| CNAME | `60037778`       | `sendgrid.net`                                  |
| CNAME | `em7823`         | `u60037778.wl029.sendgrid.net`                  |
| CNAME | `s1._domainkey`  | `s1.domainkey.u60037778.wl029.sendgrid.net`     |
| CNAME | `s2._domainkey`  | `s2.domainkey.u60037778.wl029.sendgrid.net`     |

## 4. Email Authentication (SPF + DMARC)

| Type | Host     | Value                                                                                     |
|------|----------|-------------------------------------------------------------------------------------------|
| TXT  | `@`      | `v=spf1 include:sendgrid.net ~all`                                                        |
| TXT  | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;`       |

> The DMARC record is already configured. The SPF record should be added to authorize SendGrid as a legitimate sender for `notebookmd.io`.

## Setup Order

1. Run `terraform apply` to create Front Door resources and custom domains
2. Copy the `domain_validation_*` output values
3. Add all DNS records in GoDaddy (validation TXT records first)
4. Wait for DNS propagation (up to 48 hours, usually minutes)
5. Azure Front Door will automatically validate domains and provision managed TLS certificates
6. Verify: `curl -I https://notebookmd.io` should return a valid TLS response