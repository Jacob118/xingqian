const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, net, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_ID = 'com.xingqian.desktop';
let cardWindow;
let tray;
let allowQuit = false;
let windowMode = 'card';
let expandedMode = 'card';
let updater = null;
let updateFeedConfigured = false;
let updateDownloaded = false;
let statePath;
const weatherCache = new Map();
let state = {
  quotes: [{
    id: 'welcome',
    text: '把真正重要的事，留在眼前。',
    source: '',
    createdAt: new Date().toISOString(),
    expiresAt: '',
    active: true
  }],
  currentId: 'welcome',
  priorityId: 'welcome',
  settings: { alwaysOnTop: true, openAtLogin: true, weatherUseAuto: true, weatherCity: '', weatherLocationAllowed: false },
  lastRotationDate: ''
};

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state = { ...state, ...saved, settings: { ...state.settings, ...(saved.settings || {}) } };
    if (!Array.isArray(state.quotes)) state.quotes = [];
    if (!state.priorityId) state.priorityId = state.currentId || state.quotes[0]?.id || '';
  } catch (_) { /* First launch: use the sample card. */ }
}

function persistState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function applyLoginSetting() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(state.settings.openAtLogin) });
}

function showCard() {
  if (!cardWindow) return;
  setWindowMode(windowMode === 'compact' ? expandedMode : windowMode);
  cardWindow.show();
  cardWindow.focus();
}

function setWindowMode(mode) {
  if (!cardWindow || cardWindow.isDestroyed()) return;
  if (mode === 'compact') {
    if (windowMode !== 'compact') expandedMode = windowMode;
    windowMode = 'compact';
  } else {
    windowMode = mode === 'manage' ? 'manage' : 'card';
    expandedMode = windowMode;
  }

  const sizes = { compact: [364, 60], card: [380, 464], manage: [420, 620] };
  const [width, height] = sizes[windowMode];
  const display = screen.getDisplayMatching(cardWindow.getBounds());
  const area = display.workArea;
  cardWindow.setBounds({
    x: Math.max(area.x, area.x + area.width - width - 22),
    y: area.y + 22,
    width,
    height
  });
  if (!cardWindow.webContents.isDestroyed()) cardWindow.webContents.send('window:mode', windowMode);
}

function sendUpdateStatus(status) {
  if (cardWindow && !cardWindow.isDestroyed() && !cardWindow.webContents.isDestroyed()) {
    cardWindow.webContents.send('updates:status', status);
  }
}

function setTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示醒签', click: showCard },
    { label: updateDownloaded ? '退出并安装更新' : '退出醒签', click: () => {
      allowQuit = true;
      if (updateDownloaded && updater) updater.quitAndInstall(false, true);
      else app.quit();
    } }
  ]));
}

