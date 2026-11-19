// Electron host for the shared 3D visualizer engine.
//
// The engine is the standalone web build (engine/dist) served from a private
// `app://` scheme, so WASM, workers and fetch behave as on a normal origin.
// Local files reach the page through `app://file/<token>`: only paths the user
// opened (CLI, dialogs, drag and drop, recent list) are given a token, so the
// page cannot read arbitrary files.
//
// Every launch is its own independent instance with its own window.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const memory = require('./memory');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const SUPPORTED = new Set([
  'ply',
  'xyz',
  'xyzn',
  'xyzrgb',
  'pcd',
  'pts',
  'obj',
  'mtl',
  'stl',
  'off',
  'gltf',
  'glb',
  'las',
  'laz',
  'e57',
  'bin',
  'x3a',
  'x3r',
  'npy',
  'npz',
  'tif',
  'tiff',
  'pfm',
  'png',
  'exr',
  'json',
  'splat',
  'spz',
  'ksplat',
  'sog',
  'nrrd',
  'step',
  'stp',
  'iges',
  'igs',
  'fbx',
  '3mf',
]);
/** Formats picked up when scanning a folder: geometry only, not images/JSON. */
const FOLDER_SCAN = new Set([
  'ply',
  'xyz',
  'xyzn',
  'xyzrgb',
  'pcd',
  'pts',
  'obj',
  'stl',
  'off',
  'gltf',
  'glb',
  'las',
  'laz',
  'e57',
  'x3a',
  'splat',
  'spz',
  'ksplat',
  'sog',
]);
const MAX_FOLDER_FILES = 5000;
const MAX_RECENT = 12;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

// ---- preferences (recent items, remembered answers) ------------------------

const prefsFile = () => path.join(app.getPath('userData'), 'desktop-prefs.json');
let prefs = { recent: [], folderGrouping: null, lastDir: null, sessions: [], live: {} };

/** Sessions kept for File → Open Recent (closed windows, newest first). */
const MAX_SESSIONS = 3;
const validSession = s =>
  s &&
  Array.isArray(s.files) &&
  s.files.length > 0 &&
  s.files.every(f => f && typeof f.path === 'string');
function loadPrefs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(prefsFile(), 'utf8'));
    prefs = {
      recent: Array.isArray(parsed.recent)
        ? parsed.recent.filter(r => r && typeof r.path === 'string')
        : [],
      folderGrouping:
        parsed.folderGrouping === 'group' || parsed.folderGrouping === 'all'
          ? parsed.folderGrouping
          : null,
      lastDir: typeof parsed.lastDir === 'string' ? parsed.lastDir : null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions.filter(validSession) : [],
      live: {},
    };
    // Windows still open when the app last stopped (a crash, a kill): their
    // sessions count as closed now.
    const live = parsed.live && typeof parsed.live === 'object' ? Object.values(parsed.live) : [];
    if (live.length) {
      for (const session of live.filter(validSession)) keepSession(session);
      savePrefs();
    }
  } catch {
    // first run or unreadable: defaults
  }
}
function savePrefs() {
  try {
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error('Could not save preferences', error);
  }
}
/** File dialogs start in the folder of the file added last. */
function rememberAdded(filePaths) {
  const last = filePaths[filePaths.length - 1];
  if (!last || !path.isAbsolute(last)) return;
  const dir = path.dirname(last);
  if (dir === prefs.lastDir) return;
  prefs.lastDir = dir;
  savePrefs();
}

let saveTimer = null;
/** Saves soon, once for a burst of changes (sessions report as they change). */
function savePrefsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePrefs, 1000);
}

const sameFiles = (a, b) =>
  a.files.length === b.files.length && a.files.every((f, i) => f.path === b.files[i].path);

/** Adds a session to the reopenable ones (newest first, no duplicates). */
function keepSession(session) {
  prefs.sessions = [
    { ...session, closedAt: session.closedAt ?? Date.now() },
    ...prefs.sessions.filter(s => !sameFiles(s, session)),
  ].slice(0, MAX_SESSIONS);
}

