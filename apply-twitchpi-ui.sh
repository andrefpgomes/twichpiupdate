#!/usr/bin/env bash
# Applies only the supplied static files. It does not modify server.py.
set -Eeuo pipefail

APP_DIR="/opt/twitch-pi"
WEB_DIR="$APP_DIR/web"
SERVICE="twitch-pi"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="$APP_DIR/backups"
BACKUP_DIR="$BACKUP_ROOT/ui-$STAMP"

fail() { printf 'Erro: %s\n' "$*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "Ficheiro obrigatório não encontrado: $1"; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Execute com sudo: sudo bash ./apply-twitchpi-ui.sh"
[[ -d "$APP_DIR" ]] || fail "Projeto não encontrado em $APP_DIR"
require_file "$APP_DIR/server.py"
require_file "$WEB_DIR/index.html"
require_file "$WEB_DIR/app.js"
require_file "$WEB_DIR/style.css"
require_file "$SOURCE_DIR/index.html"
require_file "$SOURCE_DIR/app.js"
require_file "$SOURCE_DIR/style.css"

echo 'A validar o backend antes da alteração…'
python3 -m py_compile "$APP_DIR/server.py"
for endpoint in /api/status /api/channel /api/start /api/stop /api/login; do
  grep -Fq "$endpoint" "$APP_DIR/server.py" || fail "Endpoint esperado ausente no server.py: $endpoint"
done
grep -Fq '"channel"' "$APP_DIR/server.py" || echo 'Aviso: não foi possível confirmar literalmente o campo JSON "channel"; reveja o server.py antes de continuar.'

mkdir -p "$BACKUP_ROOT"
cp -a "$WEB_DIR" "$BACKUP_DIR"
printf 'Backup criado em %s\n' "$BACKUP_DIR"

install -m 0644 "$SOURCE_DIR/index.html" "$WEB_DIR/index.html"
install -m 0644 "$SOURCE_DIR/app.js" "$WEB_DIR/app.js"
install -m 0644 "$SOURCE_DIR/style.css" "$WEB_DIR/style.css"

systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || {
  echo "O serviço não ficou ativo. A restaurar o frontend automaticamente…" >&2
  cp -a "$BACKUP_DIR/." "$WEB_DIR/"
  systemctl restart "$SERVICE" || true
  fail "Reversão automática concluída; consulte: journalctl -u $SERVICE -n 80 --no-pager"
}

echo 'Aplicação concluída. Teste no browser e confirme /api/status.'
echo "Para reverter: sudo cp -a '$BACKUP_DIR/.' '$WEB_DIR/' && sudo systemctl restart '$SERVICE'"
