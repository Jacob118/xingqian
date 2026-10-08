const $ = (id) => document.getElementById(id);
const appState = { quotes: [], currentId: '', priorityId: '', settings: {}, lastRotationDate: '', isPackaged: false, appVersion: '', updateConfigured: false };
const dateKey = () => new Date().toISOString().slice(0, 10);
let toastTimer;
let quoteEditingId = '';
let weatherLocationDeclined = false;
let weatherRequestInFlight = false;

function renderClock() {
  const now = new Date();
  $('local-time').textContent = new Intl.DateTimeFormat('zh-Hans-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
  $('local-date').textContent = new Intl.DateTimeFormat('zh-Hans-CN', {
    month: 'numeric', day: 'numeric', weekday: 'short'
  }).format(now);
}

renderClock();
setInterval(renderClock, 15000);

function showWeather(result) {
  const symbol = $('weather-symbol');
  const summary = $('weather-summary');
  if (result?.status === 'ok') {
    symbol.textContent = result.symbol || '☁';
    summary.textContent = `${result.location} ${result.temperature}° ${result.condition}`;
    summary.title = summary.textContent;
    return;
  }
  symbol.textContent = result?.status === 'error' ? '◌' : '☼';
  const messages = {
    'not-found': '找不到这个城市',
    'missing-city': '请输入城市',
    'location-denied': '定位未启用',
    'location-unavailable': '定位暂不可用',
    'error': '天气暂不可用'
  };
  summary.textContent = messages[result?.status] || '天气暂不可用';
  summary.title = summary.textContent;
}

async function currentPosition() {
  if (!navigator.geolocation) throw new Error('Geolocation is unavailable');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 15 * 60 * 1000,
      timeout: 12000
    });
  });
}

