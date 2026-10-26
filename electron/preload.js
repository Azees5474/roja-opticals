const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('rojaDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: '1.0.0',
});