/** "5 files in 2 groups · scans · 16 Nov 14:32" */
function sessionLabel(session) {
  const n = session.files.length;
  const groups = session.groupCount > 1 ? ` in ${session.groupCount} groups` : '';
  const dirs = session.files.map(f => path.dirname(f.path));
  let common = dirs[0];
  while (common && !dirs.every(d => d === common || d.startsWith(common + path.sep))) {
    const up = path.dirname(common);
    common = up === common ? '' : up;
  }
  const hint =
    common && common !== path.parse(common).root
      ? path.basename(common)
      : path.basename(session.files[0].path);
  const when = new Date(session.closedAt).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${n} file${n === 1 ? '' : 's'}${groups} · ${hint} · ${when}`;
}

/**
 * Reopens a saved session in `win`, replacing its scene: its files in their
 * list order, each with the share of points it had, and its grouping and
 * active group. Files gone from disk are skipped and listed afterwards.
 */
async function restoreSession(win, session) {
  const present = session.files.filter(f => isFile(f.path));
  const missing = session.files.filter(f => !isFile(f.path));
  if (!present.length) {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Nothing to reopen',
      message: 'None of the files of that session exist any more.',
      detail: missing.map(f => f.path).join('\n'),
    });
    return;
  }
  const estimate = memory.estimateFiles(present.map(f => f.path));
  const choice = await warnIfTooLarge(win, estimate, present.length);
  if (choice === 'cancel') return;
  let subsample;
  if (choice === 'subsample') {
    subsample = await askSubsample(win, estimate, { replace: true });
    if (!subsample) return;
  }
  rememberAdded(present.map(f => f.path));
  deliver(win, {
    subsample,
    files: present.map(f => {
      const token = crypto.randomUUID();
      openedFiles.set(token, f.path);
      return {
        name: typeof f.name === 'string' && f.name ? f.name : path.basename(f.path),
        path: f.path,
        url: `app://file/${token}`,
        size: fs.statSync(f.path).size,
        ...(f.subsample && f.subsample.fraction > 0
          ? { subsample: { fraction: f.subsample.fraction } }
          : {}),
        ...(f.settings && typeof f.settings === 'object' ? { settings: f.settings } : {}),
      };
    }),
    grouping:
      session.grouping && typeof session.grouping.regex === 'string'
        ? { regex: session.grouping.regex, enabled: session.grouping.enabled === true }
        : 'off',
    activeGroup: session.activeGroup || null,
    title: sessionLabel(session).split(' · ')[1],
    replace: true,
  });
  if (missing.length) {
    void dialog.showMessageBox(win, {
      type: 'info',
      title: 'Some files are missing',
      message: `${missing.length} of the session's ${session.files.length} files no longer exist and were skipped.`,
      detail: missing.map(f => f.path).join('\n'),
    });
  }
}

function addRecent(kind, p) {
  prefs.recent = [{ kind, path: p }, ...prefs.recent.filter(r => r.path !== p)].slice(
    0,
    MAX_RECENT
  );
  savePrefs();
  app.addRecentDocument(p);
  buildMenu();
}

// ---- files and folders -----------------------------------------------------