async function refreshWeather(manual = false) {
  if (weatherRequestInFlight) return;
  weatherRequestInFlight = true;
  const button = $('weather-refresh');
  if (button) { button.disabled = true; button.textContent = '…'; }
  const useAuto = Boolean($('weather-auto').checked);
  const city = $('weather-city-input').value.trim();
  appState.settings.weatherUseAuto = useAuto;
  appState.settings.weatherCity = city;
  await save();
  $('weather-symbol').textContent = '◌';
  $('weather-summary').textContent = useAuto ? '正在定位…' : (city ? '正在查询…' : '先填写城市');

  try {
    let result;
    if (useAuto) {
      if (weatherLocationDeclined && !manual) return;
      const allowed = await window.xingqian.allowWeatherLocation();
      if (!allowed) {
        weatherLocationDeclined = true;
        result = { status: 'location-denied' };
      } else {
        try {
          const position = await currentPosition();
          result = await window.xingqian.getWeather({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        } catch (_) {
          result = { status: 'location-unavailable' };
        }
      }
      if (result?.status !== 'ok' && city) result = await window.xingqian.getWeather({ city });
    } else if (city) {
      result = await window.xingqian.getWeather({ city });
    } else {
      result = { status: 'missing-city' };
    }
    showWeather(result);
  } catch (_) {
    showWeather({ status: 'error' });
  } finally {
    weatherRequestInFlight = false;
    if (button) { button.disabled = false; button.textContent = '更新'; }
  }
}

function renderWeatherSettings() {
  const useAuto = appState.settings.weatherUseAuto !== false;
  $('weather-auto').checked = useAuto;
  $('weather-city-input').value = appState.settings.weatherCity || '';
  $('weather-city-input').classList.toggle('hidden', useAuto);
}

function activeQuotes() {
  const today = dateKey();
  return appState.quotes.filter((q) => q.active && (!q.expiresAt || q.expiresAt >= today));
}

function currentQuote() {
  const quotes = activeQuotes();
  let current = quotes.find((q) => q.id === appState.currentId);
  if (!current && quotes.length) {
    current = quotes[Math.floor(Math.random() * quotes.length)];
    appState.currentId = current.id;
  }
  return current;
}

function priorityQuote() {
  const quotes = activeQuotes();
  return quotes.find((q) => q.id === appState.priorityId) || currentQuote() || quotes[0];
}

async function save() {
  const stored = await window.xingqian.saveState(appState);
  Object.assign(appState, stored);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 1800);
}

function renderCard() {
  const quotes = activeQuotes();
  const quote = currentQuote();
  const priority = priorityQuote();
  $('active-count').textContent = quotes.length ? `${quotes.length} 句正在陪着你` : '留一席给重要的事';
  $('quote-text').textContent = quote ? quote.text : '写下一句，提醒自己什么最重要。';
  $('quote-source').textContent = quote?.source || '';
  $('quote-index').textContent = quote ? `${String(quotes.indexOf(quote) + 1).padStart(2, '0')} / ${String(quotes.length).padStart(2, '0')}` : '还没有收藏';
  $('next-quote').disabled = quotes.length < 2;
  $('next-quote').style.opacity = quotes.length < 2 ? '.42' : '1';
  $('pin-icon').textContent = appState.settings.alwaysOnTop ? '⌖' : '⌗';
  $('pin-label').textContent = appState.settings.alwaysOnTop ? '置顶中' : '已取消置顶';
  $('compact-quote').textContent = priority ? priority.text : '写下一句最想记住的话';
  $('compact-view').title = priority ? `最高优先级：${priority.text}（点击展开）` : '点击展开醒签卡片';
}

function renderList() {
  const list = $('quote-list');
  list.replaceChildren();
  if (!appState.quotes.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = '还没有收藏的话，从下面添加第一句。';
    list.append(empty);
    return;
  }
  appState.quotes.forEach((quote) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'current-quote'; radio.className = 'list-select';
    radio.checked = quote.id === appState.currentId;
    radio.setAttribute('aria-label', '设为当前提醒');
    radio.disabled = Boolean(quote.expiresAt && quote.expiresAt < dateKey());
    radio.addEventListener('change', async () => { appState.currentId = quote.id; await save(); render(); toast('已设为当前提醒'); });
    const copy = document.createElement('div'); copy.className = 'list-copy';
    const text = document.createElement('div'); text.className = 'list-text'; text.textContent = quote.text;
    const meta = document.createElement('div'); meta.className = 'list-meta';
    const expired = quote.expiresAt && quote.expiresAt < dateKey();
    meta.textContent = expired ? '已过期' : (quote.source || (quote.expiresAt ? `提醒至 ${quote.expiresAt.replaceAll('-', '.')}` : '长期保留'));
    copy.append(text, meta);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    const priority = document.createElement('button'); priority.className = `priority-button${quote.id === appState.priorityId ? ' is-priority' : ''}`;
    priority.type = 'button'; priority.textContent = quote.id === appState.priorityId ? '★' : '☆';
    priority.title = quote.id === appState.priorityId ? '当前最高优先级' : '设为最高优先级';
    priority.setAttribute('aria-label', priority.title);
    priority.disabled = Boolean(quote.expiresAt && quote.expiresAt < dateKey());
    priority.addEventListener('click', async () => {
      appState.priorityId = quote.id;
      await save(); render(); toast('已设为最高优先级');
    });
    const edit = document.createElement('button'); edit.className = 'edit-button'; edit.type = 'button'; edit.textContent = '编辑'; edit.title = '编辑这句话';
    edit.addEventListener('click', () => {
      quoteEditingId = quote.id;
      $('quote-input').value = quote.text;
      $('source-input').value = quote.source || '';
      $('expiry-input').value = quote.expiresAt ? String(Math.max(1, Math.round((new Date(quote.expiresAt) - new Date()) / (30 * 86400000)))) : '';
      $('quote-form').querySelector('[type="submit"]').firstChild.textContent = '保存修改 ';
      $('cancel-edit').classList.remove('hidden');
      $('quote-input').focus();
    });
    const remove = document.createElement('button'); remove.className = 'delete-button'; remove.type = 'button'; remove.textContent = '×'; remove.title = '删除这句话';
    remove.addEventListener('click', async () => {
      appState.quotes = appState.quotes.filter((q) => q.id !== quote.id);
      if (appState.currentId === quote.id) appState.currentId = activeQuotes()[0]?.id || '';
      if (appState.priorityId === quote.id) appState.priorityId = activeQuotes()[0]?.id || '';
      await save(); render(); toast('这句话已删除');
    });
    actions.append(priority, edit, remove);
    row.append(radio, copy, actions); list.append(row);
  });
}

function render() {
  renderCard();
  renderList();
  $('always-top').checked = Boolean(appState.settings.alwaysOnTop);
  $('login-start').checked = Boolean(appState.settings.openAtLogin);
  renderWeatherSettings();
  $('login-start').disabled = !appState.isPackaged;
  $('login-start').title = appState.isPackaged ? '' : '请安装打包版本后设置登录启动';
  $('check-updates').disabled = !appState.updateConfigured;
  $('check-updates').title = appState.updateConfigured ? '' : '此安装包还没有连接线上更新源';
  $('update-status').textContent = appState.updateConfigured
    ? `版本 ${appState.appVersion} · 启动时自动检查`
    : (appState.isPackaged ? '尚未连接线上更新源' : '安装包发布并连接更新源后可用');
}

