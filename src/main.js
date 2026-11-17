// Account Hub - shows every browser profile (email) as a tile; click opens that profile.
const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const LOCAL = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
const PF = process.env['ProgramFiles'] || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

// Known browsers: where their profiles live and where the .exe usually is
const BROWSERS = {
  chrome: {
    label: 'Chrome',
    userData: path.join(LOCAL, 'Google', 'Chrome', 'User Data'),
    exe: [
      path.join(PF, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(PF86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ],
    pics: ['Google Profile Picture.png']
  },
  edge: {
    label: 'Edge',
    userData: path.join(LOCAL, 'Microsoft', 'Edge', 'User Data'),
    exe: [
      path.join(PF86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(PF, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ],
    pics: ['Edge Profile Picture.png', 'Google Profile Picture.png']
  },
  brave: {
    label: 'Brave',
    userData: path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    exe: [
      path.join(PF, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(PF86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ],
    pics: ['Google Profile Picture.png']
  }
};

// ---------- settings ----------
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = {
  enabled: { chrome: true, edge: false, brave: false },
  customExe: { chrome: '', edge: '', brave: '' },
  label: 'email',          // 'email' | 'name'
  startWithWindows: true,
  alwaysOnTop: false,
  theme: 'light',          // 'light' | 'dark'
  glass: 'acrylic',        // 'acrylic' | 'blur' | 'clear'
  tint: 0.35,              // 0..0.9 how solid the glass looks
  hidden: [],              // profile keys the user hid
  bounds: null
};
let config = loadConfig();

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULTS, ...c,
      enabled: { ...DEFAULTS.enabled, ...(c.enabled || {}) },
      customExe: { ...DEFAULTS.customExe, ...(c.customExe || {}) } };
  } catch { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch {}
}

// ---------- browser helpers ----------
function findExe(id) {
  const custom = config.customExe[id];
  if (custom && fs.existsSync(custom)) return custom;
  return BROWSERS[id].exe.find(p => fs.existsSync(p)) || null;
}
function isInstalled(id) {
  return !!findExe(id) || fs.existsSync(path.join(BROWSERS[id].userData, 'Local State'));
}
function readLocalState(id) {
  try { return JSON.parse(fs.readFileSync(path.join(BROWSERS[id].userData, 'Local State'), 'utf8')); }
  catch { return null; }
}
function toDataUrl(file) {
  try {
    const buf = fs.readFileSync(file);
    if (!buf.length) return null;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    return `data:image/${isJpg ? 'jpeg' : 'png'};base64,${buf.toString('base64')}`;
  } catch { return null; }
}
function findPicture(id, dir, info) {
  const base = path.join(BROWSERS[id].userData, dir);
  const names = [info.gaia_picture_file_name, ...BROWSERS[id].pics].filter(Boolean);
  for (const n of names) {
    const url = toDataUrl(path.join(base, n));
    if (url) return url;
  }
  // newer Chrome keeps account pictures here
  const avatarDir = path.join(base, 'Accounts', 'Avatar Images');
  try {
    for (const f of fs.readdirSync(avatarDir)) {
      const url = toDataUrl(path.join(avatarDir, f));
      if (url) return url;
    }
  } catch {}
  // last fallback: Google's online picture URL stored by Chrome
  if (info.last_downloaded_gaia_picture_url_with_size) return info.last_downloaded_gaia_picture_url_with_size;
  return null;
}
function dirOrder(d) {
  if (d === 'Default') return -1;
  const m = /(\d+)$/.exec(d); return m ? parseInt(m[1], 10) : 9999;
}

function getProfiles() {
  const list = [];
  for (const id of Object.keys(BROWSERS)) {
    if (!config.enabled[id]) continue;
    const ls = readLocalState(id);
    const cache = ls && ls.profile && ls.profile.info_cache;
    if (!cache) continue;
    const dirs = Object.keys(cache).sort((a, b) => dirOrder(a) - dirOrder(b));
    for (const dir of dirs) {
      const info = cache[dir] || {};
      if (!fs.existsSync(path.join(BROWSERS[id].userData, dir))) continue;
      const key = `${id}:${dir}`;
      list.push({
        key, browser: id, browserLabel: BROWSERS[id].label, dir,
        email: info.user_name || '',
        name: info.gaia_name || info.name || dir,
        profileName: info.name || dir,
        picture: findPicture(id, dir, info),
        hidden: config.hidden.includes(key)
      });
    }
  }
  return list;
}

function launch(id, args) {
  const exe = findExe(id);
  if (!exe) {
    dialog.showMessageBox(win, { type: 'warning', title: 'Account Hub',
      message: `${BROWSERS[id].label} খুঁজে পাওয়া যায়নি।`,
      detail: 'Settings থেকে ব্রাউজারের .exe ফাইলটা দেখিয়ে দিন।' });
    return false;
  }
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return true;
}

function nextFreeProfileDir(id) {
  const ls = readLocalState(id);
  const used = new Set(Object.keys((ls && ls.profile && ls.profile.info_cache) || {}));
  let n = 1;
  while (used.has(`Profile ${n}`) || fs.existsSync(path.join(BROWSERS[id].userData, `Profile ${n}`))) n++;
  return `Profile ${n}`;
}

// ---------- window ----------
let win = null, tray = null, quitting = false;

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const b = config.bounds || { width: 640, height: 470, x: wa.x + 120, y: wa.y + 140 };
  win = new BrowserWindow({
    ...b, minWidth: 300, minHeight: 220,
    frame: false, transparent: true, resizable: true,
    skipTaskbar: false, alwaysOnTop: !!config.alwaysOnTop,
    icon: path.join(__dirname, 'icon.png'),
    title: 'Account Hub', show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show(); else win.showInactive();
    applyGlass();
  });

  const remember = () => { if (!win.isMinimized() && !win.isMaximized()) { config.bounds = win.getBounds(); saveConfig(); } };
  win.on('moved', remember); win.on('resized', remember);
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.minimize(); } });
}