const extOf = p => path.extname(p).slice(1).toLowerCase();
const isDir = p => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const isFile = p => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Supported geometry under `root`, as paths relative to it, naturally sorted. */
function scanFolder(root) {
  const found = [];
  // Symlinks are followed (and keep their own names); real paths of the
  // folders walked so far stop a link back up the tree from looping.
  const visited = new Set();
  const walk = dir => {
    let entries;
    try {
      const real = fs.realpathSync(dir);
      if (visited.has(real)) return;
      visited.add(real);
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_FOLDER_FILES) return;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const linked = entry.isSymbolicLink();
      const directory = linked ? isDir(full) : entry.isDirectory();
      const file = linked ? isFile(full) : entry.isFile();
      if (directory) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (file && FOLDER_SCAN.has(extOf(entry.name))) {
        found.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  return found.sort(natural.compare);
}

/**
 * Expands what the user opened into files with display names. A single folder
 * gives names relative to it, so its subfolders become part of the names (and
 * can be grouped by); several items keep each folder's own name in front.
 */
function collect(paths) {
  if (paths.length === 1 && isDir(paths[0])) {
    const root = paths[0];
    const rel = scanFolder(root);
    const nested = rel.filter(name => name.includes(path.sep));
    return {
      items: rel.map(name => ({ abs: path.join(root, name), name })),
      folder: {
        root,
        hasRootFiles: nested.length < rel.length,
        subfolders: new Set(nested.map(name => name.split(path.sep)[0])).size,
      },
    };
  }
  const items = [];
  for (const p of paths) {
    if (isDir(p)) {
      for (const name of scanFolder(p)) {
        items.push({ abs: path.join(p, name), name: path.join(path.basename(p), name) });
      }
    } else if (isFile(p)) {
      items.push({ abs: p, name: path.basename(p) });
    }
  }
  return { items, folder: null };
}

async function askFolderGrouping(win, folder, count) {
  if (prefs.folderGrouping) {
    return prefs.folderGrouping;
  }
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Open Folder',
    message: 'Group the files by subfolder?',
    detail:
      `“${path.basename(folder.root)}” has no files at its top level; its ${count} files are in ` +
      `${folder.subfolders} subfolder${folder.subfolders === 1 ? '' : 's'}.\n\n` +
      'Grouping shows one subfolder at a time (← / → to switch). You can change this later with ' +
      'Group in the file list.',
    buttons: ['Group by Subfolder', 'Show Everything'],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: "Don't ask again",
    noLink: true,
  });
  const choice = response === 0 ? 'group' : 'all';
  if (checkboxChecked) {
    prefs.folderGrouping = choice;
    savePrefs();
  }
  return choice;
}

/**
 * Opens files/folders in `win`: replacing its scene or adding to it.
 * `subsample` asks for load-time subsampling first (File > Advanced Open);
 * a normal open warns when the files likely do not fit in free memory.
 */
async function openPaths(win, paths, { replace, subsample = false }) {
  const resolved = paths.map(p => path.resolve(p));
  const { items, folder } = collect(resolved);
  if (!items.length) {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Nothing to open',
      message: 'No supported 3D files found.',
      detail: resolved.join('\n'),
    });
    return;
  }
  // Grouping is decided for a whole folder only: grouped by subfolder when
  // everything sits in subfolders (and the user agrees), otherwise ungrouped.
  let grouping;
  if (folder) {
    const group =
      !folder.hasRootFiles && (await askFolderGrouping(win, folder, items.length)) === 'group';
    grouping = group ? 'folder' : 'off';
    addRecent('folder', folder.root);
  } else {
    for (const p of resolved) addRecent(isDir(p) ? 'folder' : 'file', p);
  }
  rememberAdded(items.map(item => item.abs));
  const title = folder
    ? path.basename(folder.root)
    : items.length === 1
      ? items[0].name
      : `${items[0].name} +${items.length - 1}`;

  const estimate = memory.estimateFiles(items.map(item => item.abs));
  let subsampleOptions;
  if (!subsample) {
    const choice = await warnIfTooLarge(win, estimate, items.length);
    if (choice === 'cancel') return;
    subsample = choice === 'subsample';
  }
  if (subsample) {
    subsampleOptions = await askSubsample(win, estimate, { replace });
    if (!subsampleOptions) return;
  }
  deliver(win, {
    subsample: subsampleOptions,
    files: items.map(item => {
      const token = crypto.randomUUID();
      openedFiles.set(token, item.abs);
      return {
        name: item.name,
        path: item.abs,
        url: `app://file/${token}`,
        size: fs.statSync(item.abs).size,
      };
    }),
    grouping,
    title,
    replace,
  });
}

/** Share of available memory a normal open may take before it warns. */
const WARN_SHARE = 0.8;

