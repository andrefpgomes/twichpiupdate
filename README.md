# Atualização segura da interface TwitchPi

Esta pasta contém uma substituição do frontend para os endpoints que constavam do código fornecido:

- `GET /api/status`
- `POST /api/channel` com `{ "channel": "…" }`
- `GET /api/start`, `GET /api/stop` e `GET /api/login`

O frontend não adiciona endpoints nem altera `server.py` ou a autenticação. Assume que as respostas dos endpoints de estado/controlo têm `channel` e `status`, sendo `status: "playing"` o estado ativo — exatamente como no frontend anterior.

## O que foi melhorado

- Interface responsiva, acessível e sem recursos externos, com marca TwitchPi e ícones SVG consistentes.
- Mensagens distintas para carregamento, erro de rede, timeout, resposta JSON inválida e êxito.
- Apenas um ciclo de estado a cada 15 segundos; nunca existem pedidos de estado sobrepostos. Enquanto uma ação decorre, não é feito polling.
- Botões e campo ficam temporariamente bloqueados durante operações, eliminando cliques e pedidos duplicados.
- Cada ação usa diretamente o estado devolvido pelo backend, sem originar uma consulta de estado extra.
- Timeout de 12 segundos no browser para impedir uma interface aparentemente bloqueada quando a Raspberry Pi deixa de responder.

## Aplicação na Raspberry Pi

O login não é alterado: o botão continua a abrir a página de login Twitch no Chromium da Raspberry Pi.

### A partir da GitHub

Depois de enviar os cinco ficheiros desta pasta para a raiz do repositório `andrefpgomes/twichpiupdate`, execute na Raspberry Pi:

```bash
sudo apt-get update
sudo apt-get install -y git

UPDATE_ROOT="$(mktemp -d /tmp/twitchpi-update.XXXXXX)"
git clone --depth 1 https://github.com/andrefpgomes/twichpiupdate.git "$UPDATE_ROOT/twichpiupdate"

cd "$UPDATE_ROOT/twichpiupdate"
sudo bash ./apply-twitchpi-ui.sh

sudo systemctl status twitch-pi --no-pager -l
```

### Validação antes de aplicar

1. Antes de avançar, inspecione as rotas e o formato de resposta:

   ```bash
   sudo sed -n '1,260p' /opt/twitch-pi/server.py
   sudo grep -nE '/api/(status|channel|start|stop|login)|channel|status' /opt/twitch-pi/server.py
   ```

   Confirme os cinco endpoints, o `POST` JSON de `/api/channel` e os campos `channel`/`status` usados nas respostas. Se diferirem, não aplique ainda: adapte somente `app.js` à API real.

2. Aplique e valide. O script compila o `server.py`, confirma as rotas, cria um backup completo de `web/`, instala apenas os três ficheiros estáticos e reinicia o serviço. Se o serviço não ficar ativo, restaura automaticamente o frontend anterior.

   ```bash
   cd "$UPDATE_ROOT/twichpiupdate"
   sudo bash ./apply-twitchpi-ui.sh
   sudo systemctl status twitch-pi --no-pager -l
   curl -fsS http://127.0.0.1:<PORTA-REAL>/api/status
   ```

   Substitua `<PORTA-REAL>` pela porta que o `server.py` realmente usa. Não use uma porta assumida.

3. No browser, teste: selecionar canal; iniciar; parar; reabrir; login; desligar/religar temporariamente a rede. Confirme também que duplos cliques não iniciam duas ações.

## Reverter

O script apresenta o caminho exato do backup, por exemplo `/opt/twitch-pi/backups/ui-20261024-120000`. Para o restaurar:

```bash
sudo cp -a /opt/twitch-pi/backups/ui-AAAAMMDD-HHMMSS/. /opt/twitch-pi/web/
sudo systemctl restart twitch-pi
sudo systemctl is-active twitch-pi
```

Substitua `ui-AAAAMMDD-HHMMSS` pelo diretório impresso pelo script. O backup preserva os ficheiros estáticos anteriores e nenhuma alteração é feita ao backend.

## Riscos que ainda exigem confirmação no equipamento

Não havia cópia local de `/opt/twitch-pi` nem `server.py` disponível neste espaço de trabalho. Por isso não foi possível confirmar métodos HTTP, porta, formato JSON ou comportamento de autenticação no backend real. O script falha antes de escrever se as rotas esperadas não aparecerem no `server.py`; a inspeção manual acima continua necessária antes da instalação.
