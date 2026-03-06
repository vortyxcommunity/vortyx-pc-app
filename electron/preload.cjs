const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    windowControl: (action) => ipcRenderer.send('window-control', action),
    sendNotification: (payload) => ipcRenderer.send('show-notification', payload),
    copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateMessage: (callback) => ipcRenderer.on('update-message', (event, ...args) => callback(...args)),
});

window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const type of ['chrome', 'node', 'electron']) {
        replaceText(`${type}-version`, process.versions[type])
    }
})
