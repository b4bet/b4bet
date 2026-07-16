# ============================================================================
# ENVIRONMENT SETUP SCRIPT FOR WINDOWS (PowerShell)
# ============================================================================
#
# This script helps you set up your environment variables securely on Windows.
# Run this after cloning the project to configure your local development.
#
# Usage: 
#   Right-click and select "Run with PowerShell"
#   OR
#   Open PowerShell and run: .\setup-env.ps1
#
# Note: You may need to enable script execution:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#
# ============================================================================

# Enable strict error handling
$ErrorActionPreference = "Stop"

# ============================================================================
# COLOR DEFINITIONS
# ============================================================================

$colors = @{
    'Red'    = 12
    'Green'  = 10
    'Yellow' = 14
    'Blue'   = 9
}

function Write-Color {
    param(
        [string]$Message,
        [string]$Color = 'White'
    )
    
    if ($colors.ContainsKey($Color)) {
        Write-Host $Message -ForegroundColor $Color
    } else {
        Write-Host $Message
    }
}

# ============================================================================
# WELCOME
# ============================================================================

Clear-Host
Write-Color "╔═══════════════════════════════════════════════════════════════════════╗" "Blue"
Write-Color "║          🔐 SECURE ENVIRONMENT SETUP SCRIPT (WINDOWS) 🔐            ║" "Blue"
Write-Color "╚═══════════════════════════════════════════════════════════════════════╝" "Blue"
Write-Host ""

# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

Write-Color "Checking prerequisites..." "Blue"
Write-Host ""

# Check if .env.local already exists
if (Test-Path ".env.local") {
    Write-Color "⚠️  .env.local already exists" "Yellow"
    $response = Read-Host "Do you want to overwrite it? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Keeping existing .env.local"
        exit 0
    }
}

# Check if .env.example exists
if (-not (Test-Path ".env.example")) {
    Write-Color "✗ .env.example not found" "Red"
    Write-Host "Please run this script from the project root directory"
    exit 1
}

Write-Color "✓ Prerequisites check passed" "Green"
Write-Host ""

# ============================================================================
# GATHER SUPABASE CREDENTIALS
# ============================================================================

Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Color "SUPABASE CONFIGURATION" "Blue"
Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Host ""
Write-Host "Get these from: https://app.supabase.com/project/_/settings/api"
Write-Host ""

$SUPABASE_URL = Read-Host "Enter your Supabase URL (e.g., https://xxx.supabase.co)"
if ([string]::IsNullOrEmpty($SUPABASE_URL)) {
    Write-Color "✗ Supabase URL is required" "Red"
    exit 1
}

$SUPABASE_ANON_KEY = Read-Host "Enter your Supabase Anon Key"
if ([string]::IsNullOrEmpty($SUPABASE_ANON_KEY)) {
    Write-Color "✗ Supabase Anon Key is required" "Red"
    exit 1
}

$SUPABASE_SERVICE_ROLE_KEY = Read-Host "Enter your Supabase Service Role Key (PRIVATE!)"
if ([string]::IsNullOrEmpty($SUPABASE_SERVICE_ROLE_KEY)) {
    Write-Color "✗ Supabase Service Role Key is required" "Red"
    exit 1
}

$SUPABASE_JWT_SECRET = Read-Host "Enter your Supabase JWT Secret"
if ([string]::IsNullOrEmpty($SUPABASE_JWT_SECRET)) {
    Write-Color "✗ Supabase JWT Secret is required" "Red"
    exit 1
}

Write-Color "✓ Supabase configuration saved" "Green"
Write-Host ""

# ============================================================================
# GATHER DATABASE CONFIGURATION
# ============================================================================

Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Color "DATABASE CONFIGURATION" "Blue"
Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Host ""
Write-Host "Use your Supabase database credentials (from the settings page)"
Write-Host ""

$DATABASE_HOST = Read-Host "Database Host (usually supabase host)"
if ([string]::IsNullOrEmpty($DATABASE_HOST)) {
    $DATABASE_HOST = $SUPABASE_URL
}

$DATABASE_PORT = Read-Host "Database Port (default 5432)"
if ([string]::IsNullOrEmpty($DATABASE_PORT)) {
    $DATABASE_PORT = "5432"
}

$DATABASE_NAME = Read-Host "Database Name (default postgres)"
if ([string]::IsNullOrEmpty($DATABASE_NAME)) {
    $DATABASE_NAME = "postgres"
}

$DATABASE_USER = Read-Host "Database User (default postgres)"
if ([string]::IsNullOrEmpty($DATABASE_USER)) {
    $DATABASE_USER = "postgres"
}

$DATABASE_PASSWORD = Read-Host "Database Password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($DATABASE_PASSWORD)
$DATABASE_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