function makeTray() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="22" rx="6" fill="#415346"/><path d="M10 12h12M10 17h9M10 22h6" stroke="#f7f4ec" stroke-width="2" stroke-linecap="round"/></svg>';
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`));
  tray.setToolTip('醒签 · 把重要的话留在眼前');
  setTrayMenu();
  tray.on('click', showCard);
}

function makeWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  cardWindow = new BrowserWindow({
    width: 380,
    height: 464,
    minWidth: 340,
    minHeight: 390,
    x: Math.max(area.x, area.x + area.width - 404),
    y: area.y + 22,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: state.settings.alwaysOnTop,
    backgroundColor: '#f4f1e8',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  cardWindow.loadFile(path.join(__dirname, 'index.html'));
  cardWindow.once('ready-to-show', () => cardWindow.show());
  cardWindow.on('close', (event) => {
    if (!allowQuit) {
      event.preventDefault();
      cardWindow.hide();
    }
  });
  if (process.platform === 'darwin') cardWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
}

function setupAutoUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const configPath = path.join(process.resourcesPath, 'app-update.yml');
  updateFeedConfigured = fs.existsSync(configPath);
  if (!updateFeedConfigured) return;

  try {
    ({ autoUpdater: updater } = require('electron-updater'));
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => sendUpdateStatus({ type: 'checking' }));
    updater.on('update-available', (info) => sendUpdateStatus({ type: 'available', version: info.version }));
    updater.on('update-not-available', (info) => sendUpdateStatus({ type: 'current', version: info.version }));
    updater.on('download-progress', (progress) => sendUpdateStatus({ type: 'progress', percent: Math.round(progress.percent) }));
    updater.on('update-downloaded', (info) => {
      updateDownloaded = true;
      setTrayMenu();
      sendUpdateStatus({ type: 'downloaded', version: info.version });
    });
    updater.on('error', () => sendUpdateStatus({ type: 'error' }));

    // Let the card appear first, then check in the background.
    setTimeout(() => updater?.checkForUpdates().catch(() => {}), 8000);
  } catch (_) {
    updateFeedConfigured = false;
  }
}

function describeWeather(code, isDay) {
  if (code === 0) return [isDay ? '☀' : '☾', isDay ? '晴' : '晴夜'];
  if (code === 1) return ['◒', '大致晴朗'];
  if (code === 2) return ['◐', '局部多云'];
  if (code === 3) return ['☁', '阴'];
  if ([45, 48].includes(code)) return ['≋', '有雾'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['☂', '毛毛雨'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['☂', '有雨'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['❄', '有雪'];
  if ([95, 96, 99].includes(code)) return ['ϟ', '雷雨'];
  return ['☁', '天气'];
}

async function getWeatherAt(latitude, longitude, location) {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,is_day,weather_code',
    temperature_unit: 'celsius',
    timezone: 'auto'
  }).toString();
  const response = await net.fetch(url.toString(), { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  const json = await response.json();
  const current = json.current;
  if (!current || !Number.isFinite(Number(current.temperature_2m))) throw new Error('Weather service returned no current conditions');
  const [symbol, condition] = describeWeather(Number(current.weather_code), Number(current.is_day) === 1);
  const value = { status: 'ok', location, temperature: Math.round(Number(current.temperature_2m)), symbol, condition };
  weatherCache.set(key, { value, expiresAt: Date.now() + 15 * 60 * 1000 });
  return value;
}

async function fetchWeather(request) {
  if (request && Number.isFinite(Number(request.latitude)) && Number.isFinite(Number(request.longitude))) {
    let latitude = Number(request.latitude);
    let longitude = Number(request.longitude);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('Invalid coordinates');
    // Send and cache only city-scale coordinates, never the device's raw location.
    latitude = Math.round(latitude * 100) / 100;
    longitude = Math.round(longitude * 100) / 100;
    return getWeatherAt(latitude, longitude, '当前位置');
  }

  const city = String(request?.city || '').trim().slice(0, 80);
  if (!city) return { status: 'missing-city' };
  const searchUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  searchUrl.search = new URLSearchParams({ name: city, count: '1', language: 'zh', format: 'json' }).toString();
  const searchResponse = await net.fetch(searchUrl.toString(), { signal: AbortSignal.timeout(9000) });
  if (!searchResponse.ok) throw new Error(`Geocoding service returned ${searchResponse.status}`);
  const search = await searchResponse.json();
  const place = search.results?.[0];
  if (!place) return { status: 'not-found' };
  const location = [place.name, place.admin1].filter((part, index, all) => part && all.indexOf(part) === index).join(' · ') || city;
  return getWeatherAt(Number(place.latitude), Number(place.longitude), location);
}

ipcMain.handle('state:get', () => ({
  ...state,
  isPackaged: app.isPackaged,
  appVersion: app.getVersion(),
  updateConfigured: updateFeedConfigured
}));
ipcMain.handle('state:save', (_event, next) => {
  if (!next || !Array.isArray(next.quotes) || !next.settings) throw new Error('Invalid settings');
  state = {
    ...state,
    quotes: next.quotes.map((q) => ({
      id: String(q.id), text: String(q.text || '').trim().slice(0, 500),
      source: String(q.source || '').trim().slice(0, 100),
      createdAt: String(q.createdAt || new Date().toISOString()),
      expiresAt: String(q.expiresAt || ''), active: Boolean(q.active)
    })).filter((q) => q.text),
    currentId: String(next.currentId || ''),
    priorityId: String(next.priorityId || next.currentId || ''),
    settings: {
      alwaysOnTop: Boolean(next.settings.alwaysOnTop),
      openAtLogin: Boolean(next.settings.openAtLogin),
      weatherUseAuto: next.settings.weatherUseAuto !== false,
      weatherCity: String(next.settings.weatherCity || '').trim().slice(0, 80),
      weatherLocationAllowed: Boolean(state.settings.weatherLocationAllowed)
    },
    lastRotationDate: String(next.lastRotationDate || '')
  };
  persistState();
  cardWindow.setAlwaysOnTop(state.settings.alwaysOnTop);
  applyLoginSetting();
  return {
    ...state,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    updateConfigured: updateFeedConfigured
  };
});
ipcMain.on('window:hide', () => cardWindow.hide());
ipcMain.on('window:show', showCard);
ipcMain.on('window:resize', (_event, size) => setWindowMode(size));
ipcMain.handle('updates:check', async () => {
  if (!updateFeedConfigured || !updater) return { status: 'not-configured' };
  try {
    await updater.checkForUpdates();
    return { status: 'checking' };
  } catch (_) {
    return { status: 'error' };
  }
});
ipcMain.handle('weather:allow-location', async (event) => {
  if (event.sender !== cardWindow?.webContents) return false;
  if (state.settings.weatherLocationAllowed) return true;
  const answer = await dialog.showMessageBox(cardWindow, {
    type: 'question',
    title: '使用当前位置查看天气？',
    message: '醒签想使用设备的大致位置来查询本地天气。',
    detail: '查询时会将约略坐标发送给天气服务；坐标不会保存在醒签中。',
    buttons: ['允许', '暂不'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (answer.response !== 0) return false;
  state.settings.weatherLocationAllowed = true;
  persistState();
  return true;
});
ipcMain.handle('weather:get', async (event, request) => {
  if (event.sender !== cardWindow?.webContents) return { status: 'error' };
  try {
    return await fetchWeather(request);
  } catch (_) {
    return { status: 'error' };
  }
});

app.setAppUserModelId(APP_ID);
app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'mottos.json');
  loadState();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['geolocation', 'geolocation-approximate'].includes(permission)
      && webContents === cardWindow?.webContents
      && Boolean(state.settings.weatherLocationAllowed));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
    ['geolocation', 'geolocation-approximate'].includes(permission)
      && webContents === cardWindow?.webContents
      && Boolean(state.settings.weatherLocationAllowed)
  ));
  applyLoginSetting();
  makeWindow();
  makeTray();
  setupAutoUpdates();
  app.on('activate', showCard);
});
app.on('before-quit', () => { allowQuit = true; });
