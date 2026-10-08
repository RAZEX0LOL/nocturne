#!/bin/zsh
# Выкладка сайта на nl: сборка → rsync в /var/www/nocturne → проверка nginx.
#   site/deploy/deploy.sh            # обычная выкладка
#   site/deploy/deploy.sh --nginx    # ещё и конфиг nginx (первый раз или после правки deploy/nginx.conf)
# Хост — из ~/.ssh/config: nl, или nl-cf (через Cloudflare Tunnel), если IP недоступен.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${NOCTURNE_SITE_HOST:-nl}

bun install --frozen-lockfile
bun run build
rsync -az --delete dist/ "$HOST:/var/www/nocturne/"
if [[ "${1:-}" == "--nginx" ]]; then
  scp deploy/nginx.conf "$HOST:/etc/nginx/sites-available/nocturne.razex.online"
  ssh "$HOST" 'ln -sf /etc/nginx/sites-available/nocturne.razex.online /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx'
fi
echo "Готово: https://nocturne.razex.online"