if ([string]::IsNullOrEmpty($DATABASE_PASSWORD)) {
    Write-Color "✗ Database Password is required" "Red"
    exit 1
}

Write-Color "✓ Database configuration saved" "Green"
Write-Host ""

# ============================================================================
# OPTIONAL SETTINGS
# ============================================================================

Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Color "OPTIONAL SETTINGS" "Blue"
Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Host ""

$debug_response = Read-Host "Enable debug mode? (y/N)"
$DEBUG_MODE = if ($debug_response -eq 'y' -or $debug_response -eq 'Y') { "true" } else { "false" }

$rate_limit = Read-Host "API Rate Limit (default 100)"
$API_RATE_LIMIT = if ([string]::IsNullOrEmpty($rate_limit)) { "100" } else { $rate_limit }

Write-Color "✓ Optional settings configured" "Green"
Write-Host ""

# ============================================================================
# CREATE .env.local FILE
# ============================================================================

Write-Color "Creating .env.local file..." "Blue"
Write-Host ""

$envContent = @"
# ============================================================================
# LOCAL DEVELOPMENT ENVIRONMENT
# Generated by setup-env.ps1 on $(Get-Date)
# ============================================================================

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET=$SUPABASE_JWT_SECRET

# Database Configuration
DATABASE_HOST=$DATABASE_HOST
DATABASE_PORT=$DATABASE_PORT
DATABASE_NAME=$DATABASE_NAME
DATABASE_USER=$DATABASE_USER
DATABASE_PASSWORD=$DATABASE_PASSWORD

# Application Settings
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=http://localhost:3000/functions/v1

# Security Settings
DEBUG_MODE=$DEBUG_MODE
API_RATE_LIMIT=$API_RATE_LIMIT
MAX_BET_AMOUNT=1000000
MIN_BET_AMOUNT=100
MAX_BALANCE=10000000
SESSION_TIMEOUT=60

# ============================================================================
# IMPORTANT: This file contains secrets!
# - NEVER commit this file to git
# - NEVER share this file
# - Add .env.local to .gitignore
# ============================================================================
"@

Set-Content -Path ".env.local" -Value $envContent -Encoding UTF8
Write-Color "✓ .env.local created" "Green"
Write-Host ""

# ============================================================================
# VERIFY GITIGNORE
# ============================================================================

Write-Color "Verifying .gitignore..." "Blue"
Write-Host ""

if (Test-Path ".gitignore") {
    $gitignoreContent = Get-Content ".gitignore" -Raw
    if ($gitignoreContent -notmatch "\.env\.local") {
        Write-Color "⚠️  .env.local not in .gitignore" "Yellow"
        Write-Host "Adding .env.local to .gitignore..."
        Add-Content ".gitignore" "`n.env.local"
        Write-Color "✓ Updated .gitignore" "Green"
    } else {
        Write-Color "✓ .env.local already in .gitignore" "Green"
    }
} else {
    Write-Color "⚠️  .gitignore not found, creating..." "Yellow"
    Set-Content -Path ".gitignore" -Value ".env.local`n"
    Write-Color "✓ Created .gitignore" "Green"
}

Write-Host ""

# ============================================================================
# INSTALLATION & NEXT STEPS
# ============================================================================

Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Color "INSTALLATION & NEXT STEPS" "Blue"
Write-Color "═══════════════════════════════════════════════════════════════════════" "Blue"
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..."
    npm install
    Write-Host ""
}

Write-Color "✅ Environment setup complete!" "Green"
Write-Host ""
Write-Host "Next steps:"
Write-Host ""
Write-Host "1. 📚 Review your configuration:"
Write-Host "   Get-Content .env.local"
Write-Host ""
Write-Host "2. 🗄️  Set up Supabase locally (optional):"
Write-Host "   supabase start"
Write-Host ""
Write-Host "3. 🚀 Start the development server:"
Write-Host "   npm run dev"
Write-Host ""
Write-Host "4. 🌐 Open in browser:"
Write-Host "   http://localhost:3000"
Write-Host ""
Write-Host "5. 🔒 Verify security is working:"
Write-Host "   - Open DevTools (F12)"
Write-Host "   - Network tab: Check that bets go to /functions/v1/process-bet"
Write-Host "   - Console: No Math.random() calls should be logged"
Write-Host ""
Write-Color "⚠️  SECURITY REMINDERS:" "Yellow"
Write-Host ""
Write-Host "❌ NEVER commit .env.local to git"
Write-Host "❌ NEVER share your Service Role Key"
Write-Host "❌ NEVER push secrets to repositories"
Write-Host "✅ Rotate secrets every 90 days"
Write-Host "✅ Use different keys for dev/staging/production"
Write-Host "✅ Enable Supabase RLS policies"
Write-Host ""
Write-Color "Happy and Secure Coding! 🔐" "Green"
Write-Host ""

Read-Host "Press Enter to exit"
