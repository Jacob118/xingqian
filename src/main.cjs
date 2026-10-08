const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
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
  settings: { alwaysOnTop: true, openAtLogin: true },
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

  const sizes = { compact: [364, 60], card: [380, 434], manage: [420, 570] };
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
    height: 434,
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
      openAtLogin: Boolean(next.settings.openAtLogin)
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

app.setAppUserModelId(APP_ID);
app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'mottos.json');
  loadState();
  applyLoginSetting();
  makeWindow();
  makeTray();
  setupAutoUpdates();
  app.on('activate', showCard);
});
app.on('before-quit', () => { allowQuit = true; });