function showUpdateStatus(status) {
  const label = $('update-status');
  if (!label || !status) return;
  const messages = {
    checking: '正在检查更新…',
    available: `发现新版本 ${status.version}，正在下载…`,
    current: `已是最新版本（${status.version}）`,
    progress: `正在下载更新 ${status.percent}%`,
    downloaded: `新版本 ${status.version} 已下载，退出醒签时安装`,
    error: '暂时无法检查更新，请稍后重试'
  };
  label.textContent = messages[status.type] || label.textContent;
  if (status.type === 'downloaded') toast('更新已下载，退出醒签时会自动安装');
}

function showView(view) {
  const managing = view === 'manage';
  $('card-view').classList.toggle('hidden', managing);
  $('manage-view').classList.toggle('hidden', !managing);
  window.xingqian.resize(managing ? 'manage' : 'card');
}

function cancelEdit() {
  quoteEditingId = '';
  $('quote-form').reset();
  $('expiry-input').value = '6';
  $('quote-form').querySelector('[type="submit"]').firstChild.textContent = '保存这句话 ';
  $('cancel-edit').classList.add('hidden');
}

$('manage').addEventListener('click', () => showView('manage'));
$('back').addEventListener('click', () => { cancelEdit(); showView('card'); });
$('minimize').addEventListener('click', () => window.xingqian.resize('compact'));
$('compact-view').addEventListener('click', () => window.xingqian.show());
$('next-quote').addEventListener('click', async () => {
  const quotes = activeQuotes();
  if (quotes.length < 2) return;
  const candidates = quotes.filter((q) => q.id !== appState.currentId);
  appState.currentId = candidates[Math.floor(Math.random() * candidates.length)].id;
  await save(); renderCard();
});
$('pin-toggle').addEventListener('click', async () => {
  appState.settings.alwaysOnTop = !appState.settings.alwaysOnTop;
  await save(); renderCard(); toast(appState.settings.alwaysOnTop ? '卡片会留在最前面' : '已关闭始终置顶');
});
$('quote-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('quote-input').value.trim();
  if (!text) return;
  const months = $('expiry-input').value;
  const expiresAt = months ? (() => { const date = new Date(); date.setMonth(date.getMonth() + Number(months)); return date.toISOString().slice(0, 10); })() : '';
  if (quoteEditingId) {
    const target = appState.quotes.find((q) => q.id === quoteEditingId);
    if (target) Object.assign(target, { text, source: $('source-input').value.trim(), expiresAt });
    appState.currentId = quoteEditingId;
  } else {
    const quote = { id: crypto.randomUUID(), text, source: $('source-input').value.trim(), createdAt: new Date().toISOString(), expiresAt, active: true };
    appState.quotes.unshift(quote); appState.currentId = quote.id;
  }
  await save(); $('quote-form').reset(); $('expiry-input').value = '6';
  quoteEditingId = ''; $('quote-form').querySelector('[type="submit"]').firstChild.textContent = '保存这句话 ';
  $('cancel-edit').classList.add('hidden'); render(); toast('已放进你的醒签');
});
$('cancel-edit').addEventListener('click', cancelEdit);
$('always-top').addEventListener('change', async (event) => { appState.settings.alwaysOnTop = event.target.checked; await save(); renderCard(); });
$('login-start').addEventListener('change', async (event) => { appState.settings.openAtLogin = event.target.checked; await save(); toast(event.target.checked ? '已设为登录时显示' : '已关闭登录时启动'); });
$('weather-auto').addEventListener('change', async (event) => {
  appState.settings.weatherUseAuto = event.target.checked;
  renderWeatherSettings();
  await save();
});
$('weather-refresh').addEventListener('click', () => refreshWeather(true));
$('check-updates').addEventListener('click', async () => {
  $('check-updates').disabled = true;
  showUpdateStatus({ type: 'checking' });
  const result = await window.xingqian.checkForUpdates();
  if (result.status === 'not-configured') showUpdateStatus({ type: 'error' });
  $('check-updates').disabled = !appState.updateConfigured;
});
window.xingqian.onWindowMode((mode) => document.body.classList.toggle('compact', mode === 'compact'));
window.xingqian.onUpdateStatus(showUpdateStatus);

(async () => {
  const stored = await window.xingqian.getState();
  Object.assign(appState, stored);
  if (!appState.priorityId || !appState.quotes.some((q) => q.id === appState.priorityId)) {
    appState.priorityId = appState.currentId || activeQuotes()[0]?.id || '';
  }
  const today = dateKey();
  if (appState.lastRotationDate && appState.lastRotationDate !== today) {
    const quotes = activeQuotes();
    if (quotes.length > 1) appState.currentId = quotes[Math.floor(Math.random() * quotes.length)].id;
  }
  appState.lastRotationDate = today;
  await save();
  render();
  refreshWeather();
  setInterval(() => refreshWeather(), 20 * 60 * 1000);
})();
