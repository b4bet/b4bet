#!/bin/bash

# ============================================================================
# ENVIRONMENT SETUP SCRIPT
# ============================================================================
# 
# This script helps you set up your environment variables securely.
# Run this after cloning the project to configure your local development.
#
# Usage: ./setup-env.sh
#
# ============================================================================

set -e

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║          🔐 SECURE ENVIRONMENT SETUP SCRIPT 🔐                        ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local already exists${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env.local"
        exit 0
    fi
fi

# Check if .env.example exists
if [ ! -f ".env.example" ]; then
    echo -e "${RED}✗ .env.example not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# ============================================================================
# GATHER SUPABASE CREDENTIALS
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SUPABASE CONFIGURATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Get these from: https://app.supabase.com/project/_/settings/api"
echo ""

read -p "Enter your Supabase URL (e.g., https://xxx.supabase.co): " SUPABASE_URL
if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}✗ Supabase URL is required${NC}"
    exit 1
fi

read -p "Enter your Supabase Anon Key: " SUPABASE_ANON_KEY
if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}✗ Supabase Anon Key is required${NC}"
    exit 1
fi

read -p "Enter your Supabase Service Role Key (PRIVATE!): " SUPABASE_SERVICE_ROLE_KEY
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}✗ Supabase Service Role Key is required${NC}"
    exit 1
fi

read -p "Enter your Supabase JWT Secret: " SUPABASE_JWT_SECRET
if [ -z "$SUPABASE_JWT_SECRET" ]; then
    echo -e "${RED}✗ Supabase JWT Secret is required${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Supabase configuration saved${NC}"
echo ""

# ============================================================================
# GATHER DATABASE CONFIGURATION
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}DATABASE CONFIGURATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Use your Supabase database credentials (from the settings page)"
echo ""

read -p "Database Host (usually supabase host): " DATABASE_HOST
DATABASE_HOST=${DATABASE_HOST:-$SUPABASE_URL}

read -p "Database Port (default 5432): " DATABASE_PORT
DATABASE_PORT=${DATABASE_PORT:-5432}

read -p "Database Name (default postgres): " DATABASE_NAME
DATABASE_NAME=${DATABASE_NAME:-postgres}

read -p "Database User (default postgres): " DATABASE_USER
DATABASE_USER=${DATABASE_USER:-postgres}

read -p "Database Password: " DATABASE_PASSWORD
if [ -z "$DATABASE_PASSWORD" ]; then
    echo -e "${RED}✗ Database Password is required${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Database configuration saved${NC}"
echo ""

# ============================================================================
# OPTIONAL SETTINGS
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}OPTIONAL SETTINGS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""

read -p "Enable debug mode? (y/N): " -n 1 -r
echo ""
DEBUG_MODE="false"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    DEBUG_MODE="true"
fi

read -p "API Rate Limit (default 100): " API_RATE_LIMIT
API_RATE_LIMIT=${API_RATE_LIMIT:-100}

echo -e "${GREEN}✓ Optional settings configured${NC}"
echo ""

# ============================================================================
# CREATE .env.local FILE
# ============================================================================

echo -e "${BLUE}Creating .env.local file...${NC}"
echo ""

cat > .env.local << EOF
# ============================================================================
# LOCAL DEVELOPMENT ENVIRONMENT
# Generated by setup-env.sh on $(date)
# ============================================================================

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}

# Database Configuration
DATABASE_HOST=${DATABASE_HOST}
DATABASE_PORT=${DATABASE_PORT}
DATABASE_NAME=${DATABASE_NAME}
DATABASE_USER=${DATABASE_USER}
DATABASE_PASSWORD=${DATABASE_PASSWORD}

# Application Settings
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=http://localhost:3000/functions/v1

# Security Settings
DEBUG_MODE=${DEBUG_MODE}
API_RATE_LIMIT=${API_RATE_LIMIT}
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
EOF

chmod 600 .env.local
echo -e "${GREEN}✓ .env.local created with restricted permissions (600)${NC}"
echo ""

# ============================================================================
# VERIFY GITIGNORE
# ============================================================================

echo -e "${BLUE}Verifying .gitignore...${NC}"
echo ""

if ! grep -q "\.env\.local" .gitignore 2>/dev/null; then
    echo -e "${YELLOW}⚠️  .env.local not in .gitignore${NC}"
    echo "Adding .env.local to .gitignore..."
    echo ".env.local" >> .gitignore
    echo -e "${GREEN}✓ Updated .gitignore${NC}"
else
    echo -e "${GREEN}✓ .env.local already in .gitignore${NC}"
fi

echo ""

# ============================================================================
# INSTALLATION & NEXT STEPS
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}INSTALLATION & NEXT STEPS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if packages were installed
if [ ! -f "package-lock.json" ] && [ ! -f "yarn.lock" ]; then
    echo -e "${YELLOW}⚠️  No lock file found. Run:${NC}"
    echo "   npm install"
    echo ""
fi

echo -e "${GREEN}✅ Environment setup complete!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. 📚 Review your configuration:"
echo "   cat .env.local"
echo ""
echo "2. 🗄️  Set up Supabase locally (optional):"
echo "   supabase start"
echo ""
echo "3. 🚀 Start the development server:"
echo "   npm run dev"
echo ""
echo "4. 🌐 Open in browser:"
echo "   http://localhost:3000"
echo ""
echo "5. 🔒 Verify security is working:"
echo "   - Open DevTools (F12)"
echo "   - Network tab: Check that bets go to /functions/v1/process-bet"
echo "   - Console: No Math.random() calls should be logged"
echo ""
echo -e "${YELLOW}⚠️  SECURITY REMINDERS:${NC}"
echo ""
echo "❌ NEVER commit .env.local to git"
echo "❌ NEVER share your Service Role Key"
echo "❌ NEVER push secrets to repositories"
echo "✅ Rotate secrets every 90 days"
echo "✅ Use different keys for dev/staging/production"
echo "✅ Enable Supabase RLS policies"
echo ""
echo -e "${GREEN}Happy and Secure Coding! 🔐${NC}"
echo ""