async function warnIfTooLarge(win, estimate, count) {
  const { available, total } = memory.memoryInfo();
  if (estimate.peak <= available * WARN_SHARE) return 'load';
  const exact = estimate.exact;
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Large files',
    message: 'These files may not fit in memory.',
    detail:
      `${count} file${count === 1 ? '' : 's'}, ${memory.formatBytes(estimate.bytes)} on disk, ` +
      `${exact ? '' : 'about '}${memory.formatPoints(estimate.points)} points.\n` +
      `Loading everything needs at least ${memory.formatBytes(estimate.peak)} ` +
      `(${memory.formatBytes(estimate.steady)} once loaded); ` +
      `${memory.formatBytes(available)} of ${memory.formatBytes(total)} is free now.\n\n` +
      'Subsampling loads the files one at a time and keeps only part of each.',
    buttons: ['Subsample…', 'Load Anyway', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return ['subsample', 'load', 'cancel'][response];
}

/** Resolves once the window's page can take requests. */
function windowReady(win) {
  const state = windowState.get(win);
  if (state.ready) return Promise.resolve();
  return new Promise(resolve => state.readyWaiters.push(resolve));
}

let askSeq = 0;
/** id -> { resolve, contents } for subsample dialogs open in a page. */
const pendingAsks = new Map();

/** Shows the subsampling dialog in the page; resolves to options or null. */
async function askSubsample(win, estimate, { replace }) {
  await windowReady(win);
  if (win.isDestroyed()) return null;
  const id = ++askSeq;
  return new Promise(resolve => {
    pendingAsks.set(id, { resolve, contents: win.webContents });
    win.webContents.send('ask-subsample', {
      id,
      replace,
      bytes: estimate.bytes,
      exact: estimate.exact,
      // Per-file costs; the page plans with loadBudget.js, as here.
      files: estimate.files,
      ...memory.memoryInfo(),
    });
  });
}

function cancelAsks(contents) {
  for (const [id, ask] of pendingAsks) {
    if (ask.contents === contents) {
      pendingAsks.delete(id);
      ask.resolve(null);
    }
  }
}

// ---- windows ---------------------------------------------------------------

/** token -> absolute path, for files the user chose to open. */
const openedFiles = new Map();
/** Per window: viewer ready, and payloads waiting for it. */
const windowState = new WeakMap();

function deliver(win, payload) {
  const state = windowState.get(win);
  if (payload.replace) {
    // "Open" replaces the scene: load into a fresh page. This host cannot
    // know what the page shows (files also arrive through the page's own
    // button and drops), so a loaded page is always reloaded; a page still
    // loading is fresh already. Anything queued before is superseded.
    state.queued = [{ ...payload, replace: false }];
    if (state.ready) {
      state.ready = false;
      win.webContents.reload();
    }
    return;
  }
  if (!state.ready) {
    state.queued.push(payload);
    return;
  }
  win.webContents.send('open-files', payload);
}

const focusedWindow = () =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? createWindow([]);

async function pick(win, kind, replace, subsample = false) {
  const folder = kind === 'folder';
  const result = await dialog.showOpenDialog(win, {
    title: subsample
      ? `${replace ? 'Open' : 'Add'} ${folder ? 'Folder' : 'Files'} with Subsampling`
      : replace
        ? `Open ${folder ? 'Folder' : 'Files'} (replaces the scene)`
        : `Add ${folder ? 'Folder' : 'Files'} to Scene`,
    ...(prefs.lastDir && isDir(prefs.lastDir) ? { defaultPath: prefs.lastDir } : {}),
    properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'],
    filters: folder
      ? undefined
      : [
          { name: '3D data', extensions: [...SUPPORTED] },
          { name: 'All files', extensions: ['*'] },
        ],
  });
  if (!result.canceled && result.filePaths.length) {
    await openPaths(win, result.filePaths, { replace, subsample });
  }
}

function clearScene(win) {
  windowState.get(win).queued = [];
  win.webContents.reload();
}

/** The focused window's solo panel visibility, as last reported by its page. */
function soloPanelChecked() {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return win ? windowState.get(win)?.soloPanelVisible !== false : true;
}

/** The focused window's navigation panel visibility, as last reported by its page. */
function navigationPanelChecked() {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return win ? windowState.get(win)?.navigationPanelVisible === true : false;
}

/** The focused window's file name options, as last reported by its page. */
function fileNameOptions() {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return (
    (win && windowState.get(win)?.fileNames) || {
      fullPaths: false,
      abbreviate: false,
      originalNames: false,
    }
  );
}

function syncViewMenu() {
  const menu = Menu.getApplicationMenu();
  const solo = menu?.getMenuItemById('solo-panel');
  if (solo) solo.checked = soloPanelChecked();
  const navigation = menu?.getMenuItemById('navigation-panel');
  if (navigation) navigation.checked = navigationPanelChecked();
  const names = fileNameOptions();
  const fullPaths = menu?.getMenuItemById('file-full-paths');
  if (fullPaths) fullPaths.checked = names.fullPaths;
  const abbreviate = menu?.getMenuItemById('file-abbreviate');
  if (abbreviate) abbreviate.checked = names.abbreviate;
  const originalNames = menu?.getMenuItemById('file-original-names');
  if (originalNames) originalNames.checked = names.originalNames;
}

/**
 * The window a View menu click is for: the one Electron passes, else the
 * focused one, else any. (getFocusedWindow() alone can be empty, and the
 * checkbox would then flip without the page changing.)
 */
const menuWindow = win =>
  (win instanceof BrowserWindow ? win : null) ??
  BrowserWindow.getFocusedWindow() ??
  BrowserWindow.getAllWindows()[0];

const toggleFileNameOption = (key, win) =>
  menuWindow(win)?.webContents.send('toggle-file-name-option', key);

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const recent = prefs.recent.filter(r => (r.kind === 'folder' ? isDir(r.path) : isFile(r.path)));
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '&File',
      submenu: [
        {
          label: '&Open Files…',
          accelerator: 'CmdOrCtrl+O',
          click: () => pick(focusedWindow(), 'files', true),
        },
        {
          label: 'Open &Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => pick(focusedWindow(), 'folder', true),
        },
        {
          label: 'Open &Recent',
          submenu: [
            ...prefs.sessions.map((session, i) => ({
              label: `${i === 0 ? 'Last session' : 'Earlier session'}: ${sessionLabel(session)}`,
              click: () => restoreSession(focusedWindow(), session),
            })),
            ...(prefs.sessions.length ? [{ type: 'separator' }] : []),
            ...(recent.length
              ? recent.map(r => ({
                  label: r.kind === 'folder' ? `${r.path}${path.sep}` : r.path,
                  click: () => openPaths(focusedWindow(), [r.path], { replace: true }),
                }))
              : [{ label: 'No recent items', enabled: false }]),
            { type: 'separator' },
            {
              label: 'Clear Recently Opened',
              enabled: recent.length > 0 || prefs.sessions.length > 0,
              click: () => {
                prefs.recent = [];
                prefs.sessions = [];
                savePrefs();
                app.clearRecentDocuments();
                buildMenu();
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: '&Add Files to Scene…',
          accelerator: 'CmdOrCtrl+Alt+O',
          click: () => pick(focusedWindow(), 'files', false),
        },
        { label: 'Add Fol&der to Scene…', click: () => pick(focusedWindow(), 'folder', false) },
        {
          label: 'Ad&vanced Open',
          submenu: [
            {
              label: 'Open Files with &Subsampling…',
              click: () => pick(focusedWindow(), 'files', true, true),
            },
            {
              label: 'Open &Folder with Subsampling…',
              click: () => pick(focusedWindow(), 'folder', true, true),
            },
            { type: 'separator' },
            {
              label: '&Add Files with Subsampling…',
              click: () => pick(focusedWindow(), 'files', false, true),
            },
            {
              label: 'Add Fol&der with Subsampling…',
              click: () => pick(focusedWindow(), 'folder', false, true),
            },
          ],
        },
        { type: 'separator' },
        { label: '&Clear Scene', click: () => clearScene(focusedWindow()) },
        { type: 'separator' },
        { label: '&New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow([]) },
        {
          label: 'Close &Window',
          accelerator: 'CmdOrCtrl+W',
          click: () => BrowserWindow.getFocusedWindow()?.close(),
        },
        ...(isMac
          ? []
          : [{ type: 'separator' }, { label: '&Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' }]),
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        {
          id: 'solo-panel',
          label: '&Solo Panel',
          type: 'checkbox',
          checked: soloPanelChecked(),
          click: (_item, win) => menuWindow(win)?.webContents.send('toggle-solo-panel'),
        },
        {
          id: 'navigation-panel',
          label: '&Navigation Panel',
          type: 'checkbox',
          checked: navigationPanelChecked(),
          click: (_item, win) => menuWindow(win)?.webContents.send('toggle-navigation-panel'),
        },
        {
          label: 'Files &Panel',
          submenu: [
            {
              id: 'file-full-paths',
              label: 'Show &Full Paths',
              type: 'checkbox',
              checked: fileNameOptions().fullPaths,
              click: (_item, win) => toggleFileNameOption('fullPaths', win),
            },
            {
              id: 'file-abbreviate',
              label: '&Abbreviate Identical Parts',
              type: 'checkbox',
              checked: fileNameOptions().abbreviate,
              click: (_item, win) => toggleFileNameOption('abbreviate', win),
            },
            {
              id: 'file-original-names',
              label: 'Show &Original Names',
              type: 'checkbox',
              checked: fileNameOptions().originalNames,
              click: (_item, win) => toggleFileNameOption('originalNames', win),
            },
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Zoom &In', role: 'zoomIn' },
        { label: 'Zoom &Out', role: 'zoomOut' },
        { label: '&Actual Size', role: 'resetZoom' },
        { type: 'separator' },
        { label: '&Developer', submenu: [{ role: 'toggleDevTools' }, { role: 'forceReload' }] },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: '&Keyboard Shortcuts',
          accelerator: 'F1',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('show-shortcuts'),
        },
        {
          label: 'Viewer &Guide',
          click: () => shell.openExternal('https://3d.f-kleinicke.de/guide.html'),
        },
        {
          label: '&Upstream Project',
          click: () => shell.openExternal('https://github.com/kleinicke/ply-visualizer'),
        },
        { type: 'separator' },
        { label: '&About PLY Visualizer', role: 'about' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(initialPaths) {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#1e1e1e',
    title: 'PLY Visualizer',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  // External links (guide, upstream) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  windowState.set(win, { ready: false, queued: [], readyWaiters: [], soloPanelVisible: true });
  const contents = win.webContents;
  win.on('closed', () => cancelAsks(contents));
  // Its files become a session to reopen from File → Open Recent.
  const id = win.id;
  win.on('close', () => {
    const session = prefs.live[id];
    delete prefs.live[id];
    if (validSession(session)) {
      keepSession(session);
      buildMenu();
    }
    savePrefs();
  });
  win.on('focus', syncViewMenu);
  // macOS trackpad rotate: web content never sees it, so pass it on to roll
  // the camera (degrees since the last event, counterclockwise positive).
  win.on('rotate-gesture', (_event, rotation) => {
    if (Number.isFinite(rotation) && rotation !== 0) {
      win.webContents.send('rotate-gesture', rotation);
    }
  });
  win.webContents.on('did-start-loading', () => {
    windowState.get(win).ready = false;
    cancelAsks(win.webContents);
  });
  win.loadURL('app://web/index.html');
  if (initialPaths.length) {
    void openPaths(win, initialPaths, { replace: false });
  }
  return win;
}

ipcMain.on('renderer-ready', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = win && windowState.get(win);
  if (!state) return;
  state.ready = true;
  for (const resolve of state.readyWaiters.splice(0)) resolve();
  const queued = state.queued;
  state.queued = [];
  for (const payload of queued) win.webContents.send('open-files', payload);
});
ipcMain.on('drop-paths', (event, paths) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && Array.isArray(paths) && paths.length) {
    void openPaths(
      win,
      paths.filter(p => typeof p === 'string' && p),
      { replace: false }
    );
  }
});
ipcMain.on('subsample-answer', (event, answer) => {
  const ask = pendingAsks.get(answer?.id);
  if (!ask || ask.contents !== event.sender) return;
  pendingAsks.delete(answer.id);
  const o = answer.options;
  const valid =
    o &&
    typeof o === 'object' &&
    ((typeof o.fraction === 'number' && o.fraction > 0 && o.fraction <= 1) ||
      (typeof o.maxPoints === 'number' && o.maxPoints >= 1));
  ask.resolve(
    valid
      ? {
          ...(typeof o.fraction === 'number' ? { fraction: o.fraction } : {}),
          ...(typeof o.maxPoints === 'number' ? { maxPoints: Math.floor(o.maxPoints) } : {}),
        }
      : null
  );
});
ipcMain.on('solo-panel-visibility', (event, visible) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = win && windowState.get(win);
  if (state) {
    state.soloPanelVisible = visible !== false;
    syncViewMenu();
  }
});
ipcMain.on('navigation-panel-visibility', (event, visible) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = win && windowState.get(win);
  if (state) {
    state.navigationPanelVisible = visible === true;
    syncViewMenu();
  }
});
ipcMain.on('file-name-options', (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = win && windowState.get(win);
  if (state) {
    state.fileNames = {
      fullPaths: options?.fullPaths === true,
      abbreviate: options?.abbreviate === true,
      originalNames: options?.originalNames === true,
    };
    syncViewMenu();
  }
});
// The page's "+ Add Point Cloud" button: the native dialog, which (unlike the
// page's file input) can start in the folder of the last added file.
ipcMain.on('pick-add-files', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) void pick(win, 'files', false);
});
// Files the page loaded on its own (small drops), for the dialogs' start folder.
ipcMain.on('files-added', (_event, paths) => {
  if (Array.isArray(paths)) rememberAdded(paths.filter(p => typeof p === 'string'));
});
// What a window shows (desktop.js), kept on disk as it changes so a crash
// does not lose it; it becomes a reopenable session when the window closes.
ipcMain.on('session', (event, session) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (validSession(session)) prefs.live[win.id] = session;
  else delete prefs.live[win.id];
  savePrefsSoon();
});
ipcMain.on('set-title', (event, title) => {
  BrowserWindow.fromWebContents(event.sender)?.setTitle(String(title));
});

