(() => {
  'use strict';

  const POLL_INTERVAL_MS = 15000;
  const REQUEST_TIMEOUT_MS = 12000;
  const $ = (id) => document.getElementById(id);
  const elements = {
    channel: $('channel'),
    status: $('status'),
    online: $('online'),
    playState: $('playState'),
    playStateText: $('playStateText'),
    controlMessage: $('controlMessage'),
    channelMessage: $('channelMessage'),
    loginNotice: $('loginNotice'),
    channelInput: $('channelInput'),
    channelForm: $('channelForm'),
    start: $('startBtn'),
    stop: $('stopBtn'),
    reload: $('reloadBtn'),
    select: $('openBtn'),
    login: $('loginBtn')
  };

  let refreshTimer = null;
  let refreshInFlight = false;
  let actionInFlight = false;

  class ApiError extends Error {
    constructor(message, { status = 0, isNetworkError = false } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.isNetworkError = isNetworkError;
    }
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(path, {
        ...options,
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        signal: controller.signal
      });
      const raw = await response.text();
      let payload = {};

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (_) {
          throw new ApiError('Resposta inválida do servidor.', { status: response.status });
        }
      }
      if (!response.ok) {
        throw new ApiError(payload.error || payload.message || `Pedido recusado (${response.status}).`, {
          status: response.status
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const timedOut = error && error.name === 'AbortError';
      throw new ApiError(
        timedOut ? 'O pedido demorou demasiado tempo. Tente novamente.' : 'Sem ligação à Raspberry Pi.',
        { isNetworkError: true }
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function setConnection(mode) {
    const label = elements.online.querySelector('.connection-label');
    elements.online.className = `connection connection--${mode}`;
    label.textContent = mode === 'online' ? 'Raspberry Pi online' : mode === 'checking' ? 'A verificar ligação' : 'Raspberry Pi indisponível';
  }

  function showNotice(element, message, kind = '') {
    element.textContent = message || '';
    element.className = `${element.id === 'loginNotice' ? 'notice notice--login' : element.id === 'channelMessage' ? 'field-message' : 'notice'}${kind ? ` ${kind}` : ''}`;
    if (element.id === 'loginNotice') element.hidden = !message;
  }

  function render(state) {
    const isPlaying = state && state.status === 'playing';
    const channel = state && typeof state.channel === 'string' ? state.channel.trim() : '';
    elements.channel.textContent = channel || 'Nenhum canal selecionado';
    elements.status.textContent = isPlaying ? 'A visualização está ativa nesta Raspberry Pi.' : 'A visualização está parada. Escolha um canal e inicie quando quiser.';
    elements.playState.className = `state ${isPlaying ? 'state--playing' : 'state--idle'}`;
    elements.playStateText.textContent = isPlaying ? 'A ver live' : 'Parada';
    setConnection('online');
  }

  function setBusy(busy, activeButton = null) {
    actionInFlight = busy;
    [elements.start, elements.stop, elements.reload, elements.select, elements.login].forEach((button) => {
      button.disabled = busy;
      button.classList.toggle('is-loading', busy && button === activeButton);
      button.setAttribute('aria-busy', String(busy && button === activeButton));
    });
    elements.channelInput.disabled = busy;
  }

  async function refresh({ silent = false } = {}) {
    if (refreshInFlight || actionInFlight) return;
    refreshInFlight = true;
    if (!silent) setConnection('checking');
    try {
      render(await api('/api/status'));
    } catch (error) {
      setConnection('offline');
      elements.status.textContent = 'Não foi possível obter o estado da Raspberry Pi.';
      if (!silent) showNotice(elements.controlMessage, error.message, 'notice--error');
    } finally {
      refreshInFlight = false;
    }
  }

  async function runAction(button, request, successMessage, {
    targetNotice = elements.controlMessage,
    renderState = true
  } = {}) {
    if (actionInFlight) return;
    setBusy(true, button);
    showNotice(targetNotice, 'A processar…');
    try {
      const state = await request();
      if (renderState) render(state);
      const message = typeof successMessage === 'function' ? successMessage(state) : successMessage;
      showNotice(targetNotice, message, 'notice--success');
    } catch (error) {
      setConnection(error.isNetworkError ? 'offline' : 'online');
      showNotice(targetNotice, error.message, 'notice--error');
    } finally {
      setBusy(false);
    }
  }

  elements.channelForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const channel = elements.channelInput.value.trim();
    if (!channel) {
      showNotice(elements.channelMessage, 'Indique o nome de um canal Twitch.', 'notice--error');
      elements.channelInput.focus();
      return;
    }
    runAction(
      elements.select,
      () => api('/api/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel })
      }),
      'Canal selecionado.',
      { targetNotice: elements.channelMessage }
    );
  });

  elements.start.addEventListener('click', () => runAction(elements.start, () => api('/api/start'), 'Live iniciada.'));
  elements.stop.addEventListener('click', () => runAction(elements.stop, () => api('/api/stop'), 'Visualização terminada.'));
  elements.reload.addEventListener('click', () => runAction(elements.reload, () => api('/api/start'), 'Live reaberta.'));
  elements.login.addEventListener('click', () => runAction(
    elements.login,
    () => api('/api/login'),
    (result) => result && typeof result.message === 'string' && result.message.trim()
      ? result.message
      : 'Pedido de autenticação concluído.',
    { targetNotice: elements.loginNotice, renderState: false }
  ));

  // A single scheduled loop avoids overlapping status requests. Mutations render
  // their returned state directly, so they never trigger a redundant poll.
  function scheduleRefresh() {
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => refresh({ silent: true }), POLL_INTERVAL_MS);
  }

  refresh();
  scheduleRefresh();
  window.addEventListener('beforeunload', () => window.clearInterval(refreshTimer), { once: true });
})();
