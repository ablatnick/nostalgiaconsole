'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nostalgia', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  refreshLibrary: () => ipcRenderer.invoke('library:refresh'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  steam: (action, id) => ipcRenderer.invoke('steam:open', action, id),
  stream: (uuid, appId) => ipcRenderer.invoke('moonlight:stream', uuid, appId),
  openMoonlight: () => ipcRenderer.invoke('moonlight:open'),
  refreshMoonlight: () => ipcRenderer.invoke('moonlight:refresh'),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
  quit: () => ipcRenderer.invoke('app:quit'),
  info: () => ipcRenderer.invoke('app:info'),
  onLibrary: (cb) => ipcRenderer.on('library', (_e, lib) => cb(lib)),
  onWelcomeBack: (cb) => ipcRenderer.on('welcome-back', () => cb()),
  soundPack: () => ipcRenderer.invoke('sounds:pack'),
  soundFolder: () => ipcRenderer.invoke('sounds:folder'),
});
