variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus2"
}

variable "environment" {
  description = "Environment name (e.g., prod, staging)"
  type        = string
  default     = "prod"
}

variable "project" {
  description = "Project name used in resource naming"
  type        = string
  default     = "notebookmd"
}

variable "domain" {
  description = "Primary domain"
  type        = string
  default     = "notebookmd.io"
}

variable "db_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Session signing secret"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "32-byte encryption key for OAuth tokens"
  type        = string
  sensitive   = true
}

# OAuth credentials (set via tfvars or env)
variable "github_client_id" {
  type    = string
  default = ""
}
variable "github_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
variable "microsoft_client_id" {
  type    = string
  default = ""
}
variable "microsoft_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
variable "google_client_id" {
  type    = string
  default = ""
}
variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
variable "github_app_id" {
  type    = string
  default = ""
}
variable "github_app_client_id" {
  type    = string
  default = ""
}
variable "github_app_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
variable "github_app_private_key" {
  description = "GitHub App private key (PEM format, inline)"
  type        = string
  default     = ""
  sensitive   = true
}
variable "github_webhook_secret" {
  type      = string
  default   = ""
  sensitive = true
}
variable "sendgrid_api_key" {
  description = "SendGrid API key for transactional email"
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_email" {
  description = "Email address for monitoring alerts"
  type        = string
  default     = "alerts@notebookmd.io"
}

# ── AI Content Generation ─────────────────────────────────────────────────

variable "azure_ai_endpoint" {
  description = "Azure OpenAI resource endpoint (e.g., https://notebookmd-ai.openai.azure.com)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "azure_ai_api_key" {
  description = "Azure OpenAI API key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "azure_ai_model" {
  description = "Azure OpenAI deployment/model name"
  type        = string
  default     = "gpt-4.1-nano"
}

variable "ai_daily_generation_limit" {
  description = "Daily AI generation limit per free-tier user"
  type        = number
  default     = 10
}

variable "bing_search_api_key" {
  description = "Bing Search API key (legacy, falls back if Brave key not set)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "brave_search_api_key" {
  description = "Brave Search API key for web grounding in AI content generation"
  type        = string
  default     = ""
  sensitive   = true
}