app.setAboutPanelOptions({
  applicationName: 'PLY Visualizer',
  applicationVersion: app.getVersion(),
  credits: 'Desktop build of kleinicke/ply-visualizer (MIT), with solo and grouping.',
  website: 'https://github.com/kleinicke/ply-visualizer',
});

app.whenReady().then(() => {
  loadPrefs();
  protocol.handle('app', request => {
    const url = new URL(request.url);
    if (url.host === 'file') {
      const filePath = openedFiles.get(url.pathname.slice(1));
      if (!filePath) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    }
    if (url.host === 'web') {
      const resolved = path.normalize(path.join(WEB_ROOT, decodeURIComponent(url.pathname)));
      if (!resolved.startsWith(WEB_ROOT)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(resolved).toString());
    }
    return new Response('Not found', { status: 404 });
  });
  buildMenu();
  // argv[0] is the executable; in development argv[1] is the app directory.
  // Launchers may put flags before the app path, so drop the app path itself too.
  const appPath = path.resolve(app.getAppPath());
  const args = process.argv
    .slice(1)
    .filter(arg => !arg.startsWith('-') && path.resolve(arg) !== appPath);
  createWindow(args.filter(arg => isFile(arg) || isDir(arg)));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow([]);
  });
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) void openPaths(focusedWindow(), [filePath], { replace: false });
});

// Closing the last window quits, on macOS too: a viewer with no window open
// has nothing to show, and lingering in the Dock only holds memory.
app.on('window-all-closed', () => app.quit());
