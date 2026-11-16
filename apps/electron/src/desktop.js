// Runs in the page after the engine bundle. Feeds files the desktop host opens
// (command line, File menu, recent list, dropped folders) into the engine's
// normal browser file path, exactly as if they had been dropped onto the
// window, and applies the host's grouping decision for opened folders.
(function () {
  const bridge = window.plyDesktop;
  if (!bridge) {
    return;
  }

  function whenReady() {
    if (document.documentElement.dataset.visualizerReady === 'true' && window.visualizer) {
      return Promise.resolve(window.visualizer);
    }
    return new Promise(resolve => {
      window.addEventListener('visualizer-ready', () => resolve(window.visualizer), { once: true });
    });
  }

  // Same text as the engine's "Top-level folder" preset, so it is one entry
  // in the recent-patterns list.
  const folderRegex = bridge.pathSep === '\\' ? '^([^\\\\]+)\\\\' : '^([^/]+)/';

  const titles = [];
  function updateTitle() {
    const extra = titles.length > 1 ? ` +${titles.length - 1} more` : '';
    bridge.setTitle(titles.length ? `${titles[0]}${extra} — PLY Visualizer` : 'PLY Visualizer');
  }

  // A File-like object whose bytes are fetched when the page asks for them.
  // A real File would need a Blob, which Chromium copies into its blob
  // storage (spilling large ones to disk) on top of the page's own copy.
  function readFile(file) {
    return {
      name: file.name,
      // Absolute path on disk, shown with View → Files → Show Full Paths.
      path: file.path,
      size: file.size,
      type: '',
      webkitRelativePath: '',
      async arrayBuffer() {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error(`Could not read ${file.name}`);
        }
        return response.arrayBuffer();
      },
    };
  }

  // Subsampled loading reads, parses and thins one file at a time, so only
  // one full-size file is ever in memory. A restored session gives each file
  // its own share (file.subsample).
  async function loadSubsampled(viewer, files, subsample) {
    for (let i = 0; i < files.length; i++) {
      bridge.setTitle(`Loading ${i + 1}/${files.length}… — PLY Visualizer`);
      try {
        const options = files[i].subsample || subsample;
        await viewer.handleBrowserFiles(
          [readFile(files[i])],
          options ? { subsample: options } : {}
        );
      } catch (error) {
        console.error(error);
        viewer.showError?.(`Failed to load ${files[i].name}: ${error?.message ?? error}`);
      }
      // Let the page drop the previous file's buffers before the next one.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  let chain = Promise.resolve();
  bridge.onOpenFiles(payload => {
    // Serialize batches so file order (and therefore solo keys 1-9) matches
    // the order they were opened in.
    chain = chain
      .then(async () => {
        const viewer = await whenReady();
        // Decide grouping before the files arrive, so a grouped folder never
        // flashes every cloud at once.
        if (payload.grouping === 'folder') {
          viewer.solo.setGroupRegex(folderRegex, true);
        } else if (payload.grouping === 'off') {
          viewer.solo.setGroupingEnabled(false);
        } else if (payload.grouping && typeof payload.grouping === 'object') {
          // A restored session's own pattern, and the group it showed: shown
          // once its files are in, unless another one is picked meanwhile.
          viewer.solo.setGroupRegex(payload.grouping.regex, payload.grouping.enabled);
          if (payload.activeGroup) viewer.solo.preferGroup(payload.activeGroup);
        }
        if (payload.subsample || payload.files.some(file => file.subsample)) {
          await loadSubsampled(viewer, payload.files, payload.subsample);
        } else {
          await viewer.handleBrowserFiles(payload.files.map(readFile));
        }
        applySettings(viewer, payload.files);
        if (payload.title) titles.push(payload.title);
        updateTitle();
      })
      .catch(error => {
        console.error(error);
        window.visualizer?.showError?.(String(error && error.message ? error.message : error));
      });
  });

  // ---- session: what this window shows, so the host can reopen it --------

  /**
   * The window's files in list order (path, the name they were opened with,
   * and the share of points kept if subsampled) and its grouping. Files with
   * no path on disk (examples, generated data) are not part of it.
   */
  function sessionSnapshot(viewer) {
    const seen = new Set();
    const files = viewer.fileEntries.all
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.parentId === null && entry.spatial?.data?.filePath)
      .sort(
        (a, b) =>
          (a.entry.state.listOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.entry.state.listOrder ?? Number.MAX_SAFE_INTEGER) || a.index - b.index
      )
      .filter(
        ({ entry }) =>
          !seen.has(entry.spatial.data.filePath) && seen.add(entry.spatial.data.filePath)
      )
      .map(({ entry, index }) => {
        const data = entry.spatial.data;
        const share = data.pointsBeforeSubsample
          ? data.vertexCount / data.pointsBeforeSubsample
          : 1;
        return {
          path: data.filePath,
          name: data.sourceName || data.fileName,
          ...(share < 1
            ? { subsample: { fraction: Math.max(1e-6, Number(share.toPrecision(6))) } }
            : {}),
          settings: fileSettings(viewer, entry, index),
        };
      });
    const groups = viewer.solo.groupSettings();
    return {
      files,
      grouping: { enabled: groups.enabled, regex: groups.regex },
      activeGroup: groups.enabled ? groups.active : null,
      groupCount: groups.enabled ? groups.count : 0,
    };
  }

  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  /** A file's own settings, as a session keeps them. */
  function fileSettings(viewer, entry, index) {
    const s = entry.state;
    const matrix = viewer.getTransformationMatrixAsArray(index);
    return {
      size: s.pointSize,
      color: s.colorMode,
      visible: viewer.solo.baseVisible(entry),
      collapsed: !!s.collapsed,
      modes: {
        points: !!s.pointsVisible,
        mesh: !!s.solidVisible,
        wireframe: !!s.wireframeVisible,
        normals: !!s.normalsVisible,
        splat: !!s.splatModeActive,
      },
      ...(matrix.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12) ? {} : { matrix }),
      soloed: viewer.solo.isSoloed(entry.id),
      locked: viewer.solo.isLocked(entry.id),
    };
  }

  /**
   * Puts a restored session's settings back on its files once they are
   * loaded: transform, size, colour, render modes, visibility, collapsed,
   * then solo and locks (so a lock freezes the restored solo state).
   */
  function applySettings(viewer, files) {
    const byPath = new Map(files.filter(f => f.settings).map(f => [f.path, f.settings]));
    if (!byPath.size) return;
    const restored = [];
    viewer.fileEntries.all.forEach((entry, index) => {
      const s = entry.parentId === null && byPath.get(entry.spatial?.data?.filePath);
      if (!s) return;
      byPath.delete(entry.spatial.data.filePath);
      restored.push({ entry, s });
      try {
        if (s.matrix) viewer.setTransformationMatrixArray(index, s.matrix);
        if (s.size > 0 && s.size !== entry.state.pointSize) viewer.updatePointSize(index, s.size);
        if (s.color && s.color !== entry.state.colorMode)
          viewer.onFileColorModeChange(index, s.color);
        const m = s.modes || {};
        const toggle = mode => viewer.toggleUniversalRenderMode(index, mode);
        if (m.splat && !entry.state.splatModeActive) toggle('splat');
        for (const [mode, field] of [
          ['mesh', 'solidVisible'],
          ['wireframe', 'wireframeVisible'],
          ['normals', 'normalsVisible'],
        ]) {
          if (mode in m && m[mode] !== !!entry.state[field]) toggle(mode);
        }
        if (!m.splat && 'points' in m && m.points !== !!entry.state.pointsVisible) toggle('points');
        if (s.visible === false) viewer.solo.setBaseVisible(entry, false);
        entry.state.collapsed = !!s.collapsed;
      } catch (error) {
        console.error('Could not restore the settings of', entry.spatial?.data?.fileName, error);
      }
    });
    for (const { entry, s } of restored) if (s.soloed) viewer.solo.toggleAdditive(entry.id);
    for (const { entry, s } of restored) if (s.locked) viewer.solo.toggleLock(entry.id);
    viewer.requestRender?.();
  }

  // Reported when it changes; cheap enough to check every second and a half.
  let lastSession = '';
  function reportSession() {
    const viewer = window.visualizer;
    if (!viewer?.fileEntries || !viewer.solo?.groupSettings) return;
    const session = sessionSnapshot(viewer);
    const text = JSON.stringify(session);
    if (text === lastSession) return;
    lastSession = text;
    bridge.reportSession(session);
  }
  whenReady().then(() => {
    reportSession();
    setInterval(reportSession, 1500);
  });

  bridge.onAskSubsample(request => {
    showSubsampleDialog(request).then(options => bridge.answerSubsample(request.id, options));
  });

  bridge.onShowShortcuts(() => window.visualizer?.showKeyboardShortcuts?.());

  // View → Solo Panel mirrors the panel; the page reports every change
  // (its own ✕ and file-list button included).
  bridge.onToggleSoloPanel(() => window.visualizer?.solo?.togglePanel());
  window.addEventListener('solo-panel-visibility', event =>
    bridge.reportSoloPanel(event.detail.visible)
  );
  whenReady().then(viewer => bridge.reportSoloPanel(!viewer.solo.panelHidden));

  // View → Files → Show Full Paths / Abbreviate Identical Parts mirror the
  // options of the file list (also in its right-click menu).
  bridge.onToggleFileNameOption(key => window.plyFileNames?.toggle(key));
  window.addEventListener('file-name-options', event => bridge.reportFileNameOptions(event.detail));
  whenReady().then(() => {
    if (window.plyFileNames) bridge.reportFileNameOptions(window.plyFileNames.get());
  });

  // "+ Add Point Cloud" keeps working through the page's own file input; the
  // File menu uses native dialogs (files or folders).
  whenReady().then(() => bridge.ready());

  // ---- File > Advanced Open: subsampling dialog ---------------------------

  const PREFS_KEY = 'ply-visualizer.subsample.v1';
  function loadPrefs() {
    try {
      return {
        mode: 'fit',
        fit: 50,
        percent: 10,
        max: 1000000,
        ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'),
      };
    } catch {
      return { mode: 'fit', fit: 50, percent: 10, max: 1000000 };
    }
  }
  function savePrefs(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // per-viewer convenience only
    }
  }

  function formatBytes(bytes) {
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
  }
  function formatPoints(points) {
    if (points >= 1e9) return `${(points / 1e9).toFixed(1)}B`;
    if (points >= 1e6) return `${(points / 1e6).toFixed(1)}M`;
    if (points >= 1e3) return `${Math.round(points / 1e3)}k`;
    return String(Math.round(points));
  }

  let dialogStyled = false;
  function styleDialog() {
    if (dialogStyled) return;
    dialogStyled = true;
    const style = document.createElement('style');
    style.textContent = `
      .subsample-backdrop { position: fixed; inset: 0; z-index: 2147483000; background: rgba(0,0,0,.45);
        display: flex; align-items: center; justify-content: center; padding: 16px; }
      .subsample-dialog { width: min(480px, 100%); max-height: calc(100vh - 32px); overflow: auto;
        background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-foreground, #ccc);
        border: 1px solid var(--vscode-sideBar-border, #444); border-radius: 8px; padding: 18px 20px;
        font: 13px/1.45 var(--vscode-font-family, system-ui, sans-serif); box-shadow: 0 12px 40px rgba(0,0,0,.5); }
      .subsample-dialog h2 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
      .subsample-dialog .muted { color: var(--vscode-descriptionForeground, #999); }
      .subsample-dialog .facts { margin: 0 0 14px; }
      .subsample-dialog fieldset { border: 0; padding: 0; margin: 0 0 12px; display: grid; gap: 8px; }
      .subsample-dialog label.opt { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; cursor: pointer; }
      .subsample-dialog input[type=number] { width: 7.5em; padding: 3px 6px; border-radius: 3px;
        background: var(--vscode-input-background, #2a2a2a); color: var(--vscode-input-foreground, #ddd);
        border: 1px solid var(--vscode-input-border, #555); font: inherit; }
      .subsample-dialog input[type=number]:disabled { opacity: .5; }
      .subsample-dialog .result { padding: 8px 10px; border-radius: 4px; margin: 0 0 14px;
        background: var(--vscode-sideBar-background, rgba(255,255,255,.04)); border: 1px solid var(--vscode-sideBar-border, #444); }
      .subsample-dialog .result.over { border-color: #c9a227; }
      .subsample-dialog .buttons { display: flex; justify-content: flex-end; gap: 8px; }
      .subsample-dialog button { padding: 5px 14px; border-radius: 3px; font: inherit; cursor: pointer;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #fff); }
      .subsample-dialog button.primary { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); }
      .subsample-dialog button:focus-visible, .subsample-dialog input:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px; }
    `;
    document.head.appendChild(style);
  }

  /**
   * Asks how to subsample the files described by `request` (count, bytes,
   * per-file point estimates, memory). Resolves to {fraction} / {maxPoints},
   * or null when cancelled.
   */
  function showSubsampleDialog(request) {
    styleDialog();
    const prefs = loadPrefs();
    const plan = window.plyLoadBudget;
    const files = request.files;
    const count = files.length;
    const totalPoints = files.reduce((sum, f) => sum + f.points, 0);
    const approx = request.exact ? '' : '~';
    const full = plan.planLoad(files, null);
    // Layouts present, e.g. "xyz + rgb ×12 · 3DGS ×2 (kept whole)".
    const layouts = new Map();
    for (const f of files) layouts.set(f.describe, (layouts.get(f.describe) || 0) + 1);
    const whole = files.filter(f => !f.subsamplable).length;
    const layoutText = [...layouts]
      .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
      .join(' · ');
    const backdrop = document.createElement('div');
    backdrop.className = 'subsample-backdrop';
    backdrop.innerHTML = `
      <div class="subsample-dialog" role="dialog" aria-modal="true" aria-labelledby="subsample-title">
        <h2 id="subsample-title">${request.replace ? 'Open' : 'Add'} with subsampling</h2>
        <p class="facts muted">
          ${count} file${count === 1 ? '' : 's'} · ${formatBytes(request.bytes)} on disk ·
          ${approx}${formatPoints(totalPoints)} points<br>
          <span class="layouts"></span><br>
          Loading all of it: at least ${formatBytes(full.peak)}
          (${formatBytes(full.steady)} once loaded)<br>
          This computer: ${formatBytes(request.available)} free of ${formatBytes(request.total)}
        </p>
        <fieldset>
          <label class="opt"><input type="radio" name="ss-mode" value="fit"> Fit everything into
            <input type="number" data-k="fit" min="1" max="95" step="5"> % of RAM</label>
          <label class="opt"><input type="radio" name="ss-mode" value="percent"> Keep
            <input type="number" data-k="percent" min="0.01" max="100" step="any"> % of each file's points</label>
          <label class="opt"><input type="radio" name="ss-mode" value="max"> Keep at most
            <input type="number" data-k="max" min="1" step="100000"> points per file</label>
        </fieldset>
        <p class="result" aria-live="polite"></p>
        <p class="muted" style="margin:0 0 14px">Files load one at a time; each is thinned to a random
          subset of its points right after it is read.${
            whole ? ` Meshes and Gaussian splats (${whole}) are loaded whole.` : ''
          }</p>
        <div class="buttons">
          <button type="button" data-act="cancel">Cancel</button>
          <button type="button" class="primary" data-act="ok">${request.replace ? 'Open' : 'Add'}</button>
        </div>
      </div>`;
    backdrop.querySelector('.layouts').textContent = layoutText;
    const inputs = Object.fromEntries(
      [...backdrop.querySelectorAll('input[type=number]')].map(input => [input.dataset.k, input])
    );
    for (const [key, input] of Object.entries(inputs)) input.value = prefs[key];
    const radios = [...backdrop.querySelectorAll('input[name=ss-mode]')];
    (radios.find(r => r.value === prefs.mode) ?? radios[0]).checked = true;
    const result = backdrop.querySelector('.result');
    const okButton = backdrop.querySelector('[data-act=ok]');

    function current() {
      const mode = radios.find(r => r.checked).value;
      const value = Number(inputs[mode].value);
      let options = null;
      let error = 'Enter a valid amount.';
      if (mode === 'fit' && value > 0 && value <= 95) {
        const fraction = plan.fractionForBudget(files, (request.total * value) / 100);
        if (fraction === null) error = `Even the smallest subset needs more than ${value}% of RAM.`;
        else options = { fraction };
      } else if (mode === 'percent' && value > 0 && value <= 100) {
        options = { fraction: value / 100 };
      } else if (mode === 'max' && value >= 1) {
        options = { maxPoints: Math.floor(value) };
      }
      return { mode, value, options, error, load: options && plan.planLoad(files, options) };
    }

    function update() {
      for (const radio of radios) inputs[radio.value].disabled = !radio.checked;
      const { options, error, load } = current();
      okButton.disabled = !options;
      if (!options) {
        result.textContent = error;
        result.classList.remove('over');
        return;
      }
      const share = totalPoints ? load.kept / totalPoints : 1;
      const percent = share >= 1 ? 'all' : `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`;
      result.textContent =
        `Result: ${approx}${formatPoints(load.kept)} points (${percent}), at least ` +
        `${formatBytes(load.steady)} once loaded, ${formatBytes(load.peak)} at the peak`;
      const over = load.peak > request.available * 0.8;
      result.classList.toggle('over', over);
      if (over) result.textContent += ' — more than is free now';
    }

    return new Promise(resolve => {
      function close(value) {
        backdrop.remove();
        window.removeEventListener('keydown', onKey, true);
        resolve(value);
      }
      function accept() {
        const { mode, value, options } = current();
        if (!options) return;
        savePrefs({ ...prefs, mode, [mode]: value });
        close(options);
      }
      function onKey(event) {
        // Keep the viewer's own shortcuts (solo digits, arrows) away while open.
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          accept();
        }
      }
      backdrop.addEventListener('input', update);
      backdrop.addEventListener('change', update);
      backdrop.addEventListener('click', event => {
        const act = event.target.closest?.('[data-act]')?.dataset.act;
        if (act === 'cancel') close(null);
        else if (act === 'ok') accept();
      });
      window.addEventListener('keydown', onKey, true);
      document.body.appendChild(backdrop);
      update();
      const mode = radios.find(r => r.checked).value;
      inputs[mode].focus();
      inputs[mode].select();
    });
  }
})();
