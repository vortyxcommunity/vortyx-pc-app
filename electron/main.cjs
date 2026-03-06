const { app, BrowserWindow, screen, Tray, Menu, ipcMain, session, Notification, clipboard } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

let mainWindow;
let tray;
let isQuitting = false;

function getIconPath() {
    return isDev
        ? path.join(__dirname, '../public/vortyx-logo.png')
        : path.join(__dirname, '../dist/vortyx-logo.png');
}

app.setAppUserModelId('com.vortyx.app'); // Set ASAP for Windows notifications

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const iconPath = getIconPath();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0f0f0f',
        show: false,
        frame: false,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            autoplayPolicy: 'no-user-gesture-required'
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
    });

    // Handle window close - hide instead of quit
    mainWindow.on('close', function (event) {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    // Grant media permissions automatically for the calling system
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });
}

function createTray() {
    const iconPath = getIconPath();
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                mainWindow.show();
                mainWindow.maximize();
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Vortyx');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.maximize();
    });
}

const { autoUpdater } = require('electron-updater');

// Configure Auto-Updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

app.on('ready', () => {
    // Check for updates after a short delay
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 5000);
});

function sendStatusToWindow(text, info = null) {
    if (mainWindow) {
        mainWindow.webContents.send('update-message', { text, info });
    }
}

autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Checking for update...');
});
autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('Update available.', info);
});
autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('Update not available.', info);
});
autoUpdater.on('error', (err) => {
    sendStatusToWindow('Error in auto-updater. ' + err);
});
autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    sendStatusToWindow(log_message);
});
autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('Update downloaded', info);
});

// IPC Handlers for Window Controls
ipcMain.on('window-control', (event, action) => {
    if (!mainWindow) return;
    switch (action) {
        case 'minimize':
            mainWindow.minimize();
            break;
        case 'maximize':
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
            break;
        case 'close':
            mainWindow.hide(); // Hide to tray instead of closing
            break;
    }
});

ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

// Real-time Push Notification handler 
ipcMain.on('show-notification', (event, { title, body }) => {
    const iconPath = getIconPath();
    const notification = new Notification({
        title,
        body,
        icon: iconPath
    });

    notification.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    notification.show();
});

ipcMain.on('copy-to-clipboard', (event, text) => {
    clipboard.writeText(text);
});

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        // Stay in tray
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});
