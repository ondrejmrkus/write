// Write: a plain Markdown drafting page. Every draft is kept in this browser's localStorage under its own key,
// so saving one draft never touches the others (and two open tabs can't wipe each other's drafts).
(function () {
  'use strict';

  var PREFIX = 'write:draft:';
  var LAST = 'write:last';

  var root = document.documentElement;
  var body = document.body;
  var editor = document.getElementById('editor');
  var list = document.getElementById('list');
  var docs = document.getElementById('docs');
  var statusEl = document.getElementById('status');
  var wordsEl = document.getElementById('words');

  var current = null;
  var saveTimer = null;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // --- Storage ---------------------------------------------------------------

  function allDrafts() {
    var drafts = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key.indexOf(PREFIX) !== 0) continue;
        try { drafts.push(JSON.parse(localStorage.getItem(key))); } catch (e) { /* unreadable: leave it untouched */ }
      }
    } catch (e) {
      setStatus('Browser storage is blocked. Nothing will be saved.', true);
    }
    return drafts.sort(function (a, b) { return b.updated - a.updated; });
  }

  function getDraft(id) {
    try { return JSON.parse(localStorage.getItem(PREFIX + id)); } catch (e) { return null; }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!current) return;
    try {
      if (current.text.trim()) {
        localStorage.setItem(PREFIX + current.id, JSON.stringify(current));
        setStatus('Saved', false);
      } else {
        localStorage.removeItem(PREFIX + current.id);
      }
    } catch (e) {
      setStatus('Not saved: browser storage is full or blocked. Export this draft.', true);
    }
  }

  function scheduleSave() {
    setStatus('', false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  // --- Text helpers ----------------------------------------------------------

  var FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

  function titleOf(text) {
    var fm = FRONT_MATTER.exec(text);
    if (fm) {
      var t = /^title:[ \t]*["']?(.*?)["']?[ \t]*$/m.exec(fm[1]);
      if (t && t[1]) return shorten(t[1], 80);
      text = text.slice(fm[0].length);
    }
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^#+\s*/, '').trim();
      if (line) return shorten(line, 80);
    }
    return '';
  }

  // Cuts at the last space before the limit, so a long title never ends mid-word.
  function shorten(text, max) {
    if (text.length <= max) return text;
    var cut = text.slice(0, max + 1);
    var space = cut.lastIndexOf(' ');
    cut = space > max / 2 ? cut.slice(0, space) : text.slice(0, max);
    return cut.replace(/[\s.,;:!?-]+$/, '') + '…';
  }

  function wordCount(text) {
    var matches = text.replace(FRONT_MATTER, '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return matches ? matches.length : 0;
  }

  function formatDate(time) {
    var d = new Date(time);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function plural(n) { return n + (n === 1 ? ' word' : ' words'); }

  function slugify(title) {
    var slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return slug || 'draft';
  }

  // --- Views -----------------------------------------------------------------

  function open(draft) {
    save();
    current = draft;
    try { localStorage.setItem(LAST, draft.id); } catch (e) {}
    body.classList.remove('listing');
    list.hidden = true;
    editor.hidden = false;
    editor.value = draft.text;
    setStatus('', false);
    refresh();
    window.scrollTo(0, 0);
    editor.focus({ preventScroll: true });
    if (!draft.text) editor.setSelectionRange(0, 0);
  }

  function newDraft() {
    if (current && !editor.hidden && !current.text.trim()) { editor.focus(); return; }
    var now = Date.now();
    open({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), text: '', created: now, updated: now });
  }

  function showList() {
    save();
    current = null;
    try { localStorage.removeItem(LAST); } catch (e) {}
    var drafts = allDrafts();
    if (!drafts.length) { newDraft(); return; }

    docs.textContent = '';
    drafts.forEach(function (draft) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'link';
      button.textContent = titleOf(draft.text) || 'Untitled';
      button.addEventListener('click', function () { open(getDraft(draft.id) || draft); });
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = formatDate(draft.updated) + ' · ' + plural(wordCount(draft.text));
      li.append(button, meta);
      docs.append(li);
    });

    body.classList.add('listing');
    body.classList.remove('typing');
    editor.hidden = true;
    list.hidden = false;
    setStatus('', false);
    window.scrollTo(0, 0);
  }

  // Grow the textarea with its content so the page scrolls like an article, not a box inside a box.
  function refresh() {
    var y = window.scrollY;
    editor.style.height = 'auto';
    editor.style.height = editor.scrollHeight + 'px';
    window.scrollTo(0, y);
    wordsEl.textContent = plural(wordCount(editor.value));
  }

  // --- Actions ---------------------------------------------------------------

  function exportDraft() {
    if (!current) return;
    save();
    var blob = new Blob([current.text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = slugify(titleOf(current.text)) + '.md';
    body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function deleteDraft() {
    if (!current) return;
    var title = titleOf(current.text) || 'this draft';
    if (current.text.trim() && !confirm('Delete "' + title + '"? This can\'t be undone.')) return;
    try { localStorage.removeItem(PREFIX + current.id); } catch (e) {}
    current = null;
    showList();
  }

  editor.addEventListener('input', function () {
    current.text = editor.value;
    current.updated = Date.now();
    body.classList.add('typing');
    refresh();
    scheduleSave();
  });

  document.addEventListener('mousemove', function (e) {
    if (e.movementX || e.movementY) body.classList.remove('typing');
  });

  document.getElementById('new').addEventListener('click', newDraft);
  document.getElementById('show-list').addEventListener('click', showList);
  document.getElementById('export').addEventListener('click', exportDraft);
  document.getElementById('delete').addEventListener('click', deleteDraft);

  document.querySelector('.theme-toggle').addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // Cmd/Ctrl+S saves right away instead of opening the browser's "Save page" dialog.
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  // Never lose the last keystrokes when the tab is closed or hidden.
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });

  window.addEventListener('resize', function () { if (!editor.hidden) refresh(); });

  // Ask the browser not to clear this site's storage when disk space runs low.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  // --- Start: reopen the last draft, otherwise the list, otherwise a blank page.
  var lastId = null;
  try { lastId = localStorage.getItem(LAST); } catch (e) {}
  var last = lastId && getDraft(lastId);
  if (last) open(last); else showList();
})();
