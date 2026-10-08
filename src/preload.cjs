const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xingqian', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  resize: (view) => ipcRenderer.send('window:resize', view),
  hide: () => ipcRenderer.send('window:hide'),
  show: () => ipcRenderer.send('window:show'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  allowWeatherLocation: () => ipcRenderer.invoke('weather:allow-location'),
  getWeather: (request) => ipcRenderer.invoke('weather:get', request),
  onWindowMode: (callback) => ipcRenderer.on('window:mode', (_event, mode) => callback(mode)),
  onUpdateStatus: (callback) => ipcRenderer.on('updates:status', (_event, status) => callback(status))
});
