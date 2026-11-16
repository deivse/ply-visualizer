// Minimal, explicit bridge: the page gets no Node access.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('plyDesktop', {
  /** OS path separator; names of files opened from a folder use it. */
  pathSep: process.platform === 'win32' ? '\\' : '/',
  ready: () => ipcRenderer.send('renderer-ready'),
  setTitle: title => ipcRenderer.send('set-title', String(title)),
  onOpenFiles: callback => {
    ipcRenderer.on('open-files', (_event, payload) => callback(payload));
  },
  onShowShortcuts: callback => {
    ipcRenderer.on('show-shortcuts', () => callback());
  },
  onToggleSoloPanel: callback => {
    ipcRenderer.on('toggle-solo-panel', () => callback());
  },
  /** File > Advanced Open: the host asks how to subsample; answer with options or null. */
  onAskSubsample: callback => {
    ipcRenderer.on('ask-subsample', (_event, request) => callback(request));
  },
  answerSubsample: (id, options) => ipcRenderer.send('subsample-answer', { id, options }),
  reportSoloPanel: visible => ipcRenderer.send('solo-panel-visibility', visible === true),
  /** The window's files and grouping, so File → Open Recent can reopen them. */
  reportSession: session => ipcRenderer.send('session', session),
  /** Absolute path of a File the page got from a drop or its file input, or ''. */
  pathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  /** Paths of files the page loaded, so file dialogs start next to the last one. */
  filesAdded: paths => ipcRenderer.send('files-added', [...paths].map(String)),
  /** View → Files Panel: full paths / abbreviate identical parts / original names. */
  onToggleFileNameOption: callback => {
    ipcRenderer.on('toggle-file-name-option', (_event, key) => callback(String(key)));
  },
  reportFileNameOptions: options =>
    ipcRenderer.send('file-name-options', {
      fullPaths: options?.fullPaths === true,
      abbreviate: options?.abbreviate === true,
      originalNames: options?.originalNames === true,
    }),
});

// "+ Add Point Cloud" clicks the page's hidden file input. Chromium's picker
// cannot be told where to start, so the host's native dialog opens instead,
// in the folder of the file added last.
window.addEventListener(
  'click',
  event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'hiddenFileInput') {
      event.preventDefault();
      ipcRenderer.send('pick-add-files');
    }
  },
  true
);

// Dropping a folder (or a mix with folders) onto the window opens it like
// File > Add Folder…: the page itself only understands plain files, so such
// drops go to the desktop host, which scans the folder. So do large drops,
// so the host can check them against free memory. Small plain-file drops
// keep going to the page's own handler.
const LARGE_DROP_BYTES = 256 * 1024 * 1024;
window.addEventListener(
  'drop',
  event => {
    const transfer = event.dataTransfer;
    if (!transfer || !transfer.files.length) return;
    const hasFolder = [...transfer.items].some(item => item.webkitGetAsEntry?.()?.isDirectory);
    // Large drops go through the host too, which warns when they will not
    // fit in memory (and offers subsampling).
    const bytes = [...transfer.files].reduce((sum, file) => sum + file.size, 0);
    if (!hasFolder && bytes < LARGE_DROP_BYTES) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const paths = [...transfer.files].map(file => webUtils.getPathForFile(file)).filter(Boolean);
    ipcRenderer.send('drop-paths', paths);
  },
  true
);
