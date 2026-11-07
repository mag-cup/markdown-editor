'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const editor = $('editor');
  const preview = $('preview');
  const previewPane = $('previewPane');
  const editorPane = $('editorPane');
  const main = $('main');
  const mirror = $('mirror');
  const backdrop = $('backdrop');
  const findbar = $('findbar');
  const findInput = $('findInput');
  const replaceInput = $('replaceInput');
  const findCase = $('findCase');
  const findInfo = $('findInfo');

  const webview = window.chrome && window.chrome.webview;
  function send(msg, objs) {
    if (!webview) return;
    if (objs) webview.postMessageWithAdditionalObjects(msg, objs);
    else webview.postMessage(msg);
  }

  const INDENT = '    ';

  // ================================================================ 設定
  const settings = { theme: 'light', view: 'split', fontSize: 14, split: 50, sync: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('mdedit.settings') || '{}')); } catch (e) { /* ignore */ }
  function saveSettings() { localStorage.setItem('mdedit.settings', JSON.stringify(settings)); }

  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
    main.className = settings.view;
    editorPane.style.flexBasis = settings.split + '%';
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === settings.view));
    $('btnSync').classList.toggle('active', settings.sync);
    $('stZoom').textContent = settings.fontSize + 'px';
    invalidateMap();
  }

  // ================================================================ 文書状態
  const doc = { path: null, name: '無題', savedText: '', enc: 'UTF-8', eol: 'LF', base: null };
  let lastDirty = false;

  function updateDirty() {
    const d = editor.value !== doc.savedText;
    if (d !== lastDirty) {
      lastDirty = d;
      send({ type: 'dirty', value: d });
      updateStatus();
    }
  }

  function applyDocInfo(m) {
    doc.path = m.path || null;
    doc.name = m.name || '無題';
    doc.savedText = m.text;
    doc.enc = m.enc || 'UTF-8';
    doc.eol = m.eol || 'LF';
    doc.base = m.base || null;
  }

  function loadDoc(m) {
    applyDocInfo(m);
    allowRemote = false; // 外部リソースの許可は文書ごと
    editor.value = m.text;
    editor.setSelectionRange(0, 0);
    editor.scrollTop = 0;
    previewPane.scrollTop = 0;
    lastDirty = false;
    renderNow();
    updateStatus();
    refreshFindHighlights();
    editor.focus();
  }

  window.getEditorText = () => editor.value;

  if (webview) {
    webview.addEventListener('message', (e) => {
      const m = e.data;
      switch (m.type) {
        case 'load':
          loadDoc(m);
          break;
        case 'saved': {
          const baseChanged = doc.base !== (m.base || null);
          applyDocInfo(m);
          lastDirty = false;
          updateDirty();
          updateStatus();
          if (baseChanged) renderNow();
          break;
        }
        case 'insert':
          editor.focus();
          insertText(m.text);
          break;
      }
    });
  }

  // ================================================================ Markdown 描画
  marked.use({ gfm: true, breaks: false });

  const purifyPreview = { FORBID_TAGS: ['style', 'form'], SANITIZE_NAMED_PROPS: true };
  const purifyExport = { FORBID_TAGS: ['style', 'form'] };

  function slugify(text, used) {
    let s = text.trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const base = s;
    for (let n = 1; used.has(s); n++) s = base + '-' + n;
    used.add(s);
    return s;
  }

  function addHeadingIds(root, prefix) {
    const used = new Set();
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
      if (!h.id) h.id = prefix + slugify(h.textContent, used);
    });
  }

  function renderFragment(md, forPreview) {
    const tpl = document.createElement('template');
    tpl.innerHTML = DOMPurify.sanitize(marked.parse(md), forPreview ? purifyPreview : purifyExport);
    addHeadingIds(tpl.content, forPreview ? 'md-' : '');
    return tpl;
  }

  function isRelativeUrl(u) {
    return !!u && !/^[a-z][a-z0-9+.\-]*:/i.test(u) && !u.startsWith('//') && !u.startsWith('#');
  }

  // 相対パスの画像を https://doc.local/... に解決
  function fixResourceUrls(root) {
    if (!doc.base) return;
    root.querySelectorAll('img[src], video[src], audio[src], source[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (!isRelativeUrl(src)) return;
      try { el.setAttribute('src', new URL(src, doc.base).href); } catch (e) { /* ignore */ }
    });
  }

  // ---------------------------------------------------------------- 外部リソースのブロック
  // 開いただけで外部サーバーへ通信が飛ぶ（閲覧の追跡・IP の漏えい）のを防ぐ。
  // 文書ごとに「表示する」を押すまで、app.local / doc.local / data: / blob: 以外の読み込みを止める。
  let allowRemote = false;
  const RESOURCE_ATTRS = ['src', 'srcset', 'poster', 'href', 'xlink:href', 'data', 'background', 'lowsrc', 'dynsrc'];
  const LOCAL_HOSTS = new Set(['app.local', 'doc.local']);

  function isLocalUrl(u) {
    try {
      const url = new URL(u.trim(), doc.base || location.href);
      if (url.protocol === 'data:' || url.protocol === 'blob:') return true;
      return url.protocol === 'https:' && LOCAL_HOSTS.has(url.hostname);
    } catch (e) {
      return false;
    }
  }

  function srcsetUrls(v) {
    return v.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
  }

  // 外部 URL を参照する属性を取り除き、取り除いた件数を返す
  function blockRemoteResources(root) {
    let count = 0;
    root.querySelectorAll('*').forEach((el) => {
      const isLink = el.localName === 'a' || el.localName === 'area';
      for (const name of RESOURCE_ATTRS) {
        if (name === 'href' && isLink) continue;
        if (name === 'xlink:href' && isLink) continue;
        const v = el.getAttribute(name);
        if (v == null) continue;
        const urls = name === 'srcset' ? srcsetUrls(v) : [v];
        if (urls.some((u) => !isLocalUrl(u))) {
          el.removeAttribute(name);
          count++;
        }
      }
      // style 属性の url() / image-set() 等。cssText はエスケープを正規化した形になる
      if (el.hasAttribute('style')) {
        const css = (el.style && el.style.cssText) || '';
        const urls = Array.from(css.matchAll(/url\("((?:[^"\\]|\\.)*)"\)/gi), (m) => m[1]);
        const risky = /image-set\(|image\(|cross-fade\(|element\(/i.test(css) ||
          (css.match(/url\(/gi) || []).length !== urls.length || // 想定外の書式は安全側に倒す
          urls.some((u) => !isLocalUrl(u));
        if (risky) {
          el.removeAttribute('style');
          count++;
        }
      }
    });
    return count;
  }

  const remoteBar = $('remoteBar');
  $('btnRemote').addEventListener('click', () => {
    allowRemote = true;
    renderNow();
  });

  // プレビュー用の DOM を作る（サニタイズ・相対パス解決・外部リソースのブロック）
  function buildPreview() {
    const tpl = renderFragment(editor.value, true);
    fixResourceUrls(tpl.content);
    const blocked = allowRemote ? 0 : blockRemoteResources(tpl.content);
    remoteBar.hidden = blocked === 0;
    $('remoteInfo').textContent = `外部の画像などの読み込みを ${blocked} 件ブロックしました。`;
    return tpl.content;
  }

  let renderTimer = 0;
  let previewStale = true;

  function scheduleRender() {
    clearTimeout(renderTimer);
    const delay = editor.value.length > 200000 ? 400 : 120;
    renderTimer = setTimeout(renderNow, delay);
  }

  function renderNow() {
    clearTimeout(renderTimer);
    if (settings.view === 'editor-only') { previewStale = true; return; }
    preview.replaceChildren(buildPreview());
    previewStale = false;
    invalidateMap();
    if (settings.view === 'split' && settings.sync) syncFrom('editor');
  }

  function ensurePreview() { if (previewStale) { previewStale = false; renderNow(); } }

  // プレビュー内リンクのクリック
  preview.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById('md-' + id) || document.getElementById('user-content-' + id);
      if (target) target.scrollIntoView({ block: 'start' });
      return;
    }
    send({ type: 'openLink', href });
  });

  // 画像読み込みでレイアウトが変わるのでスクロール対応表を作り直す
  preview.addEventListener('load', () => invalidateMap(), true);

  // ================================================================ テキスト位置の計測（ミラー要素）
  function syncMirrorWidth() {
    const w = editor.clientWidth + 'px';
    mirror.style.width = w;
    backdrop.style.width = w;
  }

  // 文字オフセット（昇順）ごとの、エディタ内容先頭からの Y 座標を返す
  function charTops(offsets) {
    syncMirrorWidth();
    const text = editor.value;
    const frag = document.createDocumentFragment();
    const markers = [];
    let pos = 0;
    for (const off of offsets) {
      frag.append(text.slice(pos, off));
      const sp = document.createElement('span');
      frag.append(sp);
      markers.push(sp);
      pos = off;
    }
    frag.append(text.slice(pos));
    mirror.replaceChildren(frag);
    const base = mirror.getBoundingClientRect().top;
    const tops = markers.map((m) => m.getBoundingClientRect().top - base);
    mirror.replaceChildren();
    return tops;
  }

  function lineOffsets(lines) {
    const text = editor.value;
    const result = [];
    let line = 0;
    let idx = 0;
    for (const ln of lines) {
      while (line < ln) {
        const nl = text.indexOf('\n', idx);
        if (nl < 0) { idx = text.length; break; }
        idx = nl + 1;
        line++;
      }
      result.push(idx);
    }
    return result;
  }

  // ================================================================ スクロール同期
  const BLOCK_TYPES = new Set(['paragraph', 'heading', 'code', 'table', 'hr', 'blockquote', 'list']);
  let map = null;
  function invalidateMap() { map = null; }

  function buildMap() {
    const tokens = marked.lexer(editor.value);
    const lines = [];
    const types = [];
    let line = 0;
    let hasHtml = false;
    for (const t of tokens) {
      if (t.type === 'html') hasHtml = true;
      if (BLOCK_TYPES.has(t.type)) { lines.push(line); types.push(t.type); }
      line += (t.raw.match(/\n/g) || []).length;
    }

    const els = Array.from(preview.children);
    let pairs = [];
    if (!hasHtml && els.length === lines.length) {
      pairs = lines.map((l, i) => [l, els[i]]);
    } else {
      // 対応が取れない場合は見出しだけを基準点にする
      const hs = els.filter((el) => /^H[1-6]$/.test(el.tagName));
      const hl = lines.filter((l, i) => types[i] === 'heading');
      if (hs.length === hl.length) pairs = hl.map((l, i) => [l, hs[i]]);
    }

    const eTops = charTops(lineOffsets(pairs.map((p) => p[0])));
    const padTop = parseFloat(getComputedStyle(editor).paddingTop) || 0;
    const pRect = previewPane.getBoundingClientRect();
    const pBase = pRect.top - previewPane.scrollTop;
    const eMax = Math.max(1, editor.scrollHeight - editor.clientHeight);
    const pMax = Math.max(1, previewPane.scrollHeight - previewPane.clientHeight);

    const e = [0];
    const p = [0];
    pairs.forEach((pr, i) => {
      const et = eTops[i] - padTop;
      const pt = pr[1].getBoundingClientRect().top - pBase - 16;
      if (et > e[e.length - 1] && pt > p[p.length - 1] && et < eMax && pt < pMax) {
        e.push(et);
        p.push(pt);
      }
    });
    e.push(eMax);
    p.push(pMax);
    map = { e, p };
  }

  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    let lo = 0;
    let hi = xs.length - 1;
    if (x >= xs[hi]) return ys[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }

  let scrollOwner = null;
  let scrollTimer = 0;
  function claimScroll(side) {
    scrollOwner = side;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { scrollOwner = null; }, 120);
  }

  function syncFrom(side) {
    if (!settings.sync || settings.view !== 'split') return;
    if (!map) buildMap();
    claimScroll(side);
    if (side === 'editor') previewPane.scrollTop = interp(map.e, map.p, editor.scrollTop);
    else editor.scrollTop = interp(map.p, map.e, previewPane.scrollTop);
  }

  editor.addEventListener('scroll', () => {
    backdrop.scrollTop = editor.scrollTop;
    if (scrollOwner !== 'preview') syncFrom('editor');
  });
  previewPane.addEventListener('scroll', () => {
    if (scrollOwner !== 'editor') syncFrom('preview');
  });
  window.addEventListener('resize', () => { invalidateMap(); syncMirrorWidth(); refreshFindHighlights(); });

  // ================================================================ ステータスバー
  let statusTimer = 0;
  function updateStatus() {
    cancelAnimationFrame(statusTimer);
    statusTimer = requestAnimationFrame(() => {
      const v = editor.value;
      const pos = editor.selectionStart;
      const before = v.slice(0, pos);
      const line = (before.match(/\n/g) || []).length + 1;
      const col = pos - before.lastIndexOf('\n');
      $('stName').textContent = (lastDirty ? '● ' : '') + (doc.path || doc.name);
      $('stPos').textContent = `行 ${line}, 列 ${col}`;
      const sel = editor.selectionEnd - editor.selectionStart;
      $('stCount').textContent = (sel ? `${sel} 文字選択 / ` : '') + `${v.replace(/\n/g, '').length} 文字`;
      $('stEnc').textContent = `${doc.enc}  ${doc.eol}`;
    });
  }

  // ================================================================ 編集操作
  function insertText(text) {
    if (document.activeElement !== editor) editor.focus();
    const ok = text === ''
      ? document.execCommand('delete', false)
      : document.execCommand('insertText', false, text);
    if (!ok) {
      editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
      onEdit();
    }
  }

  function replaceRange(start, end, text) {
    editor.focus();
    editor.setSelectionRange(start, end);
    insertText(text);
  }

  function wrapSelection(before, after, placeholder) {
    const v = editor.value;
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const sel = v.slice(s, e);
    // 既に囲まれていれば解除
    if (s !== e && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
      replaceRange(s - before.length, e + after.length, sel);
      editor.setSelectionRange(s - before.length, e - before.length);
      return;
    }
    if (sel.length > before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
      const inner = sel.slice(before.length, sel.length - after.length);
      replaceRange(s, e, inner);
      editor.setSelectionRange(s, s + inner.length);
      return;
    }
    const body = sel || placeholder;
    replaceRange(s, e, before + body + after);
    editor.setSelectionRange(s + before.length, s + before.length + body.length);
  }

  function currentLineRange() {
    const v = editor.value;
    const s = editor.selectionStart;
    let e = editor.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    if (e > s && v[e - 1] === '\n') e--;
    let le = v.indexOf('\n', e);
    if (le < 0) le = v.length;
    return [ls, le];
  }

  // 選択行（またはカーソル行）を変換する
  function transformLines(fn) {
    const collapsed = editor.selectionStart === editor.selectionEnd;
    const caret = editor.selectionStart;
    const [ls, le] = currentLineRange();
    const oldText = editor.value.slice(ls, le);
    const newText = fn(oldText.split('\n')).join('\n');
    if (newText === oldText) return;
    replaceRange(ls, le, newText);
    if (collapsed && !oldText.includes('\n')) {
      const p = Math.max(ls, Math.min(ls + newText.length, caret + newText.length - oldText.length));
      editor.setSelectionRange(p, p);
    } else {
      editor.setSelectionRange(ls, ls + newText.length);
    }
  }

  const LIST_RE = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

  function toggleLinePrefix(re, make, stripRe) {
    transformLines((lines) => {
      const parts = lines.map((l) => { const m = l.match(/^(\s*)(.*)$/); return [m[1], m[2]]; });
      const targets = parts.filter(([, body]) => body.trim() !== '' || lines.length === 1);
      const all = targets.length > 0 && targets.every(([, body]) => re.test(body));
      let n = 0;
      return parts.map(([ind, body]) => {
        if (body.trim() === '' && lines.length > 1) return ind + body;
        if (all) return ind + body.replace(re, '');
        return ind + make(n++) + (stripRe ? body.replace(stripRe, '') : body);
      });
    });
  }

  function cycleHeading() {
    transformLines((lines) => lines.map((l) => {
      const m = l.match(/^(#{1,6})\s+/);
      if (!m) return '# ' + l;
      if (m[1].length >= 6) return l.slice(m[0].length);
      return '#' + l;
    }));
  }

  function indentLines(outdent) {
    transformLines((lines) => lines.map((l) => {
      if (!outdent) return l.trim() === '' && lines.length > 1 ? l : INDENT + l;
      if (l.startsWith('\t')) return l.slice(1);
      const m = l.match(/^ {1,4}/);
      return m ? l.slice(m[0].length) : l;
    }));
  }

  // 段落の前後に空行を確保してブロック（表・区切り線など）を挿入
  function insertBlock(text, selectStart, selectEnd) {
    const v = editor.value;
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', e);
    if (le < 0) le = v.length;
    const lineBlank = v.slice(ls, le).trim() === '';
    const at = lineBlank ? ls : le;
    const to = lineBlank ? le : le;
    let pre = lineBlank ? '' : '\n';
    const joined = v.slice(0, at) + pre;
    if (joined.length > 0 && !joined.endsWith('\n\n')) pre += '\n';
    replaceRange(at, to, pre + text);
    if (selectStart != null) editor.setSelectionRange(at + pre.length + selectStart, at + pre.length + selectEnd);
  }

  function insertCode() {
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const sel = editor.value.slice(s, e);
    if (sel.includes('\n') || (s === e && /^\s*$/.test(editor.value.slice(...currentLineRange())))) {
      const body = sel || '';
      replaceRange(s, e, '```\n' + body + (body.endsWith('\n') || !body ? '' : '\n') + '```\n');
      editor.setSelectionRange(s + 3, s + 3); // 言語名の位置
    } else {
      wrapSelection('`', '`', 'code');
    }
  }

  function insertLink(image) {
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const sel = editor.value.slice(s, e);
    const bang = image ? '!' : '';
    if (/^(https?:\/\/|www\.)\S+$/.test(sel)) {
      const label = image ? '画像' : 'リンク';
      replaceRange(s, e, `${bang}[${label}](${sel})`);
      editor.setSelectionRange(s + bang.length + 1, s + bang.length + 1 + label.length);
    } else {
      const label = sel || (image ? '代替テキスト' : 'リンクテキスト');
      const url = image ? 'image.png' : 'https://';
      replaceRange(s, e, `${bang}[${label}](${url})`);
      const us = s + bang.length + label.length + 3;
      editor.setSelectionRange(us, us + url.length);
    }
  }

  const TABLE_TEMPLATE = '| 見出し1 | 見出し2 | 見出し3 |\n| --- | --- | --- |\n| セル | セル | セル |\n| セル | セル | セル |\n';

  // Enter でリスト・引用を継続
  function handleEnter() {
    if (editor.selectionStart !== editor.selectionEnd) return false;
    const v = editor.value;
    const pos = editor.selectionStart;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    const line = v.slice(ls, pos);

    const m = line.match(/^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/);
    if (m) {
      if (line.length === m[0].length && v.slice(pos, v.indexOf('\n', pos) < 0 ? v.length : v.indexOf('\n', pos)).trim() === '') {
        // 空の項目で Enter → リスト終了
        replaceRange(ls, pos, m[1]);
        return true;
      }
      const marker = m[2] ? m[2] : (parseInt(m[3], 10) + 1) + m[4];
      insertText('\n' + m[1] + marker + m[5] + (m[6] ? '[ ] ' : ''));
      return true;
    }
    const q = line.match(/^(\s*(?:>\s?)+)/);
    if (q) {
      if (line.trim().replace(/>/g, '').trim() === '') {
        replaceRange(ls, pos, '');
        return true;
      }
      insertText('\n' + q[1]);
      return true;
    }
    const ind = line.match(/^[ \t]+/);
    if (ind) {
      insertText('\n' + ind[0]);
      return true;
    }
    return false;
  }

  function handleTab(shift) {
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const v = editor.value;
    const multi = v.slice(s, e).includes('\n');
    const [ls, le] = currentLineRange();
    const isList = LIST_RE.test(v.slice(ls, le).trimStart());
    if (shift || multi || isList) indentLines(shift);
    else insertText(INDENT);
  }

  // ================================================================ 検索・置換
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function findRegex() {
    const q = findInput.value;
    return q ? new RegExp(escapeRe(q), findCase.checked ? 'g' : 'gi') : null;
  }

  function openFind(focusReplace) {
    findbar.hidden = false;
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (sel && !sel.includes('\n') && sel.length < 200) findInput.value = sel;
    const target = focusReplace && findInput.value ? replaceInput : findInput;
    target.focus();
    target.select();
    refreshFindHighlights();
  }

  function closeFind() {
    findbar.hidden = true;
    backdrop.replaceChildren();
    editor.focus();
  }

  function selectAndReveal(s, e) {
    editor.setSelectionRange(s, e);
    const top = charTops([s])[0];
    const h = editor.clientHeight;
    if (top < editor.scrollTop + 20 || top > editor.scrollTop + h - 60) {
      editor.scrollTop = Math.max(0, top - h / 3);
    }
  }

  function findNext(dir) {
    const re = findRegex();
    if (!re) return false;
    const v = editor.value;
    const matches = [];
    let m;
    while ((m = re.exec(v)) !== null) {
      matches.push(m.index);
      if (m[0].length === 0) re.lastIndex++;
    }
    if (!matches.length) {
      findInfo.textContent = '見つかりません';
      findInfo.classList.add('notfound');
      return false;
    }
    const len = findInput.value.length;
    let idx;
    if (dir > 0) {
      idx = matches.findIndex((p) => p >= editor.selectionEnd);
      if (idx < 0) idx = 0;
    } else {
      idx = -1;
      for (let i = matches.length - 1; i >= 0; i--) if (matches[i] < editor.selectionStart) { idx = i; break; }
      if (idx < 0) idx = matches.length - 1;
    }
    selectAndReveal(matches[idx], matches[idx] + len);
    refreshFindHighlights();
    return true;
  }

  function selectionMatches() {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    const q = findInput.value;
    if (!sel || !q) return false;
    return findCase.checked ? sel === q : sel.toLowerCase() === q.toLowerCase();
  }

  function replaceOne() {
    if (!findInput.value) return;
    if (selectionMatches()) {
      const back = document.activeElement;
      replaceRange(editor.selectionStart, editor.selectionEnd, replaceInput.value);
      if (back && back !== editor) back.focus();
    }
    findNext(1);
  }

  function replaceAll() {
    const re = findRegex();
    if (!re) return;
    let count = 0;
    const rep = replaceInput.value;
    const nv = editor.value.replace(re, () => { count++; return rep; });
    if (count) {
      const back = document.activeElement;
      const top = editor.scrollTop;
      replaceRange(0, editor.value.length, nv);
      editor.setSelectionRange(0, 0);
      editor.scrollTop = top;
      if (back && back !== editor) back.focus();
    }
    refreshFindHighlights();
    findInfo.textContent = `${count} 件置換しました`;
    findInfo.classList.remove('notfound');
  }

  let findTimer = 0;
  function refreshFindHighlights() {
    if (findbar.hidden) return;
    cancelAnimationFrame(findTimer);
    findTimer = requestAnimationFrame(() => {
      const re = findRegex();
      const v = editor.value;
      syncMirrorWidth();
      if (!re) {
        backdrop.replaceChildren();
        findInfo.textContent = '';
        findInfo.classList.remove('notfound');
        return;
      }
      const frag = document.createDocumentFragment();
      let pos = 0;
      let count = 0;
      let current = 0;
      let m;
      const MAX = 5000;
      while ((m = re.exec(v)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        count++;
        if (count <= MAX) {
          frag.append(v.slice(pos, m.index));
          const mark = document.createElement('mark');
          mark.textContent = m[0];
          if (m.index === editor.selectionStart && m.index + m[0].length === editor.selectionEnd) {
            mark.className = 'current';
            current = count;
          }
          frag.append(mark);
          pos = m.index + m[0].length;
        }
      }
      frag.append(v.slice(pos) + '\n');
      backdrop.replaceChildren(frag);
      backdrop.scrollTop = editor.scrollTop;
      findInfo.classList.toggle('notfound', count === 0);
      findInfo.textContent = count === 0 ? '見つかりません' : (current ? `${current} / ${count} 件` : `${count} 件`);
    });
  }

  findInput.addEventListener('input', refreshFindHighlights);
  findCase.addEventListener('change', refreshFindHighlights);
  findInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey) replaceAll(); else replaceOne(); }
  });

  // ================================================================ 出力
  async function exportHtml() {
    const css = await (await fetch('preview.css')).text();
    const tpl = renderFragment(editor.value, false);
    const h = tpl.content.querySelector('h1, h2, h3');
    const title = (h ? h.textContent : doc.name.replace(/\.[^.]+$/, '')) || 'Document';
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body { margin: 0; background: #fff; }
.markdown-body { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 45px; }
@media (max-width: 767px) { .markdown-body { padding: 15px; } }
${css}
</style>
</head>
<body>
<article class="markdown-body">
${tpl.innerHTML}
</article>
</body>
</html>
`;
    send({ type: 'exportHtml', html });
  }

  function printLike(type) {
    ensurePreview();
    renderNow();
    if (settings.view === 'editor-only') {
      // プレビュー非表示でも印刷できるよう一時的に描画
      preview.replaceChildren(buildPreview());
      previewStale = true;
    }
    // 画像の読み込みを少し待ってから
    setTimeout(() => send({ type }), 150);
  }

  // ================================================================ コマンド
  function setView(v) {
    settings.view = v;
    saveSettings();
    applySettings();
    if (v !== 'editor-only') ensurePreview();
    if (v === 'preview-only') previewPane.focus();
    else editor.focus();
    syncMirrorWidth();
    refreshFindHighlights();
  }

  function setFontSize(px) {
    settings.fontSize = Math.max(9, Math.min(36, px));
    saveSettings();
    applySettings();
    refreshFindHighlights();
  }

  const commands = {
    new: () => send({ type: 'new', text: editor.value }),
    open: () => send({ type: 'open', text: editor.value }),
    save: () => send({ type: 'save', text: editor.value }),
    saveAs: () => send({ type: 'saveAs', text: editor.value }),
    heading: cycleHeading,
    bold: () => wrapSelection('**', '**', '太字'),
    italic: () => wrapSelection('*', '*', '斜体'),
    strike: () => wrapSelection('~~', '~~', '取り消し線'),
    code: insertCode,
    bullet: () => toggleLinePrefix(/^[-*+]\s+(?!\[[ xX]\])/, () => '- ', LIST_RE),
    ordered: () => toggleLinePrefix(/^\d+[.)]\s+/, (i) => `${i + 1}. `, LIST_RE),
    task: () => toggleLinePrefix(/^[-*+]\s+\[[ xX]\]\s+/, () => '- [ ] ', LIST_RE),
    quote: () => toggleLinePrefix(/^>\s?/, () => '> ', null),
    link: () => insertLink(false),
    image: () => insertLink(true),
    table: () => insertBlock(TABLE_TEMPLATE, 2, 6),
    hr: () => insertBlock('---\n'),
    'view-editor': () => setView('editor-only'),
    'view-split': () => setView('split'),
    'view-preview': () => setView('preview-only'),
    toggleSync: () => { settings.sync = !settings.sync; saveSettings(); applySettings(); syncFrom('editor'); },
    toggleTheme: () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applySettings(); },
    find: () => openFind(false),
    replace: () => openFind(true),
    findNext: () => findNext(1),
    findPrev: () => findNext(-1),
    replaceOne,
    replaceAll,
    closeFind,
    exportHtml,
    exportPdf: () => printLike('exportPdf'),
    print: () => printLike('print'),
    zoomIn: () => setFontSize(settings.fontSize + 1),
    zoomOut: () => setFontSize(settings.fontSize - 1),
    zoomReset: () => setFontSize(14),
  };

  const EDIT_COMMANDS = new Set(['heading', 'bold', 'italic', 'strike', 'code', 'bullet', 'ordered', 'task',
    'quote', 'link', 'image', 'table', 'hr']);

  function run(cmd) {
    const fn = commands[cmd];
    if (!fn) return;
    if (EDIT_COMMANDS.has(cmd)) {
      if (settings.view === 'preview-only') setView('split');
      if (document.activeElement !== editor) editor.focus();
    }
    fn();
  }

  document.querySelectorAll('[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // エディタのフォーカス・選択を維持
    b.addEventListener('click', () => run(b.dataset.cmd));
  });

  // ================================================================ キーボード
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let cmd = null;

    if (ctrl && !e.altKey) {
      if (k === 'n') cmd = 'new';
      else if (k === 'o') cmd = 'open';
      else if (k === 's') cmd = e.shiftKey ? 'saveAs' : 'save';
      else if (k === 'p') cmd = 'print';
      else if (k === 'f') cmd = 'find';
      else if (k === 'h') cmd = 'replace';
      else if (k === '1') cmd = 'view-editor';
      else if (k === '2') cmd = 'view-split';
      else if (k === '3') cmd = 'view-preview';
      else if (k === '=' || k === '+' || k === ';') cmd = 'zoomIn';
      else if (k === '-') cmd = 'zoomOut';
      else if (k === '0') cmd = 'zoomReset';
      else if (e.target === editor) {
        if (k === 'b' && !e.shiftKey) cmd = 'bold';
        else if (k === 'i' && !e.shiftKey) cmd = 'italic';
        else if (k === 'x' && e.shiftKey) cmd = 'strike';
        else if (k === 'k') cmd = 'link';
        else if (k === '`' || e.code === 'Backquote') cmd = 'code';
      }
    } else if (e.key === 'F3') {
      cmd = e.shiftKey ? 'findPrev' : 'findNext';
      if (findbar.hidden) cmd = 'find';
    } else if (e.key === 'Escape' && !findbar.hidden) {
      cmd = 'closeFind';
    } else if (e.target === editor && !e.altKey && !ctrl) {
      if (e.key === 'Tab') { e.preventDefault(); handleTab(e.shiftKey); return; }
      if (e.key === 'Enter' && !e.shiftKey) { if (handleEnter()) e.preventDefault(); return; }
    }

    if (cmd) {
      e.preventDefault();
      run(cmd);
    }
  }, true);

  // Ctrl + ホイールで文字サイズ変更
  document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setFontSize(settings.fontSize + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  // ================================================================ 入力イベント
  function onEdit() {
    updateDirty();
    scheduleRender();
    updateStatus();
    refreshFindHighlights();
  }
  editor.addEventListener('input', onEdit);
  ['keyup', 'mouseup', 'select', 'focus'].forEach((t) => editor.addEventListener(t, updateStatus));
  document.addEventListener('selectionchange', updateStatus);

  // ================================================================ スプリッタ
  const splitter = $('splitter');
  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('dragging');
    const rect = main.getBoundingClientRect();
    const move = (ev) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      settings.split = Math.round(Math.max(15, Math.min(85, pct)) * 10) / 10;
      editorPane.style.flexBasis = settings.split + '%';
    };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      splitter.classList.remove('dragging');
      saveSettings();
      invalidateMap();
      syncMirrorWidth();
      refreshFindHighlights();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });
  splitter.addEventListener('dblclick', () => {
    settings.split = 50;
    saveSettings();
    applySettings();
  });

  // ================================================================ ドラッグ＆ドロップ
  let dragDepth = 0;
  let overlay = null;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  function showOverlay(on) {
    if (on && !overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dropOverlay';
      document.body.append(overlay);
    } else if (!on && overlay) {
      overlay.remove();
      overlay = null;
    }
  }
  document.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; showOverlay(true); } });
  document.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; showOverlay(false); } });
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', (e) => {
    dragDepth = 0;
    showOverlay(false);
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    send({ type: 'drop' }, e.dataTransfer.files);
  });

  // ================================================================ 起動
  applySettings();
  syncMirrorWidth();
  renderNow();
  updateStatus();
  editor.focus();
  send({ type: 'ready' });
})();
