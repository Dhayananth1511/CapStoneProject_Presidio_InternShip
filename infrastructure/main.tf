# ============================================================
# infrastructure/main.tf
#
# Provisions ALL AWS resources for Travel Planner AI:
#   - Security Group (EC2 firewall)
#   - IAM Role + Instance Profile (EC2 reads SSM secrets + writes CloudWatch)
#   - EC2 t2.micro (runs Docker containers — free tier)
#   - Elastic IP (fixed public IP for EC2)
#   - SSM Parameter Store (encrypted secrets storage)
#   - S3 Bucket (hosts React frontend static files)
#   - CloudFront Distribution (HTTPS CDN in front of S3)
#   - CloudWatch Log Group (collected API logs)
#
# HOW TO USE:
#   cd infrastructure
#   terraform init
#   terraform plan -var-file="terraform.tfvars"
#   terraform apply -var-file="terraform.tfvars"
# ============================================================

# ── Provider ─────────────────────────────────────────────────
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region
  # Credentials come from env vars: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
  # Set these in PowerShell before running terraform:
  #   $env:AWS_ACCESS_KEY_ID = "..."
  #   $env:AWS_SECRET_ACCESS_KEY = "..."
}

# ── Random suffix for unique S3 bucket name ──────────────────
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# ── Current AWS Account Info (used for IAM policy ARNs) ──────
data "aws_caller_identity" "current" {}

# ── Your current public IP (for SSH security group rule) ─────
data "http" "my_ip" {
  url = "https://checkip.amazonaws.com"
}

locals {
  my_ip_cidr = "${chomp(data.http.my_ip.response_body)}/32"
}

# ============================================================
# SECTION 1: SECURITY GROUP (EC2 Firewall)
# ============================================================
resource "aws_security_group" "api_sg" {
  name        = "${var.project_name}-api-sg"
  description = "Security group for Travel Planner API EC2 instance"

  # SSH — ONLY from your current IP (cloud security best practice)
  ingress {
    description = "SSH from developer IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [local.my_ip_cidr]
  }

  # HTTP — public (CloudFront/users access)
  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # API port — public (React frontend calls this)
  ingress {
    description = "API port from anywhere"
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound traffic allowed (EC2 needs to pull Docker images, call APIs)
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-api-sg"
    Project = var.project_name
  }
}

# ============================================================
# SECTION 2: IAM ROLE (EC2 can read SSM + write CloudWatch)
# ============================================================

# The role itself — says "EC2 instances can assume this role"
resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-ec2-role"
    Project = var.project_name
  }
}

# Attach SSM read permission — EC2 fetches secrets at startup
resource "aws_iam_role_policy_attachment" "ssm_read" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
}

# Attach CloudWatch logs permission — EC2 sends app logs to CloudWatch
resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# Instance profile — wraps the role so EC2 can use it
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# ============================================================
# SECTION 3: SSM PARAMETER STORE (Encrypted Secrets)
# Why: Secrets never touch disk as plaintext.
#      EC2 reads them at startup using its IAM role.
# ============================================================

