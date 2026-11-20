const { app, BrowserWindow, Menu, Tray, screen, globalShortcut, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const SMOKE = process.argv.includes('--smoke');

// layer: 'desktop' — qor ish stoli qatlamida (oynalar orqasida, o'yinda GPU yuki nol).
//        'overlay' — qor hamma narsa ustida (oldingi xatti-harakat).
const DEFAULTS = { visible: true, density: 'orta', wind: 'orta', drift: true, aurora: false, autostart: false, layer: 'desktop' };
const LAYERS = ['desktop', 'overlay'];
const DENSITIES = ['yengil', 'orta', 'kuchli'];
const WINDS = ['sokin', 'orta', 'kuchli'];
const DENSITY_LABEL = { yengil: 'Yengil', orta: "O'rtacha", kuchli: 'Kuchli' };
const WIND_LABEL = { sokin: 'Sokin', orta: "O'rtacha", kuchli: 'Kuchli' };

let settings = { ...DEFAULTS };
let tray = null;
let overlays = [];
let rebuildTimer = null;
let layerReady = 0;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    settings.visible = true;
    applySettings();
    buildTrayMenu();
  });
  app.whenReady().then(start);
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'qor-settings.json');
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch {
    /* sozlamalarni saqlash muhim emas */
  }
}