// ---------- glass (real blur of whatever is behind the window) ----------
// Uses Windows' SetWindowCompositionAttribute accent policy: works on Windows 10 and 11
// and keeps blurring even when the window is not focused (unlike Mica/backgroundMaterial).
const GLASS_PS = `
param([Int64]$Hwnd, [int]$Accent, [int]$Round)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AHGlass {
  [StructLayout(LayoutKind.Sequential)] public struct AccentPolicy { public int AccentState; public int AccentFlags; public uint GradientColor; public int AnimationId; }
  [StructLayout(LayoutKind.Sequential)] public struct WinCompAttrData { public int Attribute; public IntPtr Data; public int SizeOfData; }
  [DllImport("user32.dll")] public static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WinCompAttrData data);
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);
  public static void Apply(long h, int accent, int round) {
    IntPtr hwnd = new IntPtr(h);
    var policy = new AccentPolicy { AccentState = accent, AccentFlags = 2, GradientColor = 0x01FFFFFF };
    int size = Marshal.SizeOf(policy); IntPtr ptr = Marshal.AllocHGlobal(size);
    Marshal.StructureToPtr(policy, ptr, false);
    var data = new WinCompAttrData { Attribute = 19, Data = ptr, SizeOfData = size };
    SetWindowCompositionAttribute(hwnd, ref data); Marshal.FreeHGlobal(ptr);
    try { int pref = round; DwmSetWindowAttribute(hwnd, 33, ref pref, 4); } catch {}
  }
}
"@
[AHGlass]::Apply($Hwnd, $Accent, $Round)
`;
function applyGlass() {
  if (process.platform !== 'win32' || !win) return;
  const mode = config.glass;
  const accent = mode === 'acrylic' ? 4 : mode === 'blur' ? 3 : 0; // 0 = disabled (plain transparent)
  try {
    const buf = win.getNativeWindowHandle();
    const hwnd = buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : buf.readUInt32LE(0).toString();
    const file = path.join(require('os').tmpdir(), 'accounthub-glass.ps1');
    fs.writeFileSync(file, GLASS_PS);
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', file, '-Hwnd', hwnd, '-Accent', String(accent), '-Round', '2'], { windowsHide: true, stdio: 'ignore' });
    ps.on('error', () => {});
  } catch {}
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  tray.setToolTip('Account Hub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { win.show(); win.focus(); } },
    { label: 'Refresh', click: () => win.webContents.send('refresh') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', () => { win.show(); win.focus(); });
}

function applyStartup() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!config.startWithWindows, args: [] });
}

// Watch Local State files so new logins appear automatically
function watchProfiles() {
  for (const id of Object.keys(BROWSERS)) {
    const f = path.join(BROWSERS[id].userData, 'Local State');
    fs.watchFile(f, { interval: 4000 }, () => { if (win) win.webContents.send('refresh'); });
  }
}

// ---------- IPC ----------
ipcMain.handle('get-state', () => ({
  profiles: getProfiles(),
  config, isWindows: process.platform === 'win32',
  browsers: Object.fromEntries(Object.keys(BROWSERS).map(id => [id, {
    label: BROWSERS[id].label, installed: isInstalled(id), exe: findExe(id) || ''
  }]))
}));
ipcMain.handle('open-profile', (_e, id, dir) => launch(id, [`--profile-directory=${dir}`]));
ipcMain.handle('add-profile', (_e, id) => launch(id, [`--profile-directory=${nextFreeProfileDir(id)}`]));
ipcMain.handle('save-config', (_e, patch) => {
  config = { ...config, ...patch };
  saveConfig();
  if (win) win.setAlwaysOnTop(!!config.alwaysOnTop);
  if ('glass' in patch) applyGlass();
  applyStartup();
  return config;
});
ipcMain.handle('pick-exe', async (_e, id) => {
  const r = await dialog.showOpenDialog(win, { title: `${BROWSERS[id].label} .exe নির্বাচন করুন`,
    properties: ['openFile'], filters: [{ name: 'Program', extensions: ['exe'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  config.customExe[id] = r.filePaths[0]; saveConfig();
  return r.filePaths[0];
});
ipcMain.on('win', (_e, action) => {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  if (action === 'hide') win.hide();
});

// ---------- app ----------
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { win.show(); win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.nurbuy.accounthub');
    createWindow(); createTray(); applyStartup(); watchProfiles();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => app.quit());
}
