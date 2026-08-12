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
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull origin "$BRANCH"
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

echo "==> Starting PostgreSQL via Docker Compose..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && docker compose up -d postgres"

echo "==> Waiting for PostgreSQL..."
for i in {1..30}; do
  if sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && docker compose exec -T postgres pg_isready -U msh_erp -d msh_erp" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Running Prisma migrations..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run db:generate && npm run db:push"

echo "==> Configuring nginx..."
install -m 644 "$APP_DIR/deploy/nginx/msh-erp.conf" /etc/nginx/sites-available/msh-erp
sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/msh-erp
ln -sf /etc/nginx/sites-available/msh-erp /etc/nginx/sites-enabled/msh-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Installing systemd service..."
install -m 644 "$APP_DIR/deploy/systemd/msh-erp-api.service" /etc/systemd/system/msh-erp-api.service
systemctl daemon-reload
systemctl enable msh-erp-api
systemctl restart msh-erp-api

echo "==> Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "==> Bootstrap complete!"
echo "    API health:  http://$DOMAIN/api/health"
echo "    App dir:     $APP_DIR"
echo "    Logs:        journalctl -u msh-erp-api -f"
echo ""
echo "Next steps:"
echo "  1. Add your SSH public key for user '$APP_USER':"
echo "       ssh-copy-id $APP_USER@$DOMAIN"
echo "  2. In Cursor: connect via Remote SSH to $APP_USER@$DOMAIN"
echo "  3. Open folder: $APP_DIR"
echo "  4. Run dev server: cd $APP_DIR && npm run dev"
