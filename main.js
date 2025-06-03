const { app, BrowserWindow, powerSaveBlocker, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { setupIPCHandlers } = require('./main-process-handlers');

// Power save blocker ID for cleanup
let powerSaveId = null;
let tray = null;

// Enable live reload for development
if (process.argv.includes('--dev')) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

// Handle single instance lock - only allow one instance to run
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (global.mainWindow) {
      if (global.mainWindow.isMinimized()) global.mainWindow.restore();
      global.mainWindow.focus();
    }
  });
}

function createWindow() {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Enable the preload script
      preload: path.join(__dirname, 'preload.js'),
      // For security, disable node integration in renderer
      nodeIntegration: false,
      // Enable context isolation
      contextIsolation: true,
      // Disable remote module
      enableRemoteModule: false,
      // Prevent background throttling
      backgroundThrottling: false
    },
    icon: getAppIcon(),
    show: false // Don't show until ready
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    // If app was launched at startup, check if we should start minimized
    if (app.getLoginItemSettings().wasOpenedAtLogin) {
      // You can choose to start minimized or hidden on startup
      // mainWindow.minimize(); // Uncomment to start minimized
      mainWindow.show(); // Or show normally
    } else {
      mainWindow.show();
    }
  });

  // Prevent system sleep for critical operations
  powerSaveId = powerSaveBlocker.start('prevent-app-suspension');

  // Handle window close - minimize to system tray instead of closing
  mainWindow.on('close', (event) => {
    // Check if app is really quitting or just hiding to tray
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show a notification the first time to inform user
      if (!global.hasShownTrayNotification) {
        // You can add a notification here if desired
        global.hasShownTrayNotification = true;
      }
    }
  });

  // Clean up power save blocker when window is actually closed
  mainWindow.on('closed', () => {
    if (powerSaveId !== null) {
      powerSaveBlocker.stop(powerSaveId);
      powerSaveId = null;
    }
  });

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Store reference to main window for focus operations
  global.mainWindow = mainWindow;
  
  // Create system tray
  createTray();
}

// Create system tray
function createTray() {
  const fs = require('fs');
  let trayIcon = null;
  
  // Check for icon.png in the root folder first (where your file is)
  const rootIconPath = path.join(__dirname, 'icon.png');
  
  if (fs.existsSync(rootIconPath)) {
    // Use the icon.png file you have in the root
    trayIcon = nativeImage.createFromPath(rootIconPath);
    // Resize for tray (16x16 is standard for Windows tray)
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } else {
    // Create a simple default tray icon if no file found
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip('Morrisons EDI');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (global.mainWindow) {
          global.mainWindow.show();
          global.mainWindow.focus();
        }
      }
    },
    {
      label: 'Hide App',
      click: () => {
        if (global.mainWindow) {
          global.mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        // Force quit the application
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Double-click tray icon to show/hide window
  tray.on('double-click', () => {
    if (global.mainWindow) {
      if (global.mainWindow.isVisible()) {
        global.mainWindow.hide();
      } else {
        global.mainWindow.show();
        global.mainWindow.focus();
      }
    }
  });
}

function getAppIcon() {
  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    // In development, look for icon in root folder
    return path.join(__dirname, 'icon.png');
  } else {
    // In production, the icon will be embedded by electron-builder
    // But we can still specify a fallback
    if (process.platform === 'win32') {
      return path.join(__dirname, 'icon.png');
    } else if (process.platform === 'darwin') {
      return path.join(__dirname, 'icon.icns');
    } else {
      return path.join(__dirname, 'icon.png');
    }
  }
}

// Set up auto-launch on startup (after installation)
function setupAutoLaunch() {
  // Only set up auto-launch for packaged apps (not in development)
  if (!app.isPackaged) return;

  const loginItemSettings = app.getLoginItemSettings();
  
  // Enable auto-launch by default after installation
  if (!loginItemSettings.openAtLogin) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false, // Set to true if you want it to start hidden
      args: [
        '--startup' // Add a flag so we know it was launched at startup
      ]
    });
  }
}

// This method will be called when Electron has finished initialization
// Setup IPC handlers when the app is ready
app.whenReady().then(async () => {
  setupIPCHandlers();
  setupAutoLaunch();
  createWindow();

  // Set app user model ID for Windows (helps with taskbar grouping)
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.yourname.simple-electron-app');
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  // Don't quit the app when all windows are closed - keep running in background
  // The app will only quit when explicitly closed from tray menu or forced quit
});

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Handle app before quit for cleanup
app.on('before-quit', () => {
  app.isQuiting = true;
  
  if (powerSaveId !== null) {
    powerSaveBlocker.stop(powerSaveId);
    powerSaveId = null;
  }
});