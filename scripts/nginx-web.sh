#!/usr/bin/env bash
# Add MSH ERP web UI nginx block to efundo config (port 3004)
set -euo pipefail

NGINX=/etc/nginx/sites-available/efundo
WEB_PORT="${WEB_PORT:-3004}"

if grep -q 'location /msh/' "$NGINX"; then
  echo "nginx /msh/ block already exists"
  exit 0
fi

cp "$NGINX" "${NGINX}.bak.web.$(date +%s)"

python3 - "$WEB_PORT" <<'PY'
import sys
from pathlib import Path
port = sys.argv[1]
p = Path("/etc/nginx/sites-available/efundo")
text = p.read_text()
block = f"""
    # MSH ERP Web UI
    location /msh/ {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

"""
marker = "    # MSH ERP API"
if marker in text:
    p.write_text(text.replace(marker, block + marker, 1))
    print("nginx web block inserted")
else:
    print("WARNING: could not find MSH ERP API marker")
PY

nginx -t && systemctl reload nginx
echo "Web UI available at https://<host>/msh/"
