# Changelog

Changes to the desktop app. Each version's section becomes the notes of its
GitHub release (`desktop-v<version>`), so keep the `## <version>` headings.

## Unreleased

- **Reopen the last session:** File → Open Recent lists the last few closed
  windows as "Last session: 8 files in 3 groups · scans · 16 Nov 14:32".
  Reopening one loads its files in their list order, each with the share of
  points it had if it was subsampled, with its grouping pattern and the group
  that was showing. Files that no longer exist are skipped (and listed). A
  window's session is kept while it is open too, so it survives a crash.
  Each file's settings come back too: point size, colour mode, render modes
  (points, splats, mesh, wireframe, normals), transform, visibility,
  collapsed state, solo and locks. The camera is not restored.

- **Full paths:** the app records where each opened file is on disk (also for
  drops and the Add Point Cloud button). Hover a name to see it, or turn on
  **Show full paths** with the `/x/y/…` button next to Expand all, in a card's
  right-click menu or under View → Files Panel. A path that does not fit is cut
  at its start, so the file name stays visible. The solo panel shows them too
  and has the same button (one shared setting; each panel keeps its own
  `a…z`). Grouping matches full paths while they are shown.
- **Aliases:** give a file a better label without changing its name.
  Double-click its name (or F2, or Set alias… in the card menu), type, Enter.
  The alias is shown in light blue in the file list and the solo panel;
  grouping and matching keep using the real name. The ⇄ button next to an
  aliased name flips that row to the original, and hovering shows it. Once a
  file has an alias, a ⇄ button next to `a…z` flips all of them (also **Show
  original names** in the card menu and View → Files Panel); it is on when
  every aliased file shows its original name.
  Aliases are remembered by file path (the 5000 most recent).
- **Rename in viewer…** (card menu, Shift+double-click, Shift+F2) changes the
  name the viewer uses, for display and grouping, in this window. The file on
  disk is not renamed, and reopening it brings its name back.
- A click on a file's name selects it a moment later, once it is clear the
  click is not the start of a double-click; a double-click on a name never
  selects the file.
- **Abbreviate identical parts** now works in the file list too: the `a…z`
  button next to Expand all, the card menu or View → Files Panel. It shortens a
  name only when it does not fit.
- The card menu's options and Render mode submenu show checkboxes on the
  right.
- **Locked solo:** the lock next to a file's `S` keeps its solo state while
  other files are soloed and stepped through: locked while soloed, it stays in
  every solo (a reference to compare against); locked while not soloed, it
  stays out, also when the others are unsoloed or solo is ended (unlock it to
  end solo). Its `S` and solo panel row are greyed out until unlocked, and
  stepping skips it.
- **Reordering by drag:** drag a card by its header (name, colour, empty space)
  in the file list, or drag an item in the solo panel. Both share one order,
  which number keys and stepping follow. Holding a card still works too.
- Add Point Cloud, and the File menu's dialogs, open in the folder of the file
  added last.
- While files are selected, the All Sizes slider becomes **Selection size** and
  sets only the selected clouds.
- A file's own visibility checkbox now also applies while it is soloed: a
  soloed file that is unchecked stays hidden.
- Fixed: the Translation / Rotation / camera vector dialogs (Transform) could
  not be closed with Esc, ✕ or a click outside, and had no title.
- The solo panel's `a…z` starts as the file list's the first time the panel
  appears; after that each panel keeps its own.
- The card menu and the grouping pattern menu behave alike: arrow keys move
  between items, Esc closes, and both close when you click elsewhere or scroll
  outside them (the pattern menu used to stay open while the panel scrolled).
- Collapsible sections all use the same arrows and report open/closed to
  screen readers.
- Point size sliders reach further: up to ten times a cloud's recommended size
  (at least 0.25), instead of four times (at least 0.1).

## 0.1.6

- The right-click menu of a file card has a **Render mode** submenu. It lists
  the modes the files support (Points, Splats, Mesh, Wireframe, Normals) and
  applies the chosen one to every file the menu is for: for example Select
  all, right-click a card, Render mode → Splats switches every splat file at
  once. A check shows a mode that is on for all of them, a dash one that is on
  for some.

## 0.1.5

- Opening a folder follows symbolic links to files and subfolders, which were
  skipped before, and lists them under the link's own name.
- The All Sizes slider has a fixed range, the same as the per-file sliders.
  Its range used to grow with the size while dragging, so one drag could make
  points larger than the screen and stall rendering.

## 0.1.4

- **Subsampled loading:** File → Advanced Open opens files or folders with
  subsampling. Keep a percentage, keep at most N points, or fit everything
  into a share of the computer's memory. Subsampled files load one at a time.
- **Memory warning:** a normal open estimates the memory the files will need
  from their headers (per attribute and format, including 3DGS splats) and
  offers to subsample when it will not fit into free memory.
- **File selection and actions:** click a card to select it, Ctrl-click to
  toggle, Shift-click for a range. Right-click any card for its actions.
  Select all and Clear selection sit next to Collapse/Expand all.
  Actions: Subsample, Show, Hide, Remove.
- Subsampling loaded files runs in the background with a progress bar on the
  affected cards, without freezing the window.
- The subsample form and the grouping help open as dialogs.
- Selecting files no longer re-renders the scene, which made Select all slow
  with many large files.
- Fixed: after resizing the panel by its left edge, or dragging the solo panel
  by its header, the window could stop responding to clicks.
- macOS: the app quits when its last window closes.

## 0.1.3

- macOS: the app is ad-hoc signed, so macOS no longer reports it as
  "damaged". The first launch still needs *Open Anyway* in Privacy & Security.

## 0.1.2

- Fixed: File → Open Files / Open Folder added to the scene instead of
  replacing it.
- Linux: search keywords and all icon sizes in the desktop entry, and a
  New Window action.

## 0.1.1

- Linux `.deb` and `.rpm` packages, which install a `plyviz` command.

## 0.1.0

First desktop release: a standalone app for Linux, Windows and macOS around
the viewer from [kleinicke/ply-visualizer](https://github.com/kleinicke/ply-visualizer).

- DAW-style solo per file, and a solo panel listing the groups.
- Regex groups (replacing prefix grouping), with recent patterns.
- Opening whole folders, grouped by subfolder if wanted.
- Camera remembered separately for each group.