function start() {
  settings = loadSettings();
  createOverlays();
  buildTrayMenu();
  registerHotkeys();
  applyAutostart();

  // Ekranlar soni o'zgarsa — oynalarni qayta quramiz.
  // Faqat o'lcham/scaling o'zgarsa — mavjud oynalarni joyida cho'zamiz,
  // shunda qor uzilib qolmaydi va ilovani qayta ishga tushirish kerak emas.
  const onDisplaysChanged = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      if (displayLayoutMatches()) syncDisplayBounds();
      else createOverlays();
    }, 400);
  };
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);

  if (SMOKE) {
    setTimeout(async () => {
      for (const win of overlays) {
        try {
          const report = await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('sky'); return c ? c.width + 'x' + c.height : 'no-canvas'; })()`
          );
          console.log('[smoke] canvas:', report);
        } catch (error) {
          console.log('[smoke] canvas check failed:', error.message);
        }
      }
      try {
        overlays[0].webContents.send('qor:storm', { x: 320, y: 240 });
        await new Promise((resolve) => setTimeout(resolve, 700));
        const alive = await overlays[0].webContents.executeJavaScript('1 + 1');
        console.log('[smoke] storm ok, renderer alive:', alive === 2);
      } catch (error) {
        console.log('[smoke] storm failed:', error.message);
      }
      try {
        const target = overlays.find((win) => !win.isDestroyed());
        const original = target.getBounds();
        const before = await target.webContents.executeJavaScript(
          `(() => { const c = document.getElementById('sky'); return c.width + 'x' + c.height; })()`
        );
        target.setSize(1600, 900);
        await new Promise((resolve) => setTimeout(resolve, 700));
        const after = await target.webContents.executeJavaScript(
          `(() => { const c = document.getElementById('sky'); return c.width + 'x' + c.height + ' @' + window.innerWidth + 'x' + window.innerHeight; })()`
        );
        console.log('[smoke] resize:', before, '->', after);
        target.setBounds(original);
      } catch (error) {
        console.log('[smoke] resize check failed:', error.message);
      }
      console.log('[smoke] overlays:', overlays.length, '| ok, quitting');
      app.quit();
    }, 6000);
  }
}

function createOverlays() {
  for (const win of overlays) {
    if (!win.isDestroyed()) win.destroy();
  }
  overlays = [];

  for (const display of screen.getAllDisplays()) {
    const { x, y, width, height } = display.bounds;
    const displayId = display.id;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      title: 'Qor',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      show: false,
      alwaysOnTop: settings.layer === 'overlay',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // Ish stoli qatlamida oyna boshqa oyna bilan to'liq qoplansa, Chromium
        // rasm chizishni o'zi to'xtatadi — bu o'yin paytida muhim tejam.
        backgroundThrottling: true,
      },
    });

    if (settings.layer === 'overlay') {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      win.setAlwaysOnTop(false);
    }
    win.__displayId = displayId;
    // Bosishlar ostidagi oynalarga o'tadi, faqat sichqoncha harakati bizga keladi.
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    win.webContents.on('did-finish-load', () => {
      win.webContents.send('qor:settings', settings);
    });

    win.webContents.on('console-message', (...args) => {
      const details = args[1];
      const message = details && typeof details === 'object' ? details.message : args[2];
      if (message) console.log('[renderer]', message);
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.log('[renderer gone]', details && details.reason);
    });

    win.once('ready-to-show', () => {
      if (settings.visible) win.showInactive();
      if (settings.layer === 'desktop') attachDesktopLayer(win);
    });

    overlays.push(win);
  }
}

// Mavjud oynalar hozirgi ekranlar to'plamiga mos keladimi?
function displayLayoutMatches() {
  const displays = screen.getAllDisplays();
  const live = overlays.filter((win) => !win.isDestroyed());
  if (live.length !== displays.length) return false;
  const ids = new Set(displays.map((display) => display.id));
  return live.every((win) => ids.has(win.__displayId));
}

// Resolution/scaling o'zgardi — har oynani o'z ekranining yangi chegarasiga
// cho'zamiz. Renderer'dagi `resize` hodisasi qorni yangi o'lchamga moslaydi.
function syncDisplayBounds() {
  const byId = new Map(screen.getAllDisplays().map((display) => [display.id, display]));

  for (const win of overlays) {
    if (win.isDestroyed()) continue;
    const display = byId.get(win.__displayId);
    if (!display) continue;

    const { x, y, width, height } = display.bounds;
    const current = win.getBounds();
    if (current.x === x && current.y === y && current.width === width && current.height === height) continue;

    win.setBounds({ x, y, width, height });
    // Ish stoli qatlamida oyna WorkerW ichida yashaydi — uni yangi o'lchamga
    // qayta joylashtirmasak, eski o'lchamda qolib ketadi.
    if (settings.layer === 'desktop') attachDesktopLayer(win);
  }
}

// Ish stoli qatlami skripti. Exe ichida (asar) PowerShell skriptni o'qiy
// olmaydi, shuning uchun uni bir marta vaqtinchalik papkaga chiqaramiz.
let layerScriptCache = null;
function layerScriptPath() {
  if (layerScriptCache) return layerScriptCache;

  const source = path.join(__dirname, '..', 'scripts', 'desktop-layer.ps1');
  if (!app.isPackaged) {
    layerScriptCache = source;
    return source;
  }

  const target = path.join(app.getPath('temp'), 'qor-desktop-layer.ps1');
  try {
    fs.copyFileSync(source, target);
    layerScriptCache = target;
  } catch (error) {
    console.log('[layer] script extract failed:', error.message);
    layerScriptCache = source;
  }
  return layerScriptCache;
}

function windowHandle(win) {
  const buffer = win.getNativeWindowHandle();
  if (buffer.length === 8) return buffer.readBigUInt64LE(0).toString();
  return String(buffer.readUInt32LE(0));
}

// Oynani Explorer'ning ish stoli qatlamiga (WorkerW) o'tkazadi.
function attachDesktopLayer(win) {
  let handle;
  try {
    handle = windowHandle(win);
  } catch (error) {
    console.log('[layer] hwnd failed:', error.message);
    return;
  }

  const bounds = win.getBounds();
  const script = layerScriptPath();
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-Hwnd',
      handle,
      '-X',
      String(bounds.x),
      '-Y',
      String(bounds.y),
      '-Width',
      String(bounds.width),
      '-Height',
      String(bounds.height),
    ],
    { windowsHide: true, timeout: 15000 },
    (error, stdout, stderr) => {
      const out = String(stdout || '').trim();
      if (!error && out.startsWith('OK')) {
        layerReady += 1;
        win.setAlwaysOnTop(false);
        console.log('[layer] desktop:', out);
      } else {
        // Zaxira: agar qatlamga o'tolmasak, qor ustki qatlamda qoladi.
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        console.log('[layer] fallback to overlay:', out || (error && error.message) || String(stderr || '').trim());
      }
    }
  );
}

function applySettings() {
  saveSettings();
  for (const win of overlays) {
    if (win.isDestroyed()) continue;
    win.webContents.send('qor:settings', settings);
    if (settings.visible) {
      if (!win.isVisible()) win.showInactive();
    } else if (win.isVisible()) {
      win.hide();
    }
  }
}

function setVisible(visible) {
  settings.visible = visible;
  applySettings();
  buildTrayMenu();
}

function setDensity(density) {
  settings.density = density;
  applySettings();
  buildTrayMenu();
}

function setWind(wind) {
  settings.wind = wind;
  applySettings();
  buildTrayMenu();
}

function setDrift(drift) {
  settings.drift = drift;
  applySettings();
  buildTrayMenu();
}

function setAurora(aurora) {
  settings.aurora = aurora;
  applySettings();
  buildTrayMenu();
}

function setLayer(layer) {
  settings.layer = layer;
  applySettings();
  createOverlays();
  buildTrayMenu();
}

function setAutostart(autostart) {
  settings.autostart = autostart;
  applyAutostart();
  applySettings();
  buildTrayMenu();
}

function applyAutostart() {
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: settings.autostart });
    } else {
      // Dev rejimida Electron'ni ilova papkasi bilan ishga tushirish kerak.
      app.setLoginItemSettings({
        openAtLogin: settings.autostart,
        path: process.execPath,
        args: [app.getAppPath()],
      });
    }
  } catch {
    // ba'zi tizim sozlamalarida ruxsat bo'lmasligi mumkin
  }
}

function triggerStorm() {
  let target = null;
  let point = { x: 0, y: 0 };

  try {
    point = screen.getCursorScreenPoint();
  } catch {
    point = { x: 0, y: 0 };
  }

  for (const win of overlays) {
    if (win.isDestroyed()) continue;
    const bounds = win.getBounds();
    if (
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height
    ) {
      target = win;
      break;
    }
  }

  if (!target) target = overlays.find((win) => !win.isDestroyed()) || null;
  if (!target) return;

  if (!settings.visible) {
    settings.visible = true;
    applySettings();
    buildTrayMenu();
  }

  const bounds = target.getBounds();
  target.webContents.send('qor:storm', { x: point.x - bounds.x, y: point.y - bounds.y });
}

function buildTrayMenu() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  if (!tray) {
    const image = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createEmpty();
    try {
      tray = new Tray(image.resize({ width: 20, height: 20 }));
    } catch {
      return;
    }
    tray.setToolTip('Qor — ish stoli ustida');
    tray.on('click', () => setVisible(!settings.visible));
  }

  const template = [
    { label: "Qor yog'ishi", type: 'checkbox', checked: settings.visible, click: (item) => setVisible(item.checked) },
    { type: 'separator' },
    {
      label: 'Zichlik',
      submenu: DENSITIES.map((value) => ({
        label: DENSITY_LABEL[value],
        type: 'radio',
        checked: settings.density === value,
        click: () => setDensity(value),
      })),
    },
    {
      label: 'Shamol',
      submenu: WINDS.map((value) => ({
        label: WIND_LABEL[value],
        type: 'radio',
        checked: settings.wind === value,
        click: () => setWind(value),
      })),
    },
    {
      label: "Qor to'planishi",
      type: 'checkbox',
      checked: settings.drift,
      click: (item) => setDrift(item.checked),
    },
    {
      label: "Yog'du (aurora) effekti",
      type: 'checkbox',
      checked: settings.aurora,
      click: (item) => setAurora(item.checked),
    },
    {
      label: "Qor qayerda",
      submenu: [
        { label: 'Ish stolida (oynalar orqasida)', type: 'radio', checked: settings.layer === 'desktop', click: () => setLayer('desktop') },
        { label: 'Hamma narsa ustida', type: 'radio', checked: settings.layer === 'overlay', click: () => setLayer('overlay') },
      ],
    },
    { type: 'separator' },
    { label: "Bo'ron chaqirish (sichqoncha turgan joyda)", click: () => triggerStorm() },
    {
      label: 'Windows bilan birga ishga tushish',
      type: 'checkbox',
      checked: settings.autostart,
      click: (item) => setAutostart(item.checked),
    },
    { type: 'separator' },
    { label: 'Ctrl+Alt+S — qorni yon/o‘chirish', enabled: false },
    { label: 'Ctrl+Alt+D — zichlikni almashtirish', enabled: false },
    { label: 'Ctrl+Alt+B — qor bo‘roni', enabled: false },
    { label: 'Ctrl+Alt+L — qatlamni almashtirish', enabled: false },
    { type: 'separator' },
    { label: 'Chiqish', click: () => app.quit() },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function registerHotkeys() {
  globalShortcut.register('Control+Alt+S', () => setVisible(!settings.visible));
  globalShortcut.register('Control+Alt+D', () => {
    const next = DENSITIES[(DENSITIES.indexOf(settings.density) + 1) % DENSITIES.length];
    setDensity(next);
  });
  globalShortcut.register('Control+Alt+B', () => triggerStorm());
  globalShortcut.register('Control+Alt+L', () => {
    setLayer(settings.layer === 'desktop' ? 'overlay' : 'desktop');
  });
}

app.on('window-all-closed', () => {
  // Ilova tray orqali ishlashda davom etadi.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