resource "aws_ssm_parameter" "mongo_uri" {
  name        = "/${var.project_name}/MONGO_URI"
  type        = "SecureString"   # Encrypted with AWS KMS
  value       = var.mongo_uri
  description = "MongoDB Atlas connection string"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "groq_api_key" {
  name        = "/${var.project_name}/GROQ_API_KEY"
  type        = "SecureString"
  value       = var.groq_api_key
  description = "Groq LLM API key"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "jwt_access_secret" {
  name        = "/${var.project_name}/JWT_ACCESS_SECRET"
  type        = "SecureString"
  value       = var.jwt_access_secret
  description = "JWT access token signing secret"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "jwt_refresh_secret" {
  name        = "/${var.project_name}/JWT_REFRESH_SECRET"
  type        = "SecureString"
  value       = var.jwt_refresh_secret
  description = "JWT refresh token signing secret"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "google_maps_api_key" {
  name        = "/${var.project_name}/GOOGLE_MAPS_API_KEY"
  type        = "SecureString"
  value       = var.google_maps_key
  description = "Google Maps / Places API key"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "port" {
  name        = "/${var.project_name}/PORT"
  type        = "String"
  value       = tostring(var.port)
  description = "Backend port"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "jwt_access_expires" {
  name        = "/${var.project_name}/JWT_ACCESS_EXPIRES"
  type        = "String"
  value       = var.jwt_access_expires
  description = "JWT access expiration"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "jwt_refresh_expires" {
  name        = "/${var.project_name}/JWT_REFRESH_EXPIRES"
  type        = "String"
  value       = var.jwt_refresh_expires
  description = "JWT refresh expiration"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "hotelbeds_api_key" {
  name        = "/${var.project_name}/HOTELBEDS_API_KEY"
  type        = "SecureString"
  value       = var.hotelbeds_api_key
  description = "Hotelbeds API Key"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "hotelbeds_api_secret" {
  name        = "/${var.project_name}/HOTELBEDS_API_SECRET"
  type        = "SecureString"
  value       = var.hotelbeds_api_secret
  description = "Hotelbeds API Secret"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "hotelbeds_base_url" {
  name        = "/${var.project_name}/HOTELBEDS_BASE_URL"
  type        = "String"
  value       = var.hotelbeds_base_url
  description = "Hotelbeds API Base URL"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "activity_api_key" {
  name        = "/${var.project_name}/ACTIVITY_API_KEY"
  type        = "SecureString"
  value       = var.activity_api_key
  description = "Activity API Key"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "transfers_api_key" {
  name        = "/${var.project_name}/TRANSFERS_API_KEY"
  type        = "SecureString"
  value       = var.transfers_api_key
  description = "Transfers API Key"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "google_calendar_client_id" {
  name        = "/${var.project_name}/GOOGLE_CALENDAR_CLIENT_ID"
  type        = "SecureString"
  value       = var.google_calendar_client_id
  description = "Google Calendar Client ID"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "google_calendar_client_secret" {
  name        = "/${var.project_name}/GOOGLE_CALENDAR_CLIENT_SECRET"
  type        = "SecureString"
  value       = var.google_calendar_client_secret
  description = "Google Calendar Client Secret"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "google_calendar_redirect_uri" {
  name        = "/${var.project_name}/GOOGLE_CALENDAR_REDIRECT_URI"
  type        = "String"
  value       = var.google_calendar_redirect_uri
  description = "Google Calendar Redirect URI"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "aviationstack_api_key" {
  name        = "/${var.project_name}/AVIATIONSTACK_API_KEY"
  type        = "SecureString"
  value       = var.aviationstack_api_key
  description = "AviationStack API Key"
  tags        = { Project = var.project_name }
}

resource "aws_ssm_parameter" "openweather_api_key" {
  name        = "/${var.project_name}/OPENWEATHER_API_KEY"
  type        = "SecureString"
  value       = var.openweather_api_key
  description = "OpenWeather API Key"
  tags        = { Project = var.project_name }
}

# CLIENT_URL is dynamically set using the CloudFront domain name to prevent CORS issues
resource "aws_ssm_parameter" "client_url" {
  name        = "/${var.project_name}/CLIENT_URL"
  type        = "String"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
  description = "CloudFront URL for React CORS CLIENT_URL whitelisting"
  tags        = { Project = var.project_name }
}


# ============================================================
# SECTION 4: EC2 INSTANCE
# t2.micro = Free tier (750 hrs/month for 12 months)
# Amazon Linux 2023 — current, actively maintained
# ============================================================

# Look up the latest Amazon Linux 2023 AMI automatically
# (avoids hardcoding an AMI ID that might be region-specific or outdated)
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "api" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.micro"          # FREE TIER
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.api_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  # Root volume: gp3 SSD (free tier: up to 30GB)
  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true    # Encrypt at rest — cloud security best practice
  }

  # user_data runs ONCE on first boot automatically
  # Installs Docker, Docker Compose, places the compose file, starts containers
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    dockerhub_username  = var.dockerhub_username
    project_name        = var.project_name
    aws_region          = var.aws_region
  }))

  # Apply tags
  tags = {
    Name    = "${var.project_name}-api"
    Project = var.project_name
  }

  # Replace instance cleanly if user_data changes
  lifecycle {
    create_before_destroy = true
  }
}

# ── Elastic IP — Fixed public IP for EC2 ─────────────────────
# Without this, EC2's public IP changes on every restart.
# Elastic IP is FREE while attached to a running instance.
resource "aws_eip" "api_eip" {
  instance = aws_instance.api.id
  domain   = "vpc"

  tags = {
    Name    = "${var.project_name}-eip"
    Project = var.project_name
  }

  # Must be created AFTER instance
  depends_on = [aws_instance.api]
}

# ============================================================
# SECTION 5: S3 BUCKET (React Frontend Static Hosting)
# ============================================================

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend-${random_id.bucket_suffix.hex}"

  # Prevent accidental deletion if bucket has files
  force_destroy = false

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
  }
}

# Disable public block — CloudFront needs to read these files
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Bucket policy — allow public GET (CloudFront + users read files)
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })

  # Must wait for public access block to be disabled first
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Website configuration — serves index.html for all routes (SPA)
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  # SPA fallback — unknown URIs return index.html for React Router
  error_document {
    key = "index.html"
  }
}

# ============================================================
# SECTION 6: CLOUDFRONT DISTRIBUTION
# HTTPS CDN in front of S3 — gives HTTPS for free using
# CloudFront's default certificate
# ============================================================

resource "aws_cloudfront_distribution" "frontend" {
  # Origin 1 — S3 static frontend
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.frontend.bucket}"
  }

  # Origin 2 — EC2 API backend (port 5000)
  # CloudFront connects to EC2 over HTTP internally; CloudFront → browser is HTTPS.
  # This fixes the mixed-content block that occurs when the React SPA
  # (served over HTTPS from CloudFront) tries to call http://EC2:5000.
  origin {
    domain_name = aws_eip.api_eip.public_dns
    origin_id   = "EC2-API"

    custom_origin_config {
      http_port              = 5000
      https_port             = 443
      origin_protocol_policy = "http-only"  # EC2 speaks plain HTTP on port 5000
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.project_name} frontend CDN"

  # PriceClass_100 = only NA + Europe edge locations = cheapest
  price_class = "PriceClass_100"

  # ── /api/* → EC2 backend (ordered, evaluated before default) ──
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    target_origin_id = "EC2-API"

    # API must not be cached — every request must reach EC2
    allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods  = ["GET", "HEAD"]

    viewer_protocol_policy = "redirect-to-https"

    # Forward all headers + cookies so JWT auth (httpOnly cookies) works
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Content-Type", "Accept", "Cookie"]
      cookies { forward = "all" }
    }

    # Zero TTL — never cache API responses in CloudFront
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # ── Default: S3 React SPA ─────────────────────────────────────
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.bucket}"

    # Force HTTPS — redirect HTTP to HTTPS
    viewer_protocol_policy = "redirect-to-https"

    # Cache settings — Vite uses hashed filenames so caching is safe
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400    # 1 day
    max_ttl     = 31536000 # 1 year
  }

  # React Router fix — 403 from S3 → return index.html with 200
  # This handles when users visit /dashboard, /admin etc. directly
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  # No geo-restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Use CloudFront's default SSL cert — FREE (*.cloudfront.net domain)
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name    = "${var.project_name}-cf"
    Project = var.project_name
  }
}

# ============================================================
# SECTION 7: CLOUDWATCH LOG GROUP
# Stores API container logs — searchable in AWS Console
# ============================================================

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/travel-planner/api"
  retention_in_days = 7    # Keep logs for 7 days — free tier safe

  tags = {
    Project = var.project_name
  }
}
