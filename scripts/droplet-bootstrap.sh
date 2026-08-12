#!/usr/bin/env bash
# Bootstrap MSH ERP development on a DigitalOcean droplet (Ubuntu 22.04/24.04).
# Run on the droplet as root or with sudo:
#   curl -fsSL https://raw.githubusercontent.com/amzhuwao/msh-erp/main/scripts/droplet-bootstrap.sh | bash
# Or after cloning:
#   sudo bash scripts/droplet-bootstrap.sh

set -euo pipefail

APP_USER="${APP_USER:-mshdev}"
APP_DIR="${APP_DIR:-/opt/msh-erp}"
REPO_URL="${REPO_URL:-https://github.com/amzhuwao/msh-erp.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-209.38.225.150}"

echo "==> MSH ERP droplet bootstrap"
echo "    App user:  $APP_USER"
echo "    App dir:   $APP_DIR"
echo "    Domain/IP: $DOMAIN"

export DEBIAN_FRONTEND=noninteractive

echo "==> Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl git ufw nginx \
  build-essential

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG docker "$APP_USER"
fi

echo "==> Cloning or updating repository..."
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull origin "$BRANCH"
elif [[ ! -d "$APP_DIR" ]] || [[ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
else
  echo "    Using existing files in $APP_DIR (no .git directory)"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

echo "==> Setting up environment file..."
if [[ ! -f "$APP_DIR/apps/api/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/apps/api/.env"
  # Generate a random postgres password
  POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  sed -i "s/changeme/$POSTGRES_PASSWORD/g" "$APP_DIR/apps/api/.env"
  cp "$APP_DIR/apps/api/.env" "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/apps/api/.env" "$APP_DIR/.env"
  echo "    Generated POSTGRES_PASSWORD (saved in $APP_DIR/.env)"
fi

echo "==> Installing npm dependencies..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm install"

API_PORT="${API_PORT:-3003}"
USE_NATIVE_PG=false

if ss -tlnp 2>/dev/null | grep -q ':5432 '; then
  echo "==> Using existing native PostgreSQL on port 5432..."
  USE_NATIVE_PG=true
  DB_PASS="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='msh_erp'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER msh_erp WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='msh_erp'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE msh_erp OWNER msh_erp;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE msh_erp TO msh_erp;"
  cat > "$APP_DIR/apps/api/.env" <<EOF
NODE_ENV=development
PORT=$API_PORT
HOST=127.0.0.1
DATABASE_URL=postgresql://msh_erp:${DB_PASS}@127.0.0.1:5432/msh_erp?schema=public
EOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/apps/api/.env"
else
  echo "==> Starting PostgreSQL via Docker Compose..."
  sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && docker compose up -d postgres"
  echo "==> Waiting for PostgreSQL..."
  for i in {1..30}; do
    if sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && docker compose exec -T postgres pg_isready -U msh_erp -d msh_erp" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

echo "==> Running Prisma migrations..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run db:generate && npm run db:push"

echo "==> Building API..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run build"

echo "==> Starting API with PM2 on port $API_PORT..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/apps/api' && pm2 delete msh-erp-api 2>/dev/null || true"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/apps/api' && pm2 start dist/index.js --name msh-erp-api"
sudo -u "$APP_USER" pm2 save 2>/dev/null || true

echo "==> Configuring nginx..."
if [[ -f /etc/nginx/sites-available/efundo ]]; then
  NGINX=/etc/nginx/sites-available/efundo
  if ! grep -q 'location /msh-erp/' "$NGINX"; then
    cp "$NGINX" "${NGINX}.bak.$(date +%s)"
    python3 - "$API_PORT" <<'PY'
import sys
from pathlib import Path
port = sys.argv[1]
p = Path("/etc/nginx/sites-available/efundo")
text = p.read_text()
block = f"""
    # MSH ERP API
    location /msh-erp/ {{
        proxy_pass http://127.0.0.1:{port}/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

"""
marker = "    location /api/ {"
if marker in text:
    p.write_text(text.replace(marker, block + marker, 1))
PY
  fi
else
  install -m 644 "$APP_DIR/deploy/nginx/msh-erp.conf" /etc/nginx/sites-available/msh-erp
  sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/msh-erp
  sed -i "s/127.0.0.1:3000/127.0.0.1:$API_PORT/g" /etc/nginx/sites-available/msh-erp
  ln -sf /etc/nginx/sites-available/msh-erp /etc/nginx/sites-enabled/msh-erp
fi
nginx -t
systemctl reload nginx

echo "==> Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "==> Bootstrap complete!"
echo "    API health:  https://$DOMAIN/msh-erp/api/health"
echo "    App dir:     $APP_DIR"
echo "    Logs:        sudo -u $APP_USER pm2 logs msh-erp-api"
echo ""
echo "Next steps:"
echo "  1. Add your SSH public key for user '$APP_USER':"
echo "       ssh-copy-id $APP_USER@$DOMAIN"
echo "  2. In Cursor: connect via Remote SSH to $APP_USER@$DOMAIN"
echo "  3. Open folder: $APP_DIR"
echo "  4. Run dev server: cd $APP_DIR && npm run dev"
