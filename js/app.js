/* ============================================================
 * 墨庐 · 小说创作工作台 — 交互逻辑
 * 书库主页：管理全部作品（可新建 / 删除 / 进入编辑）
 * 工作台：左侧边栏管理项目与文档（条目可新建 / 删除）
 *         右侧编辑区为各模块的可编辑内容页
 * ============================================================ */

'use strict';

const $  = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

/* ---------- 工具 ---------- */
const fmt = n => n.toLocaleString('zh-CN');
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
const cnNum = n => (n >= 1 && n <= CN.length ? CN[n - 1] : String(n));

/* 本地存储安全包装（部分环境如 file:// 下不可用） */
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
};

/* ================= 书库持久化 ================= */

const persist = { timer: null, saving: false, again: false, warned: false, savedAt: '', touched: false, booting: true };

function setSaveState(kind) {
  const map = {
    saving: ['保存中…', '正在自动保存'],
    saved:  ['已保存 · 刚刚', '自动保存 · 刚刚'],
    fail:   ['保存失败 · 请导出备份', '自动保存失败 · 请导出备份'],
    none:   ['未启用本地存储', '本地存储不可用 · 请导出备份'],
  };
  const m = map[kind] || map.saved;
  const el = $('#saveState');
  const auto = $('#autoSaveText');
  if (el) el.innerHTML = '<span class="dot"></span>' + m[0];
  if (auto) auto.textContent = m[1];
}

/* 防抖写盘：连续键入只在停顿后落一次 */
function markDirty(delay) {
  if (persist.booting) return;   /* 启动渲染阶段不回写，避免覆盖待接管的主存副本 */
  persist.touched = true;
  setSaveState('saving');
  clearTimeout(persist.timer);
  persist.timer = setTimeout(saveLibrary, delay === undefined ? 700 : delay);
}

function saveLibrary() {
  clearTimeout(persist.timer);
  if (!ML_STORE.usable) {
    setSaveState('none');
    if (!persist.warned) {
      persist.warned = true;
      toast('当前环境无法本地存储，请用「导出备份」保存进度');
    }
    return Promise.resolve(null);
  }
  /* 上一次仍在写盘：合并为一次后续写入，避免并发事务 */
  if (persist.saving) { persist.again = true; return Promise.resolve(null); }
  persist.saving = true;
  return ML_STORE.save(BOOKS).then(res => {
    persist.saving = false;
    persist.savedAt = (res && res.savedAt) || '';
    if (res && !res.ls && !res.idb) {
      setSaveState('fail');
      if (!persist.warned) {
        persist.warned = true;
        toast('本地存储写入失败，请用「导出备份」保存进度');
      }
    } else {
      setSaveState('saved');
    }
    if (persist.again) { persist.again = false; return saveLibrary(); }
    return res;
  }).catch(() => {
    persist.saving = false;
    setSaveState('fail');
    return null;
  });
}

/* 载入的数据可能来自旧版本或被截断，补齐结构后再交给应用 */
function sanitizeBooks(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const S = v => (typeof v === 'string' ? v : '');
  const A = v => (Array.isArray(v) ? v : []);
  const N = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rid = p => p + Math.random().toString(36).slice(2, 8);

  const books = [];
  list.forEach((b, i) => {
    if (!b || typeof b !== 'object') return;
    const p = b.project && typeof b.project === 'object' ? b.project : {};
    books.push({
      id: S(b.id) || 'b' + Date.now() + i,
      updated: S(b.updated) || '—',
      project: {
        name: S(p.name) || '未命名作品',
        genre: S(p.genre) || '长篇',
        targetWords: N(p.targetWords, 400000),
        lastSaved: S(p.lastSaved) || '刚刚',
        dailyGoal: N(p.dailyGoal, 2000),
      },
      volumes: A(b.volumes).map(v => ({
        ...v,
        id: S(v.id) || rid('v'),
        title: S(v.title) || '未命名卷',
        status: S(v.status) || '未开始',
        chapters: A(v.chapters).map(c => ({
          ...c,
          id: S(c.id) || rid('c'),
          title: S(c.title) || '未命名章节',
          words: N(c.words, 0),
          status: S(c.status) || '未开始',
          edited: S(c.edited) || '—',
          related: A(c.related),
          /* 早期版本 body 是数组占位，统一为富文本字符串 */
          body: S(c.body),
          note: S(c.note),
        })),
      })),
      characters: A(b.characters).map(c => ({ ...c, relations: A(c.relations) })),
      world: A(b.world),
      settingsGroups: A(b.settingsGroups).map(g => ({ ...g, name: S(g.name), items: A(g.items) })),
      plotlines: A(b.plotlines),
      timeline: A(b.timeline),
      outline: A(b.outline).map(n => ({ ...n, children: A(n.children) })),
      scenes: A(b.scenes).map(s => ({ ...s, chars: A(s.chars) })),
      library: A(b.library).map(g => ({ ...g, group: S(g.group), items: A(g.items) })),
      notes: A(b.notes),
      materials: A(b.materials).map(g => ({ ...g, group: S(g.group), type: S(g.type) || 'text', items: A(g.items) })),
      relations: b.relations && typeof b.relations === 'object'
        ? { nodes: A(b.relations.nodes), links: A(b.relations.links) }
        : { nodes: [], links: [] },
    });
  });
  return books.length ? books : null;
}

/* BOOKS 是 const，原地替换内容并重新指向当前作品 */
function adoptBooks(books) {
  BOOKS.length = 0;
  books.forEach(b => BOOKS.push(b));
  DATA = BOOKS[0] || null;
}

/* 启动：先同步读快照立即渲染，再异步比对 IndexedDB 主存 */
function bootData() {
  const snap = ML_STORE.loadSync();
  const books = snap && sanitizeBooks(snap.books);
  if (books) {
    adoptBooks(books);
    persist.savedAt = snap.savedAt || '';
  }
  /* localStorage 超限没写成时，完整副本只存在于 IndexedDB */
  ML_STORE.loadAsync().then(rec => {
    if (!rec || persist.touched) return;
    if (persist.savedAt && rec.savedAt && rec.savedAt <= persist.savedAt) return;
    const fresh = sanitizeBooks(rec.books);
    if (!fresh) return;
    persist.booting = true;
    adoptBooks(fresh);
    persist.savedAt = rec.savedAt || '';
    renderLibraryView();
    if (!document.body.classList.contains('view-home') && DATA) initWorkbench();
    persist.booting = false;
  }).catch(() => {});
}


const charById = id => DATA.characters.find(c => c.id === id);
const volumeById = id => DATA.volumes.find(v => v.id === id);
const chapterById = id => {
  for (const v of DATA.volumes) {
    const c = v.chapters.find(ch => ch.id === id);
    if (c) return { chapter: c, volume: v };
  }
  return null;
};
const worldById = id => DATA.world.find(w => w.id === id);
const sceneById = id => DATA.scenes.find(s => s.id === id);
const outlineNode = id => {
  for (const n of DATA.outline) {
    if (n.id === id) return n;
    const child = n.children.find(c => c.id === id);
    if (child) return child;
  }
  return null;
};
const plotById = id => DATA.plotlines.find(p => p.id === id);
const tlById = id => DATA.timeline.find(t => t.year === id);
const findTerm = id => {
  const groups = DATA.settingsGroups.concat(DATA.library.map(g => ({ name: g.group, items: g.items })));
  for (const g of groups) {
    const hit = g.items.find(it => `${g.name}·${it.term}` === id);
    if (hit) return { group: g.name, item: hit };
  }
  return null;
};
const findMaterial = id => {
  for (const g of DATA.materials) {
    const hit = g.items.find(it => `${g.group}·${it.name}` === id);
    if (hit) return { group: g, item: hit };
  }
  return null;
};

const svg = paths => `<svg viewBox="0 0 24 24">${paths}</svg>`;

/* 大纲节点可选的类型标签 */
const OUTLINE_TYPES = ['卷', '楔子', '节', '主线', '支线', '暗线', '钩子', '收束'];

/* 章节 / 卷可选的写作状态（定稿绿 / 写作中红 / 修改中黄 / 草稿灰 / 未开始浅灰） */
const STATUS_TYPES = ['定稿', '写作中', '修改中', '草稿', '未开始'];

/* 八个模块行结构：双击重命名 + 行内删除（与大纲 / 章节一致的格式） */
const ROW_CFG = {
  characters: ['.char-row', '.n'],
  world:      ['.world-row', '.t'],
  scenes:     ['.scene-row', '.t'],
  plot:       ['.plot-item', '.p-name'],
  timeline:   ['.tl-item', '.tl-name'],
  notes:      ['.note-card', '.n-title'],
  settings:   ['.term-row', '.term'],
  library:    ['.term-row', '.term'],
  materials:  ['.mat-row', '.m-name']
};

const I = {
  pen:     '<path d="M4 20l1.2-4L16 5.2a1.7 1.7 0 0 1 2.4 0l.4.4a1.7 1.7 0 0 1 0 2.4L8.2 18.8 4 20z"/>',
  loop:    '<path d="M17 3.5a4.5 4.5 0 0 1 0 9H8.5a2.8 2.8 0 0 0 0 5.6H12"/><path d="M14 14.5l3 3 3-3"/><path d="M7 20.5a4.5 4.5 0 0 1 0-9h8.5a2.8 2.8 0 0 0 0-5.6H12"/>',
  spark:   '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
  chat:    '<path d="M4 5.5h16v11H9l-5 4v-15z"/><path d="M8 9.5h8M8 12.5h5"/>',
  trash:   '<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>'
};

const toastTimer = { t: null };
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer.t);
  toastTimer.t = setTimeout(() => el.classList.remove('show'), 1900);
}

/* ---------- 全局状态 ---------- */
const state = {
  module: 'chapters',
  chapterId: null,
  volumeId: null,
  characterId: null,
  sceneId: null,
  worldId: null,
  outlineId: null,
  plotId: null,
  tlId: null,
  termId: null,
  noteId: null,
  matId: null,
  theme: store.get('ml-theme') || 'light',
  focus: false,
  inspector: true,
  sidebar: true
};

const MODULES = {
  chapters:   { title: '章节',   count: () => `${DATA.volumes.length} 卷 · ${DATA.volumes.reduce((s, v) => s + v.chapters.length, 0)} 章` },
  outline:    { title: '大纲',   count: () => `${DATA.outline.length} 卷 · 楔子` },
  scenes:     { title: '场景',   count: () => `${DATA.scenes.length} 场` },
  characters: { title: '人物',   count: () => `${DATA.characters.length} 人` },
  world:      { title: '世界观', count: () => `${DATA.world.length} 条目` },
  settings:   { title: '设定',   count: () => `${DATA.settingsGroups.reduce((s, g) => s + g.items.length, 0)} 条` },
  plot:       { title: '剧情',   count: () => `${DATA.plotlines.length} 条线` },
  timeline:   { title: '时间线', count: () => `${DATA.timeline.length} 个事件` },
  library:    { title: '资料库', count: () => `${DATA.library.reduce((s, g) => s + g.items.length, 0)} 条目` },
  notes:      { title: '笔记',   count: () => `${DATA.notes.length} 则` },
  materials:  { title: '素材库', count: () => `${DATA.materials.reduce((s, g) => s + g.items.length, 0)} 项` }
};

/* 各模块「选中项」对应的 state 字段 */
const SEL_KEYS = {
  chapters: 'chapterId', outline: 'outlineId', scenes: 'sceneId',
  characters: 'characterId', world: 'worldId', settings: 'termId',
  plot: 'plotId', timeline: 'tlId', library: 'termId',
  notes: 'noteId', materials: 'matId'
};
const hasSel = m => {
  if (m === 'chapters') return !!state.chapterId || !!state.volumeId;
  const k = SEL_KEYS[m];
  return !!k && !!state[k];
};

/* ================= 侧边栏列表渲染 ================= */

const EMPTY_LIST = '<div class="empty"><div class="orn">❧</div>暂无内容<br>点击右上角 ＋ 新建</div>';

function renderChapters() {
  if (!DATA.volumes.length) return EMPTY_LIST;
  let html = '';
  for (const v of DATA.volumes) {
    const words = v.chapters.reduce((s, c) => s + c.words, 0);
    html += `
      <div class="group-head col2 open" data-id="${v.id}" data-vol="${v.id}">
        <div class="gh-row1">
          <span class="fold-mark">${svg('<path d="M9 6l6 6-6 6"/>')}</span>
          <span class="vol-name" title="双击卷名可重命名">${v.title}</span>
          <span class="tag status-tag status-${v.status}" data-status="${v.status}" title="点击修改状态">${v.status}</span>
          <span class="row-acts">
            <button class="row-act add" title="在此卷下添加章节">${svg('<path d="M12 5v14M5 12h14"/>')}</button>
            <button class="row-act del" title="删除此卷（含全部章节）">${svg('<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>')}</button>
          </span>
        </div>
        <div class="gh-row2"><span class="g-meta">${v.chapters.length} 章 · 共 ${fmt(words)} 字</span></div>
      </div>
      <div class="group-body">`;
    if (v.chapters.length) {
      for (const c of v.chapters) {
        const active = c.id === state.chapterId ? ' active' : '';
        html += `
          <div class="list-item chapter-row${active}" data-id="${c.id}" data-search="${(v.title + c.title + c.status).toLowerCase()}">
            <span class="status-dot clickable st-${c.status}" data-status="${c.status}" title="点击修改状态"></span>
            <span class="t" title="双击名称可重命名">${c.title}</span>
            <span class="row-acts">
              <button class="row-act del" title="删除此章节">${svg('<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>')}</button>
            </span>
            <span class="words">${c.words ? fmt(c.words) + ' 字' : '—'}</span>
          </div>`;
      }
    } else {
      html += `<div class="empty" style="padding:14px 10px">本卷暂无章节</div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderOutline() {
  if (!DATA.outline.length) return EMPTY_LIST;
  /* 行布局：行首折叠标记（原箭头位置）→ 名称（与编辑页标题联动）→ 类型标签 → 操作按钮 */
  const node = (n, isVol) => `
    <div class="tree-item" data-id="${n.id}">
      <div class="tree-row${isVol ? ' vol' : ''}" data-id="${n.id}" data-search="${(n.title + n.type).toLowerCase()}" title="${isVol ? '点击行折叠/展开 · 双击名称重命名' : '双击名称可重命名'}">
        <span class="fold-mark">${n.children ? svg('<path d="M9 6l6 6-6 6"/>') : ''}</span>
        <span class="t${n.title ? '' : ' untitled'}">${n.title || '未命名'}</span>
        <span class="tag type-tag ${n.type === '节' ? 'ghost' : ''}" data-type="${n.type}" title="点击修改类型">${n.type}</span>
        <span class="row-acts">
          ${isVol ? `<button class="row-act add" title="在此卷下添加节点">${svg('<path d="M12 5v14M5 12h14"/>')}</button>` : ''}
          <button class="row-act del" title="删除${isVol ? '此卷（含全部节点）' : '此节点'}">${svg('<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>')}</button>
        </span>
      </div>
      ${n.children ? `<div class="tree-children">${n.children.map(c => node(c, false)).join('')}</div>` : ''}
    </div>`;
  return DATA.outline.map(n => node(n, true)).join('');
}

function renderScenes() {
  if (!DATA.scenes.length) return EMPTY_LIST;
  return DATA.scenes.map(s => `
    <div class="list-item scene-row" data-id="${s.id}" data-search="${(s.title + s.place + s.chapter).toLowerCase()}">
      <span class="status-dot st-${s.words > 1500 ? '修订' : '草稿'}"></span>
      <span class="t" title="双击名称可重命名">${s.title}</span>
      <span class="tag type-tag ghost tag-editable" title="点击自定义标签">${s.type}</span>
      <span class="row-acts">
        <button class="row-act del" title="删除此场景">${svg(I.trash)}</button>
      </span>
    </div>`).join('');
}

function renderCharacters() {
  if (!DATA.characters.length) return EMPTY_LIST;
  return DATA.characters.map(c => `
    <div class="list-item char-row" data-id="${c.id}" data-search="${(c.name + c.role).toLowerCase()}">
      <span class="avatar sm">${c.name[0]}</span>
      <span class="n" title="双击名称可重命名">${c.name}</span>
      <span class="tag type-tag tag-editable ${c.role === '主角' ? 'main' : c.role === '反派' ? 'dark' : 'ghost'}" title="点击自定义身份标签">${c.role}</span>
      <span class="row-acts">
        <button class="row-act del" title="删除此人物">${svg(I.trash)}</button>
      </span>
    </div>`).join('');
}

function renderWorld() {
  if (!DATA.world.length) return EMPTY_LIST;
  return DATA.world.map(w => `
    <div class="list-item world-row" data-id="${w.id}" data-search="${(w.title + w.type).toLowerCase()}">
      <span class="t" title="双击名称可重命名">${w.title}</span>
      <span class="tag type-tag ghost tag-editable" title="点击自定义标签">${w.type}</span>
      <span class="row-acts">
        <button class="row-act del" title="删除此条目">${svg(I.trash)}</button>
      </span>
    </div>`).join('');
}

function renderSettings() {
  if (!DATA.settingsGroups.length) return EMPTY_LIST;
  return DATA.settingsGroups.map(g => `
    <div class="setting-group">
      <div class="sg-head" data-group="${g.name}">
        <span class="fold-mark">${svg('<path d="M9 6l6 6-6 6"/>')}</span>
        <span class="sg-name" title="双击可重命名分区">${g.name}</span>
        <span class="row-acts">
          <button class="row-act del" title="删除此分区（含全部条目）">${svg(I.trash)}</button>
          <button class="row-act add" title="在此分区下新建条目">${svg(I.plus)}</button>
        </span>
      </div>
      <div class="sg-body">
        ${g.items.map(it => `
          <div class="term-row" data-id="${g.name}·${it.term}" data-search="${(g.name + it.term).toLowerCase()}">
            <div class="term" title="双击名称可重命名">${it.term}</div>
            <span class="tag type-tag ghost tag-editable" title="点击自定义标签">${it.tag}</span>
            <span class="row-acts">
              <button class="row-act del" title="删除此设定">${svg(I.trash)}</button>
            </span>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function renderPlot() {
  if (!DATA.plotlines.length) return EMPTY_LIST;
  return DATA.plotlines.map(p => {
    const types = typeArr(p.type);
    const cls = types.includes('主线') ? 'main' : types.includes('暗线') ? 'dark' : 'ghost';
    return `
    <div class="plot-item" data-id="${p.id}" data-search="${(p.name + types.join('')).toLowerCase()}">
      <div class="p-head">
        <span class="tag type-tag tag-editable ${cls}" title="点击选择多个类型">${types.join(' · ')}</span>
        <span class="p-name" title="双击名称可重命名">${p.name}</span>
        <span class="row-acts">
          <button class="row-act del" title="删除此剧情线">${svg(I.trash)}</button>
        </span>
      </div>
    </div>`;
  }).join('');
}

function renderTimeline() {
  if (!DATA.timeline.length) return EMPTY_LIST;
  return `
    <div class="timeline">
      ${DATA.timeline.map(t => `
        <div class="tl-item" data-id="${t.year}" data-search="${(t.year + t.title + t.type).toLowerCase()}">
          <div class="tl-year" title="双击修改时间">${t.year}</div>
          <div class="tl-title"><span class="tl-name" title="双击名称可重命名">${t.title}</span><span class="tag type-tag ghost tag-editable" title="点击自定义标签">${t.type}</span>
            <span class="row-acts">
              <button class="row-act del" title="删除此事件">${svg(I.trash)}</button>
            </span>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderLibrary() {
  if (!DATA.library.length) return EMPTY_LIST;
  return DATA.library.map(g => `
    <div class="group-head open" data-group="${g.group}">
      <span class="fold-mark">${svg('<path d="M9 6l6 6-6 6"/>')}</span>
      <span class="g-name" title="双击可重命名分组">${g.group}</span>
      <span class="row-acts">
        <button class="row-act del" title="删除此分组（含全部条目）">${svg(I.trash)}</button>
        <button class="row-act add" title="在此分组下新建条目">${svg(I.plus)}</button>
      </span>
      <span class="g-meta">${g.items.length} 条</span>
    </div>
    <div class="group-body">
      ${g.items.map(it => `
        <div class="term-row" data-id="${g.group}·${it.term}" data-search="${(g.group + it.term).toLowerCase()}">
          <div class="term" title="双击名称可重命名">${it.term}</div>
          <span class="tag type-tag ghost tag-editable" title="点击自定义标签">${it.tag}</span>
          <span class="row-acts">
            <button class="row-act del" title="删除此条目">${svg(I.trash)}</button>
          </span>
        </div>`).join('')}
    </div>`).join('');
}

function renderNotes() {
  if (!DATA.notes.length) return EMPTY_LIST;
  return DATA.notes.map(n => `
    <div class="note-card" data-id="${n.id}" data-search="${(n.title + n.tag).toLowerCase()}">
      <div class="n-head">
        <span class="tag type-tag tag-editable ${n.tag === '灵感' ? 'main' : n.tag === '考据' ? 'sub' : ''}" title="点击编辑标签">${n.tag}</span>
        <span class="n-title" title="双击名称可重命名">${n.title}</span>
        <span class="n-date">${n.date}</span>
        <span class="row-acts">
          <button class="row-act del" title="删除此笔记">${svg(I.trash)}</button>
        </span>
      </div>
    </div>`).join('');
}

function renderMaterials() {
  if (!DATA.materials.length) return EMPTY_LIST;
  return DATA.materials.map(g => `
    <div class="group-head open" data-group="${g.group}">
      <span class="fold-mark">${svg('<path d="M9 6l6 6-6 6"/>')}</span>
      <span>${g.group}</span>
      <span class="row-acts">
        <button class="row-act add" title="在此分组下新建素材">${svg(I.plus)}</button>
      </span>
      <span class="g-meta">${g.items.length} 项</span>
    </div>
    <div class="group-body">
      ${g.items.map(m => `
        <div class="mat-row" data-id="${g.group}·${m.name}" data-search="${(g.group + m.name).toLowerCase()}">
          <span class="m-name" title="双击名称可重命名">${m.name}</span>
          <span class="tag type-tag ghost tag-editable" title="点击自定义标签">${m.tag}</span>
          <span class="row-acts">
            <button class="row-act del" title="删除此素材">${svg(I.trash)}</button>
          </span>
        </div>`).join('')}
    </div>`).join('');
}

/* ---------- 面板脚注 ---------- */
function panelFoot(module) {
  switch (module) {
    case 'chapters': return `<span>点击章节在右侧编辑区打开</span>`;
    case 'characters': return `<span>点击人物打开人物页 · 双击名称重命名</span>`;
    case 'plot': return '<span>点击剧情线打开编辑页 · 类型标签可点击修改</span>';
    case 'settings': return '<span>顶部 ＋ 新建分区 · 分区内 ＋ 新建条目 · 双击名称重命名</span>';
    case 'library': return '<span>顶部 ＋ 新建分组 · 分组内 ＋ 新建条目 · 双击名称重命名</span>';
    case 'timeline': return '<span>长按条目可拖动排序 · 双击时间修改 · 双击名称重命名</span>';
    default: return '<span>点击条目在右侧打开编辑页 · 双击名称重命名</span>';
  }
}

/* ================= 模块切换 ================= */

const BODY_EL = $('#moduleBody');

/* 各模块列表渲染器（switchModule 与 rerenderList 共用） */
const LIST_RENDERERS = {
  chapters: renderChapters, outline: renderOutline, scenes: renderScenes,
  characters: renderCharacters, world: renderWorld, settings: renderSettings,
  plot: renderPlot, timeline: renderTimeline,
  library: renderLibrary, notes: renderNotes, materials: renderMaterials
};

function switchModule(module) {
  state.module = module;
  $$('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.module === module));
  const meta = MODULES[module];
  $('#moduleTitle').innerHTML = `${meta.title}<span class="count">${meta.count()}</span>`;
  $('#moduleVol').style.display = (module === 'outline' || module === 'chapters') ? '' : 'none';
  /* 设定 / 资料库 / 素材库的顶部 ＋ 建的是与预设同级的栏目，不是条目 */
  $('#moduleAdd').title = {
    settings: '新建分区（与核心规则、历史大事同级）',
    library: '新建分组（与现有分组同级）',
    materials: '新建素材组（与现有素材组同级）',
  }[module] || '新建条目';

  BODY_EL.innerHTML = LIST_RENDERERS[module]();
  $('#panelFoot').innerHTML = panelFoot(module);

  $('#searchInput').value = '';
  bindModuleEvents(module);
  refreshActive(module);
  updateDelBtn();
  renderEditor();
  renderInspector();
}

/* 局部刷新当前模块列表（保留模块，重建行与事件） */
function rerenderList() {
  const m = state.module;
  BODY_EL.innerHTML = LIST_RENDERERS[m]();
  bindModuleEvents(m);
  refreshActive(m);
  updateDelBtn();
  markDirty();   /* 侧栏结构性改动（新建 / 删除 / 重命名 / 改标签）统一在此落盘 */
}

/* 删除按钮可用性 */
function updateDelBtn() {
  const btn = $('#moduleDel');
  btn.disabled = !hasSel(state.module);
}

/* 选中态刷新 */
function refreshActive(module) {
  if (module === 'settings' || module === 'library') {
    $$('.term-row', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.termId));
    return;
  }
  if (module === 'outline') {
    $$('.tree-row', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.outlineId));
    return;
  }
  if (module === 'plot') {
    $$('.plot-item', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.plotId));
    return;
  }
  if (module === 'timeline') {
    $$('.tl-item', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.tlId));
    return;
  }
  if (module === 'notes') {
    $$('.note-card', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.noteId));
    return;
  }
  if (module === 'materials') {
    $$('.mat-row', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.matId));
    return;
  }
  if (module === 'chapters') {
    $$('.chapter-row', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state.chapterId));
    $$('.group-head', BODY_EL).forEach(h => h.classList.toggle('active', h.dataset.id === state.volumeId));
    return;
  }
  $$('.list-item', BODY_EL).forEach(r => r.classList.toggle('active', r.dataset.id === state[SEL_KEYS[module]]));
}

/* ================= 时间线：长按拖动排序 ================= */

const TL_LONG_PRESS_MS = 350;   /* 长按多久进入拖动态 */
const TL_MOVE_TOLERANCE = 6;    /* 长按成立前允许的抖动像素 */

const tlDrag = { timer: null, el: null, startX: 0, startY: 0, dragging: false, justDragged: false };
let tlDragBound = false;

function tlDragReset() {
  clearTimeout(tlDrag.timer);
  tlDrag.timer = null;
  if (tlDrag.el) tlDrag.el.classList.remove('tl-dragging');
  const box = $('.timeline', BODY_EL);
  if (box) box.classList.remove('tl-reordering');
  document.body.classList.remove('no-select');
  tlDrag.el = null;
  tlDrag.dragging = false;
}

/* DOM 顺序 → 数据顺序。年份即 id，重复年份按先到先消费保证结果确定 */
function commitTimelineOrder() {
  const ids = $$('.timeline .tl-item', BODY_EL).map(el => el.dataset.id);
  const pool = DATA.timeline.slice();
  const next = [];
  ids.forEach(id => {
    const i = pool.findIndex(t => t.year === id);
    if (i > -1) next.push(pool.splice(i, 1)[0]);
  });
  next.push(...pool);   /* 理论上不该有剩余，兜底防丢条目 */
  DATA.timeline = next;
}

function onTlMove(e) {
  if (!tlDrag.el) return;
  /* 长按还没成立就移动 → 判定为划选 / 滚动，取消 */
  if (!tlDrag.dragging) {
    if (Math.abs(e.clientY - tlDrag.startY) > TL_MOVE_TOLERANCE ||
        Math.abs(e.clientX - tlDrag.startX) > TL_MOVE_TOLERANCE) {
      clearTimeout(tlDrag.timer);
      tlDrag.el = null;
    }
    return;
  }
  e.preventDefault();
  /* 光标越过相邻条目中线即换位，直接移动真实节点做实时预览 */
  const others = $$('.timeline .tl-item', BODY_EL).filter(el => el !== tlDrag.el);
  const before = others.find(el => {
    const r = el.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  });
  if (before) before.parentNode.insertBefore(tlDrag.el, before);
  else if (others.length) others[others.length - 1].parentNode.appendChild(tlDrag.el);
}

function onTlUp() {
  if (!tlDrag.dragging) return tlDragReset();
  commitTimelineOrder();
  tlDragReset();
  /* 拖完紧随的 click 不应再切换选中项 */
  tlDrag.justDragged = true;
  setTimeout(() => { tlDrag.justDragged = false; }, 0);
  rerenderList();
  refreshActive('timeline');
  renderInspector();
  toast('时间线顺序已更新');
}

function bindTimelineDrag() {
  const box = $('.timeline', BODY_EL);
  if (!box) return;

  $$('.tl-item', box).forEach(item => {
    item.onmousedown = e => {
      if (e.button !== 0) return;                                   /* 仅左键 */
      if (e.target.closest('.row-act, .tag-editable, input')) return;
      /* 搜索过滤时列表不完整，拖动会打乱未显示的条目 */
      if ($$('.timeline .tl-item.hidden', BODY_EL).length) {
        return toast('搜索状态下不支持拖动排序，请先清空搜索');
      }
      tlDrag.el = item;
      tlDrag.startX = e.clientX;
      tlDrag.startY = e.clientY;
      clearTimeout(tlDrag.timer);
      tlDrag.timer = setTimeout(() => {
        if (!tlDrag.el) return;
        tlDrag.dragging = true;
        tlDrag.el.classList.add('tl-dragging');
        box.classList.add('tl-reordering');
        document.body.classList.add('no-select');
        toast('已拾起 · 上下拖动调整顺序，松开完成');
      }, TL_LONG_PRESS_MS);
    };
  });

  /* 文档级监听只挂一次，否则每次重渲染都会叠加 */
  if (tlDragBound) return;
  tlDragBound = true;
  document.addEventListener('mousemove', onTlMove);
  document.addEventListener('mouseup', onTlUp);
  BODY_EL.addEventListener('click', e => {
    if (tlDrag.justDragged) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

function bindModuleEvents(module) {
  /* 卷 / 文件夹折叠（分组名与改名输入框除外，否则重命名会连带折叠） */
  $$('.group-head', BODY_EL).forEach(h => {
    h.onclick = e => {
      if (e.target.closest('.g-name, .tree-name-input')) return;
      h.classList.toggle('open');
      const body = h.nextElementSibling;
      if (body && body.classList.contains('group-body')) body.style.display = h.classList.contains('open') ? '' : 'none';
    };
  });

  /* 设定分区折叠（分区名与改名输入框除外，否则重命名会连带折叠） */
  $$('.setting-group .sg-head', BODY_EL).forEach(h => {
    h.onclick = e => {
      if (e.target.closest('.sg-name, .tree-name-input')) return;
      h.parentElement.classList.toggle('collapsed');
    };
  });

  /* 设定分组行内 ＋：在该分组下直接新建条目 */
  if (module === 'settings') {
    $$('.sg-head .row-act.add', BODY_EL).forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const head = btn.closest('.sg-head');
        addSettingItem(head.dataset.group);
      };
    });

    /* 分区行内删除：二次确认后连同分区内条目一并删除 */
    $$('.sg-head .row-act.del', BODY_EL).forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        confirmTermGroupDel('settings', btn, btn.closest('.sg-head').dataset.group);
      };
    });

    /* 分区名双击就地重命名（预设的核心规则 / 历史大事同样可改） */
    $$('.setting-group .sg-name', BODY_EL).forEach(el => {
      el.ondblclick = e => {
        e.stopPropagation();
        const oldName = el.closest('.sg-head').dataset.group;
        inlineEdit(el, val => renameTermGroup('settings', oldName, val));
      };
    });
  }

  /* 资料库 / 素材库分组行内 ＋：在该分组下直接新建条目 / 素材 */
  if (module === 'library' || module === 'materials') {
    $$('.group-head .row-act.add', BODY_EL).forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const head = btn.closest('.group-head');
        if (module === 'library') addLibraryItem(head.dataset.group);
        else addMaterialItem(head.dataset.group);
      };
    });
  }

  /* 资料库分组：行内删除 + 双击分组名改名（与设定分区一致） */
  if (module === 'library') {
    $$('.group-head .row-act.del', BODY_EL).forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        confirmTermGroupDel('library', btn, btn.closest('.group-head').dataset.group);
      };
    });

    $$('.group-head .g-name', BODY_EL).forEach(el => {
      el.ondblclick = e => {
        e.stopPropagation();
        const oldName = el.closest('.group-head').dataset.group;
        inlineEdit(el, val => renameTermGroup('library', oldName, val));
      };
    });
  }

  /* 时间线：双击灰色时间 → 就地修改；长按条目 → 拖动排序 */
  if (module === 'timeline') {
    $$('.tl-item .tl-year', BODY_EL).forEach(y => {
      y.ondblclick = e => {
        e.stopPropagation();
        editYear(y.closest('.tl-item'), y.closest('.tl-item').dataset.id);
      };
    });
    bindTimelineDrag();
  }

  /* 大纲树：选中 + 折叠 + 行内操作（卷下加节点 / 删卷删节点 / 改类型 / 双击重命名） */
  if (module === 'outline') {
    $$('.tree-row', BODY_EL).forEach(r => {
      r.onclick = () => {
        const item = r.parentElement;
        if (item.querySelector('.tree-children')) item.classList.toggle('collapsed');
        state.outlineId = r.dataset.id;
        refreshActive('outline');
        updateDelBtn();
        renderEditor();
        renderInspector();
      };
      /* 双击卷名 / 节点名 → 就地重命名 */
      const tEl = r.querySelector('.t');
      if (tEl) tEl.ondblclick = e => { e.stopPropagation(); startRename(r, 'outline', r.dataset.id); };
      /* 类型标签 → 展开类型选择 */
      const tag = r.querySelector('.type-tag');
      if (tag) tag.onclick = e => { e.stopPropagation(); toggleTypeMenu(r, tag); };
      /* 卷行 ＋：在卷下添加节点 */
      const addBtn = r.querySelector('.row-act.add');
      if (addBtn) addBtn.onclick = e => { e.stopPropagation(); addOutlineChild(r.dataset.id); };
      /* 行内删除（卷 = 整卷含节点；节点 = 单节点），二次确认 */
      const delBtn = r.querySelector('.row-act.del');
      if (delBtn) delBtn.onclick = e => { e.stopPropagation(); confirmRowDel(r, delBtn); };
    });
  }

  /* 章节：状态点修改状态、卷状态修改、卷名重命名、卷下加章节、删卷/删章 */
  if (module === 'chapters') {
    $$('.chapter-row', BODY_EL).forEach(r => {
      r.onclick = () => {
        state.chapterId = r.dataset.id;
        state.volumeId = null;
        refreshActive('chapters');
        updateDelBtn();
        renderEditor();
        renderInspector();
      };
      /* 状态点：点击弹出状态选择 */
      const dot = r.querySelector('.status-dot');
      if (dot) dot.onclick = e => {
        e.stopPropagation();
        const ch = chapterById(r.dataset.id).chapter;
        toggleStatusMenu(dot, ch.status, s => {
          ch.status = s;
          rerenderList();
          refreshActive('chapters');
          renderEditor();
          renderInspector();
        }, BODY_EL);
      };
      /* 双击名称重命名 */
      const tEl = r.querySelector('.t');
      if (tEl) tEl.ondblclick = e => { e.stopPropagation(); startRename(r, 'chapters', r.dataset.id); };
      /* 行内删除章节（二次确认） */
      const delBtn = r.querySelector('.row-act.del');
      if (delBtn) delBtn.onclick = e => { e.stopPropagation(); confirmChapterDel(r, delBtn); };
    });

    $$('.group-head', BODY_EL).forEach(h => {
      const v = volumeById(h.dataset.vol);
      if (!v) return;
      /* 点击卷头：折叠切换 + 选中卷（右侧打开卷编辑页） */
      h.onclick = () => {
        const body = h.nextElementSibling;
        if (body && body.classList.contains('group-body')) body.style.display = body.style.display === 'none' ? '' : 'none';
        h.classList.toggle('open', !h.classList.contains('open'));
        state.volumeId = v.id;
        state.chapterId = null;
        refreshActive('chapters');
        updateDelBtn();
        renderEditor();
        renderInspector();
      };
      /* 双击卷名重命名 */
      const vName = h.querySelector('.vol-name');
      if (vName) vName.ondblclick = e => { e.stopPropagation(); startRename(h, 'volume', v.id); };
      /* 卷状态标签：点击弹出状态选择 */
      const stTag = h.querySelector('.status-tag');
      if (stTag) stTag.onclick = e => {
        e.stopPropagation();
        toggleStatusMenu(stTag, v.status, s => {
          v.status = s;
          rerenderList();
          renderEditor();
          renderInspector();
        }, BODY_EL);
      };
      /* 卷行 ＋：在此卷下添加章节 */
      const addBtn = h.querySelector('.row-act.add');
      if (addBtn) addBtn.onclick = e => { e.stopPropagation(); addChapterToVolume(v.id); };
      /* 卷行 🗑：删除整卷（二次确认） */
      const delBtn = h.querySelector('.row-act.del');
      if (delBtn) delBtn.onclick = e => { e.stopPropagation(); confirmVolDel(h, delBtn, v.id); };
    });
  }

  /* 各模块条目：点击 → 右侧编辑区打开内容页 */
  const pick = {
    'characters': { sel: '.char-row', set: id => { state.characterId = id; refreshActive('characters'); } },
    'world':      { sel: '.world-row', set: id => { state.worldId = id; refreshActive('world'); } },
    'scenes':     { sel: '.scene-row', set: id => { state.sceneId = id; refreshActive('scenes'); } },
    'plot':       { sel: '.plot-item', set: id => { state.plotId = id; refreshActive('plot'); } },
    'timeline':   { sel: '.tl-item',   set: id => { state.tlId = id; refreshActive('timeline'); } },
    'notes':      { sel: '.note-card', set: id => { state.noteId = id; refreshActive('notes'); } },
    'materials':  { sel: '.mat-row',   set: id => { state.matId = id; refreshActive('materials'); } },
    'settings':   { sel: '.term-row',  set: id => { state.termId = id; refreshActive('settings'); refreshActive('library'); } },
    'library':    { sel: '.term-row',  set: id => { state.termId = id; refreshActive('settings'); refreshActive('library'); } }
  };
  const cfg = pick[module];
  if (cfg) {
    $$(cfg.sel, BODY_EL).forEach(r => {
      r.onclick = () => {
        cfg.set(r.dataset.id);
        updateDelBtn();
        renderEditor();
        renderInspector();
      };
    });
  }

  /* 八个模块统一行操作：双击名称重命名 + 行内删除（与大纲 / 章节一致的格式） */
  const rc = ROW_CFG[module];
  if (rc) {
    $$(rc[0], BODY_EL).forEach(r => {
      const tEl = r.querySelector(rc[1]);
      if (tEl) tEl.ondblclick = e => { e.stopPropagation(); startRename(r, module, r.dataset.id); };
      const delBtn = r.querySelector('.row-act.del');
      if (delBtn) delBtn.onclick = e => { e.stopPropagation(); confirmRowDelGeneric(r, delBtn, module); };
    });
  }

  /* 行内标签（场景 / 资料库 / 世界观 / 设定 / 人物 / 剧情 / 时间线 / 素材库）：
     剧情 → 弹出多选类型面板；其余 → 自由输入自定义，改后同步编辑页徽章与信息面板 */
  $$('.tag-editable', BODY_EL).forEach(tag => {
    tag.onclick = e => {
      e.stopPropagation();
      const row = tag.closest('[data-id]');
      if (module === 'plot') {
        plotTagMenu(tag, plotById(row.dataset.id).type, arr => {
          if (!arr.length) return toast('请至少选择一个类型');
          setTag('plot', row.dataset.id, arr);
          rerenderList();
          refreshActive('plot');
          renderEditor();
          renderInspector();
        });
      } else {
        tagInput(tag, tag.textContent, v => {
          setTag(module, row.dataset.id, v);
          rerenderList();
          refreshActive(module);
          renderEditor();
          renderInspector();
        });
      }
    };
  });
}

/* ================= 大纲：卷与节点管理 ================= */

/* 新建卷（大纲：顶层节点；章节：写作卷） */
function addVolume() {
  if (state.module === 'chapters') {
    const v = { id: 'v' + Date.now(), title: `卷${cnNum(DATA.volumes.length + 1)}`, status: '未开始', chapters: [] };
    DATA.volumes.push(v);
    toast('已新建卷 · 双击卷名可重命名');
  } else {
    const volCount = DATA.outline.filter(n => n.type === '卷').length;
    const v = { id: 'o' + Date.now(), type: '卷', title: `卷${cnNum(volCount + 1)}`, note: '', children: [] };
    DATA.outline.push(v);
    toast('已新建卷 · 双击卷名可重命名');
  }
  rerenderList();
  refreshActive(state.module);
  renderEditor();
  renderInspector();
}

/* 在指定卷下添加节点 */
function addOutlineChild(volId) {
  const v = DATA.outline.find(n => n.id === volId);
  if (!v || !v.children) return;
  const child = { id: 'o' + Date.now(), type: '节', title: `小节${cnNum(countOutlineNodes() + 1)}`, note: '' };
  v.children.push(child);
  state.outlineId = child.id;
  rerenderList();
  refreshActive('outline');
  renderEditor();
  renderInspector();
  toast('已在此卷下添加节点');
}

/* 删除卷（含全部节点）或单节点 */
function delOutlineById(id) {
  const isVol = DATA.outline.some(n => n.id === id);
  DATA.outline = DATA.outline.filter(n => n.id !== id);
  if (!isVol) {
    for (const v of DATA.outline) {
      if (v.children) v.children = v.children.filter(c => c.id !== id);
    }
  }
  /* 若当前选中项已不存在（含随卷一起删除的子节点），清空选中 */
  if (!outlineNode(state.outlineId)) state.outlineId = null;
  rerenderList();
  refreshActive('outline');
  updateDelBtn();
  renderEditor();
  renderInspector();
  toast('已删除');
}

/* 行内删除：二次确认 */
const rowDelTimer = { t: null };
function confirmRowDel(row, btn) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = '再次点击确认删除';
    toast('再次点击确认删除');
    clearTimeout(rowDelTimer.t);
    rowDelTimer.t = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = '删除';
    }, 3000);
    return;
  }
  delOutlineById(row.dataset.id);
}

/* 八个模块通用行内删除：二次确认后选中该行条目并删除 */
function confirmRowDelGeneric(row, btn, m) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = '再次点击确认删除';
    toast('再次点击确认删除');
    clearTimeout(rowDelTimer.t);
    rowDelTimer.t = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = '删除';
    }, 3000);
    return;
  }
  setSel(m, row.dataset.id);
  delItem();
}

/* 通用类型选择菜单（大纲行内标签共用；其余模块标签为自由输入） */
function pickType(tag, types, current, onPick) {
  const existing = tag.parentElement.querySelector('.type-menu');
  if (existing) { existing.remove(); return; }
  $$('.type-menu', BODY_EL).forEach(m => m.remove());
  const menu = document.createElement('span');
  menu.className = 'type-menu';
  menu.innerHTML = types.map(t =>
    `<span class="tm-item${t === current ? ' sel' : ''}" data-t="${t}">${t}</span>`).join('');
  tag.after(menu);
  menu.querySelectorAll('.tm-item').forEach(it => {
    it.onclick = e => {
      e.stopPropagation();
      onPick(it.dataset.t);
      menu.remove();
    };
  });
}

/* 标签自由输入：点击标签 → 替换为输入框，回车 / 失焦提交，Esc 取消 */
function tagInput(tag, current, onPick) {
  const input = document.createElement('input');
  input.className = 'tree-name-input tag-input';
  input.value = current;
  input.maxLength = 10;
  tag.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = val => {
    if (done) return;
    done = true;
    input.replaceWith(tag);          /* 恢复原标签元素 */
    tag.textContent = val;
    onPick(val);
  };
  const cancel = () => {
    if (done) return;
    done = true;
    input.replaceWith(tag);
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(input.value.trim() || current);
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', () => finish(input.value.trim() || current));
  input.addEventListener('mousedown', e => e.stopPropagation());
}

/* 写入自定义标签（八个模块统一） */
function setTag(m, id, v) {
  if (m === 'world')      { const x = worldById(id);      if (x) x.type = v; }
  else if (m === 'plot')  { const x = plotById(id);       if (x) x.type = v; }
  else if (m === 'timeline') { const x = tlById(id);      if (x) x.type = v; }
  else if (m === 'characters') { const x = charById(id);  if (x) x.role = v; }
  else if (m === 'scenes') { const x = sceneById(id);     if (x) x.type = v; }
  else if (m === 'notes') { const n = DATA.notes.find(x => x.id === id); if (n) n.tag = v; }
  else if (m === 'settings' || m === 'library') { const t = findTerm(id); if (t) t.item.tag = v; }
  else if (m === 'materials') { const mt = findMaterial(id); if (mt) mt.item.tag = v; }
}

/* 剧情线可选类型（点击标签弹出，可多选） */
const PLOT_TAG_OPTIONS = ['主线', '支线', '暗线', '明线', '感情线', '反转线', '成长线', '救赎线', '复仇线'];
const typeArr = t => (Array.isArray(t) ? t : (t ? [t] : []));

/* 剧情标签多选面板：勾选多个类型，「确定」提交 */
function plotTagMenu(tag, current, onPick) {
  const existing = tag.parentElement.querySelector('.type-menu');
  if (existing) { existing.remove(); return; }
  $$('.type-menu', BODY_EL).forEach(m => m.remove());
  const picked = new Set(typeArr(current));
  const menu = document.createElement('span');
  menu.className = 'type-menu multi';
  menu.innerHTML = PLOT_TAG_OPTIONS.map(t =>
    `<span class="tm-item${picked.has(t) ? ' sel' : ''}" data-t="${t}">${t}</span>`).join('')
    + '<span class="tm-ok">确定</span>';
  tag.after(menu);
  menu.querySelectorAll('.tm-item').forEach(it => {
    it.onclick = e => {
      e.stopPropagation();
      if (picked.has(it.dataset.t)) picked.delete(it.dataset.t);
      else picked.add(it.dataset.t);
      it.classList.toggle('sel');
    };
  });
  menu.querySelector('.tm-ok').onclick = e => {
    e.stopPropagation();
    menu.remove();
    onPick(PLOT_TAG_OPTIONS.filter(t => picked.has(t)));
  };
}

/* 时间线：双击灰色时间 → 就地修改（年份即条目 id，改后同步选中与编辑页） */
function editYear(row, id) {
  const yEl = row.querySelector('.tl-year');
  if (!yEl) return;
  const old = yEl.textContent;
  const input = document.createElement('input');
  input.className = 'tree-name-input tag-input';
  input.value = old;
  input.maxLength = 24;
  yEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    const t = tlById(id);
    if (!t || !v || v === old) { rerenderList(); return; }
    if (DATA.timeline.some(x => x.year === v)) {
      rerenderList();
      toast('该时间已存在');
      return;
    }
    t.year = v;
    if (state.tlId === id) state.tlId = v;
    rerenderList();
    refreshActive('timeline');
    updateDelBtn();
    renderEditor();
    renderInspector();
    toast('时间已修改');
  };
  const cancel = () => {
    if (done) return;
    done = true;
    rerenderList();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', commit);
  input.addEventListener('mousedown', e => e.stopPropagation());
}

/* 就地重命名（侧边栏行内，m 为所属模块，'volume' 表示章节卷名；名称元素由 ROW_CFG 决定） */
function startRename(row, m, id) {
  const nameSel = (ROW_CFG[m] && ROW_CFG[m][1]) || (m === 'volume' ? '.vol-name' : '.t');
  const tEl = row.querySelector(nameSel);
  if (!tEl) return;
  const old = tEl.textContent;
  const input = document.createElement('input');
  input.className = 'tree-name-input';
  input.value = old;
  tEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    updateDataTitle(m, id, input.value.trim() || old);
    rerenderList();
    refreshActive(m === 'volume' ? 'chapters' : m);
    renderEditor();
    renderInspector();
  };
  const cancel = () => {
    if (done) return;
    done = true;
    rerenderList();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', commit);
  input.addEventListener('mousedown', e => e.stopPropagation());
}

/* 类型标签：行内展开类型选择菜单 */
function toggleTypeMenu(row, tag) {
  const existing = row.querySelector('.type-menu');
  if (existing) { existing.remove(); return; }
  $$('.type-menu', BODY_EL).forEach(m => m.remove());
  const n = outlineNode(row.dataset.id);
  if (!n) return;
  const menu = document.createElement('span');
  menu.className = 'type-menu';
  menu.innerHTML = OUTLINE_TYPES.map(t =>
    `<span class="tm-item${t === n.type ? ' sel' : ''}" data-t="${t}">${t}</span>`).join('');
  tag.after(menu);
  menu.querySelectorAll('.tm-item').forEach(it => {
    it.onclick = e => {
      e.stopPropagation();
      n.type = it.dataset.t;
      menu.remove();
      rerenderList();
      refreshActive('outline');
      renderEditor();
      renderInspector();
    };
  });
}

/* ================= 章节：卷与章节管理 ================= */

/* 通用状态选择菜单（章节状态点 / 卷状态标签 / 卷编辑页徽章共用） */
function toggleStatusMenu(anchorEl, current, onPick, scope) {
  scope = scope || BODY_EL;
  const existing = anchorEl.parentElement.querySelector('.type-menu');
  if (existing) { existing.remove(); return; }
  $$('.type-menu', scope).forEach(m => m.remove());
  const menu = document.createElement('span');
  menu.className = 'type-menu';
  menu.innerHTML = STATUS_TYPES.map(t =>
    `<span class="tm-item${t === current ? ' sel' : ''}" data-t="${t}">${t}</span>`).join('');
  anchorEl.after(menu);
  menu.querySelectorAll('.tm-item').forEach(it => {
    it.onclick = e => {
      e.stopPropagation();
      onPick(it.dataset.t);
      menu.remove();
    };
  });
}

/* 在指定卷下添加章节 */
function addChapterToVolume(volId) {
  const v = volumeById(volId);
  if (!v) return;
  const ch = { id: 'c' + Date.now(), title: `第${cnNum(v.chapters.length + 1)}章`, words: 0, status: '草稿', edited: '—', related: [], body: [] };
  v.chapters.push(ch);
  state.chapterId = ch.id;
  rerenderList();
  refreshActive('chapters');
  renderEditor();
  renderInspector();
  toast('已在此卷下添加章节');
}

/* 删除整卷（含全部章节） */
function delVolumeById(id) {
  DATA.volumes = DATA.volumes.filter(v => v.id !== id);
  if (!chapterById(state.chapterId)) state.chapterId = null;
  if (state.volumeId === id) state.volumeId = null;
  rerenderList();
  refreshActive('chapters');
  updateDelBtn();
  renderEditor();
  renderInspector();
  toast('已删除此卷');
}

/* 删除单个章节 */
function delChapterById(id) {
  for (const v of DATA.volumes) v.chapters = v.chapters.filter(c => c.id !== id);
  if (state.chapterId === id) state.chapterId = null;
  rerenderList();
  refreshActive('chapters');
  updateDelBtn();
  renderEditor();
  renderInspector();
  toast('已删除章节');
}

/* 卷行 / 章节行删除：二次确认 */
function confirmVolDel(head, btn, id) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = '再次点击确认删除';
    toast('再次点击确认删除此卷');
    clearTimeout(rowDelTimer.t);
    rowDelTimer.t = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = '删除';
    }, 3000);
    return;
  }
  delVolumeById(id);
}

/* 设定分区与资料库分组共用一套分区操作：两者的条目 id 都是「分区名·条目名」，
   也都由 state.termId 选中，所以重名检查必须跨这两个模块 */
const TERM_GROUP_CFG = {
  settings: { list: () => DATA.settingsGroups, key: 'name',  word: '分区' },
  library:  { list: () => DATA.library,        key: 'group', word: '分组' }
};

const termGroupNames = () =>
  DATA.settingsGroups.map(g => g.name).concat(DATA.library.map(g => g.group));

/* 删除分区 / 分组（连同其中全部条目） */
function delTermGroup(m, name) {
  const cfg = TERM_GROUP_CFG[m];
  const list = cfg.list();
  const idx = list.findIndex(g => g[cfg.key] === name);
  if (idx < 0) return toast(`未找到该${cfg.word}`);
  /* 选中项在该分区内 → 一并清空，避免编辑区指向已删数据 */
  if (state.termId && state.termId.indexOf(name + '·') === 0) state.termId = null;
  const removed = list.splice(idx, 1)[0];
  rerenderList();
  refreshActive(m);
  updateDelBtn();
  renderEditor();
  renderInspector();
  const n = removed.items.length;
  toast(`已删除${cfg.word}「${name}」${n ? `及其 ${n} 条条目` : ''}`);
}

function confirmTermGroupDel(m, btn, name) {
  const word = TERM_GROUP_CFG[m].word;
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = '再次点击确认删除';
    toast(`再次点击确认删除此${word}（含全部条目）`);
    clearTimeout(rowDelTimer.t);
    rowDelTimer.t = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = `删除此${word}（含全部条目）`;
    }, 3000);
    return;
  }
  delTermGroup(m, name);
}

/* 重命名分区 / 分组（核心规则、历史大事等预设项同样可改） */
function renameTermGroup(m, oldName, newName) {
  const cfg = TERM_GROUP_CFG[m];
  const g = cfg.list().find(x => x[cfg.key] === oldName);
  if (!g) return;
  const name = (newName || '').trim();
  if (!name || name === oldName) return rerenderList();
  if (termGroupNames().includes(name)) {
    toast(`名称「${name}」已被占用，请换一个`);
    return rerenderList();
  }
  g[cfg.key] = name;
  /* 条目 id 形如「分区名·条目名」，选中项要跟着迁移 */
  if (state.termId && state.termId.indexOf(oldName + '·') === 0) {
    state.termId = name + '·' + state.termId.slice(oldName.length + 1);
  }
  rerenderList();
  refreshActive(m);
  renderEditor();
  renderInspector();
  toast(`${cfg.word}已改名为「${name}」`);
}

function confirmChapterDel(row, btn) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.title = '再次点击确认删除';
    toast('再次点击确认删除此章节');
    clearTimeout(rowDelTimer.t);
    rowDelTimer.t = setTimeout(() => {
      btn.classList.remove('confirming');
      btn.title = '删除';
    }, 3000);
    return;
  }
  delChapterById(row.dataset.id);
}

/* ================= 条目新建 / 删除 ================= */

/* 在指定设定分组下新建条目（分组行内 ＋ 与模块栏 ＋ 共用），新条目直接出现在该分组下 */
function addSettingItem(groupName) {
  const g = DATA.settingsGroups.find(x => x.name === groupName);
  if (!g) return toast('未找到该分组');
  const prefix = { '核心规则': '规则', '历史大事': '事件' }[g.name] || '条目';
  const t = { term: `${prefix}${cnNum(g.items.length + 1)}`, tag: '规则', def: '' };
  g.items.push(t);
  state.termId = `${g.name}·${t.term}`;
  rerenderList();
  refreshActive('settings');
  updateDelBtn();
  renderEditor();
  renderInspector();
  toast(`已在「${g.name}」下新建条目`);
}

/* 在指定资料库分组下新建条目（分组行内 ＋ 与模块栏 ＋ 共用） */
function addLibraryItem(groupName) {
  const g = DATA.library.find(x => x.group === groupName);
  if (!g) return toast('未找到该分组');
  const t = { term: `条目${cnNum(g.items.length + 1)}`, tag: '资料', def: '' };
  g.items.push(t);
  state.termId = `${g.group}·${t.term}`;
  rerenderList();
  refreshActive('library');
  updateDelBtn();
  renderEditor();
  renderInspector();
  toast(`已在「${g.group}」下新建条目`);
}

/* 在指定素材分组下新建素材（分组行内 ＋ 与模块栏 ＋ 共用） */
function addMaterialItem(groupName) {
  const g = DATA.materials.find(x => x.group === groupName);
  if (!g) return toast('未找到该分组');
  const it = { name: `素材${cnNum(g.items.length + 1)}`, tag: '未分类', meta: '', time: '08-18' };
  g.items.push(it);
  state.matId = `${g.group}·${it.name}`;
  rerenderList();
  refreshActive('materials');
  updateDelBtn();
  renderEditor();
  renderInspector();
  toast(`已在「${g.group}」下新建素材`);
}

/* 新建分组（模块栏 ＋：设定 / 资料库 / 素材库 = 新建与预设分区同级的新栏目） */
function addGroup(m) {
  /* 分组名是条目 id 的组成部分，重名会让 findTerm 取错条目，故逐个递增避开。
     序号按本模块的分组数起算，但避让的是设定 + 资料库的全部名称 */
  const uniqueName = (prefix, count, taken) => {
    let n = count + 1;
    let name = prefix + cnNum(n);
    while (taken.includes(name)) name = prefix + cnNum(++n);
    return name;
  };
  if (m === 'settings') {
    const name = uniqueName('分区', DATA.settingsGroups.length, termGroupNames());
    DATA.settingsGroups.push({ name, items: [] });
    toast(`已新建设定分区「${name}」· 双击分区名可改名`);
  } else if (m === 'library') {
    const name = uniqueName('分组', DATA.library.length, termGroupNames());
    DATA.library.push({ group: name, items: [] });
    toast(`已新建资料库分组「${name}」· 双击分组名可改名`);
  } else if (m === 'materials') {
    const name = uniqueName('素材组', DATA.materials.length, DATA.materials.map(g => g.group));
    DATA.materials.push({ group: name, type: 'text', items: [] });
    toast('已新建素材分组 · 分组行内 ＋ 可在该分组下新建素材');
  }
  rerenderList();
  refreshActive(m);
  updateDelBtn();
  renderEditor();
  renderInspector();
}

/* 新建条目：按模块类型插入默认占位条目，并自动选中 */
function addItem() {
  const m = state.module;
  let id = null;
  switch (m) {
    case 'chapters': {
      /* 选中卷 → 该卷下；选中章节 → 其所在卷；否则第一卷 */
      let v = state.volumeId ? volumeById(state.volumeId) : null;
      if (!v && state.chapterId) {
        const f = chapterById(state.chapterId);
        if (f) v = f.volume;
      }
      v = v || DATA.volumes[0];
      if (!v) return toast('请先创建卷');
      const ch = { id: 'c' + Date.now(), title: `第${cnNum(v.chapters.length + 1)}章`, words: 0, status: '草稿', edited: '—', related: [], body: [] };
      v.chapters.push(ch);
      id = ch.id;
      break;
    }
    case 'characters': {
      const c = { id: 'p' + Date.now(), name: `人物${cnNum(DATA.characters.length + 1)}`, role: '配角', age: 0, identity: '', tagline: '', desc: '', relations: [] };
      DATA.characters.push(c);
      DATA.relations.nodes.push({ id: c.id, x: 60 + (DATA.relations.nodes.length % 4) * 100, y: 60 + Math.floor(DATA.relations.nodes.length / 4) * 90 });
      id = c.id;
      break;
    }
    case 'world': {
      const w = { id: 'w' + Date.now(), type: '地理', title: `条目${cnNum(DATA.world.length + 1)}`, summary: '', body: '', related: '' };
      DATA.world.push(w);
      id = w.id;
      break;
    }
    case 'scenes': {
      const s = { id: 's' + Date.now(), title: `场景${cnNum(DATA.scenes.length + 1)}`, type: '过渡', place: '未指定', chapter: '第一章', chars: [], mood: '', words: 1000, desc: '' };
      DATA.scenes.push(s);
      id = s.id;
      break;
    }
    case 'plot': {
      const p = { id: 'pl' + Date.now(), name: `剧情线${cnNum(DATA.plotlines.length + 1)}`, type: '支线', progress: 0, chapters: '', note: '' };
      DATA.plotlines.push(p);
      id = p.id;
      break;
    }
    case 'timeline': {
      const n = DATA.timeline.length + 1;
      const year = n === 1 ? '未定年份' : `未定年份 ${n - 1}`;
      const t = { year, title: `事件${cnNum(n)}`, type: '主线', desc: '' };
      DATA.timeline.push(t);
      id = t.year;
      break;
    }
    case 'outline': {
      const sel = state.outlineId ? outlineNode(state.outlineId) : null;
      const title = `小节${cnNum(countOutlineNodes() + 1)}`;
      if (sel && sel.children) {
        /* 选中了卷 → 在卷下添加节点 */
        const o = { id: 'o' + Date.now(), type: '节', title, note: '' };
        sel.children.push(o);
        id = o.id;
      } else {
        /* 未选中或选中节点 → 根级新节点 */
        const o = { id: 'o' + Date.now(), type: '节', title, note: '' };
        DATA.outline.push(o);
        id = o.id;
      }
      break;
    }
    case 'settings':
      return addGroup('settings');
    case 'library':
      return addGroup('library');
    case 'notes': {
      const n = { id: 'n' + Date.now(), title: `笔记${cnNum(DATA.notes.length + 1)}`, tag: '灵感', date: '08-18', excerpt: '' };
      DATA.notes.push(n);
      id = n.id;
      break;
    }
    case 'materials':
      return addGroup('materials');
    default: return;
  }
  setSel(m, id);
  switchModule(m);   /* 重渲染列表（含计数与选中态） */
  renderEditor();
  renderInspector();
  toast('已新建条目');
}

function countOutlineNodes() {
  return DATA.outline.reduce((s, n) => s + 1 + (n.children ? n.children.length : 0), 0);
}

/* 删除选中条目（含联动的清理） */
function delItem() {
  const m = state.module;
  switch (m) {
    case 'chapters':
      if (state.chapterId) delChapterById(state.chapterId);
      else if (state.volumeId) delVolumeById(state.volumeId);
      break;
    case 'characters': {
      const id = state.characterId;
      DATA.characters = DATA.characters.filter(c => c.id !== id);
      DATA.relations.nodes = DATA.relations.nodes.filter(n => n.id !== id);
      DATA.relations.links = DATA.relations.links.filter(l => l.a !== id && l.b !== id);
      state.characterId = null;
      break;
    }
    case 'world':      DATA.world = DATA.world.filter(x => x.id !== state.worldId);        state.worldId = null; break;
    case 'scenes':     DATA.scenes = DATA.scenes.filter(x => x.id !== state.sceneId);      state.sceneId = null; break;
    case 'plot':       DATA.plotlines = DATA.plotlines.filter(x => x.id !== state.plotId); state.plotId = null; break;
    case 'timeline':   DATA.timeline = DATA.timeline.filter(x => x.year !== state.tlId);   state.tlId = null; break;
    case 'outline':
      delOutlineById(state.outlineId);
      break;
    case 'settings':
    case 'library': {
      const t = findTerm(state.termId);
      if (t) {
        if (m === 'settings') {
          for (const g of DATA.settingsGroups) g.items = g.items.filter(it => it !== t.item);
        } else {
          for (const g of DATA.library) g.items = g.items.filter(it => it !== t.item);
        }
      }
      state.termId = null;
      break;
    }
    case 'notes':      DATA.notes = DATA.notes.filter(x => x.id !== state.noteId);         state.noteId = null; break;
    case 'materials': {
      const mt = findMaterial(state.matId);
      if (mt) mt.group.items = mt.group.items.filter(it => it !== mt.item);
      state.matId = null;
      break;
    }
    default: return;
  }
  switchModule(m);
  renderEditor();
  renderInspector();
  toast('已删除条目');
}

function setSel(m, id) {
  const k = SEL_KEYS[m];
  if (k) state[k] = id;
}

/* 删除按钮：二次点击确认（3 秒内不重复点击自动复原） */
const delConfirm = { active: false, timer: null };
function resetDel() {
  delConfirm.active = false;
  const btn = $('#moduleDel');
  btn.classList.remove('danger', 'confirming');
  btn.title = '删除选中条目';
  clearTimeout(delConfirm.timer);
}
function bindDelBtn() {
  $('#moduleDel').onclick = () => {
    if (!hasSel(state.module)) return;
    if (!delConfirm.active) {
      delConfirm.active = true;
      const btn = $('#moduleDel');
      btn.classList.add('danger', 'confirming');
      btn.title = '再次点击确认删除';
      toast('再次点击确认删除该条目');
      delConfirm.timer = setTimeout(resetDel, 3000);
    } else {
      resetDel();
      delItem();
    }
  };
}

/* ================= 编辑区（内容页） ================= */

/* 通用字段块（key 为数据模型上的属性名，用于读取与写回） */
function field(label, value, ph, key) {
  return `
    <div class="field">
      <div class="field-label"><span>${label}</span></div>
      <div class="field-input" contenteditable="true" data-ph="${ph}"${key ? ` data-field="${key}"` : ''}>${value || ''}</div>
    </div>`;
}

/* 通用编辑页骨架 */
function editPage(cfg) {
  return `
    <div class="page-head">
      <h1 class="page-title" contenteditable="true" data-ph="未命名">${cfg.title}</h1>
      <div class="page-meta">
        ${cfg.badge ? `<span class="badge ${cfg.badge}${cfg.badgeEdit ? ' type-badge' : ''}${cfg.badgeFree ? ' type-badge' : ''}${cfg.badgeStatus ? ' status-badge' : ''}"${cfg.badgeEdit ? ' data-type-edit title="点击修改类型"' : ''}${cfg.badgeFree ? ' data-tag-edit title="点击自定义"' : ''}${cfg.badgeStatus ? ' data-status-edit title="点击修改状态"' : ''}>${cfg.badge}</span>` : ''}
        ${cfg.metaWords ? `<span class="pm-item pm-words">${cfg.metaWords}</span>` : ''}
        ${cfg.metaEdited ? `<span class="pm-item pm-edited">${cfg.metaEdited}</span>` : ''}
      </div>
    </div>
    <div class="page-fields">${cfg.fields}</div>
    ${cfg.extra || ''}`;
}

const relChips = rels => rels.map(r => {
  const c = charById(r.with);
  if (!c) return '';
  return `<span class="rel-chip" data-with="${r.with}" title="打开 ${c.name} 的人物页"><b>${r.label}</b>${c.name}</span>`;
}).join('');

const toolBtn = (icon, label, action) =>
  `<button class="tool-btn" data-action="${action}">${svg(icon)}<span>${label}</span></button>`;

/* ---------- 各模块内容页 ---------- */

/* 卷编辑页：卷名 / 状态 / 简介均可编辑，与侧边栏联动 */
function volumePage(v) {
  const words = v.chapters.reduce((s, c) => s + c.words, 0);
  return {
    crumb: `<b>章节</b> / ${v.title}`,
    html: editPage({
      title: v.title,
      badge: v.status,
      badgeStatus: true,
      meta: `${v.chapters.length} 章 · 共 ${fmt(words)} 字`,
      metaEdited: `最后编辑 ${v.edited || '—'}`,
      fields:
        field('卷简介', v.intro, '这一卷的整体构思、主题与基调……', 'intro') +
        field('章节规划', v.plan, '本卷各章节的推进安排……', 'plan'),
      extra: v.chapters.length
        ? `<div class="field"><div class="field-label"><span>本卷章节</span></div><div class="rels vol-chapters">${v.chapters.map(c => `<span class="rel-chip">${c.title}</span>`).join('')}</div></div>`
        : ''
    })
  };
}

function chapterPage(ch, v) {
  return {
    crumb: `<b>${v.title}</b> / ${ch.title}`,
    html: editPage({
      title: ch.title,
      badge: ch.status,
      metaWords: `当前 ${fmt(ch.words)} 字`,
      metaEdited: `最后编辑 ${ch.edited === '—' ? '—' : ch.edited}`,
      fields:
        field('章节正文', ch.body, '从第一个句子开始，写下这一章……', 'body') +
        field('章节备注', ch.note, '写作意图 · 伏笔 · 与前后章的衔接……', 'note'),
      extra: `
        <div class="field">
          <div class="field-label"><span>相关人物</span><span class="f-hint">可自行编辑 · 输入名字回车添加</span></div>
          <div class="rels" id="relChips">
            ${ch.related.map(n => `<span class="rel-chip" data-name="${n}">${n}<b class="x" title="移除">×</b></span>`).join('')}
          </div>
          <div class="rel-add"><input class="rel-input" placeholder="输入人物名，回车添加" maxlength="12" autocomplete="off"></div>
        </div>`
    })
  };
}

function characterPage(c) {
  return {
    crumb: `<b>人物</b> / ${c.name}`,
    html: editPage({
      title: c.name,
      badge: c.role,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${c.edited || '—'}`,
      fields:
        field('人物定位', c.tagline, '一句话描述这个人物的核心……', 'tagline') +
        field('人物档案', c.desc, '外貌 · 性格 · 动机 · 成长弧线……', 'desc') +
        field('身份', c.identity, '职业、立场或处境……', 'identity'),
      extra: `
        <div class="field">
          <div class="field-label"><span>人物关系</span><span class="f-hint">可自行编辑 · 输入名字回车添加</span></div>
          <div class="rels" id="relChips"></div>
          <div class="rel-add"><input class="rel-input" placeholder="输入人物名，回车添加" maxlength="12" autocomplete="off"></div>
        </div>`
    })
  };
}

function worldPage(w) {
  return {
    crumb: `<b>世界观</b> / ${w.title}`,
    html: editPage({
      title: w.title,
      badge: w.type,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${w.edited || '—'}`,
      fields:
        field('概述', w.summary, '用几句话概括这一设定……', 'summary') +
        field('细节与规则', w.body, '补充细节、规则与示例……', 'body')
    })
  };
}

function scenePage(s) {
  return {
    crumb: `<b>场景</b> / ${s.title}`,
    html: editPage({
      title: s.title,
      badge: s.type,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${s.edited || '—'}`,
      fields:
        field('场景描写', s.desc, '视觉 · 声音 · 气味 · 光线……', 'desc') +
        field('氛围与冲突', s.mood, '氛围基调 · 场景内的冲突与转折……', 'mood'),
      extra: `<div class="field"><div class="field-label"><span>出场人物</span></div><div class="rels">${relChips(s.chars.map(id => ({ with: id, label: '出场' })))}</div></div>`
    })
  };
}

function plotPage(p) {
  return {
    crumb: `<b>剧情</b> / ${p.name}`,
    html: editPage({
      title: p.name,
      badge: typeArr(p.type).join(' · '),
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${p.edited || '—'}`,
      fields:
        field('剧情概述', p.note, '这条剧情线的目标与当前进展……', 'note') +
        field('关键节点', p.chapters, '章节分布 · 转折点 · 伏笔回收时机……', 'chapters')
    })
  };
}

function timelinePage(t) {
  return {
    crumb: `<b>时间线</b> / ${t.title}`,
    html: editPage({
      title: t.title,
      badge: t.type,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${t.edited || '—'}`,
      fields:
        field('事件描述', t.desc, '记录事件发生的过程与细节……', 'desc') +
        field('影响与伏笔', t.impact, '这一事件对后续的影响与呼应……', 'impact')
    })
  };
}

function outlinePage(n) {
  return {
    crumb: `<b>大纲</b> / ${n.title}`,
    html: editPage({
      title: n.title,
      badge: n.type,
      badgeEdit: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${n.edited || '—'}`,
      fields:
        field('要点', n.note, '这一节点的写作要点……', 'note') +
        field('衔接说明', n.link, '与前后节点的衔接 · 节奏安排……', 'link')
    })
  };
}

function termPage(t, groupName, fromModule) {
  return {
    crumb: `<b>${fromModule === 'settings' ? '设定' : '资料库'}</b> / ${t.term}`,
    html: editPage({
      title: t.term,
      badge: t.tag,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${t.edited || '—'}`,
      fields:
        field('定义', t.def, '写下这条定义……', 'def') +
        field('补充说明', t.extra, '用法示例 · 关联条目 · 备注……', 'extra')
    })
  };
}

function notePage(n) {
  return {
    crumb: `<b>笔记</b> / ${n.title}`,
    html: editPage({
      title: n.title,
      badge: n.tag,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${n.edited || '—'}`,
      fields: field('笔记正文', n.excerpt, '写下你的想法……', 'excerpt')
    })
  };
}

function materialPage(m, g) {
  return {
    crumb: `<b>素材库</b> / ${m.name}`,
    html: editPage({
      title: m.name,
      badge: m.tag,
      badgeFree: true,
      metaWords: '当前 0 字',
      metaEdited: `最后编辑 ${m.edited || '—'}`,
      fields: field('素材说明', m.note, '这个素材的用途、联想与使用方式……', 'note')
    })
  };
}

function emptyPage() {
  return {
    crumb: `<b>${MODULES[state.module].title}</b> / 未选择`,
    html: `
      <div class="page-empty">
        <div class="orn">❦</div>
        <p class="p1">从左侧选择一个条目</p>
        <p class="p2">点击后将在本编辑区打开对应的内容页</p>
      </div>`
  };
}

/* 编辑区主渲染：左侧选中什么，右侧就打开对应的可编辑内容页 */
function renderEditor() {
  const m = state.module;
  let page;
  switch (m) {
    case 'chapters': {
      if (state.chapterId) {
        const found = chapterById(state.chapterId);
        page = found ? chapterPage(found.chapter, found.volume) : emptyPage();
      } else if (state.volumeId) {
        const v = volumeById(state.volumeId);
        page = v ? volumePage(v) : emptyPage();
      } else {
        page = emptyPage();
      }
      break;
    }
    case 'characters': page = state.characterId ? characterPage(charById(state.characterId)) : emptyPage(); break;
    case 'world':      page = state.worldId ? worldPage(worldById(state.worldId)) : emptyPage(); break;
    case 'scenes':     page = state.sceneId ? scenePage(sceneById(state.sceneId)) : emptyPage(); break;
    case 'plot':       page = state.plotId ? plotPage(plotById(state.plotId)) : emptyPage(); break;
    case 'timeline':   page = state.tlId ? timelinePage(tlById(state.tlId)) : emptyPage(); break;
    case 'outline':    page = state.outlineId ? outlinePage(outlineNode(state.outlineId)) : emptyPage(); break;
    case 'settings':
    case 'library': {
      const t = state.termId ? findTerm(state.termId) : null;
      page = t ? termPage(t.item, t.group, m) : emptyPage();
      break;
    }
    case 'notes':      page = state.noteId ? notePage(DATA.notes.find(x => x.id === state.noteId)) : emptyPage(); break;
    case 'materials': {
      const mt = state.matId ? findMaterial(state.matId) : null;
      page = mt ? materialPage(mt.item, mt.group) : emptyPage();
      break;
    }
    default: page = emptyPage();
  }
  $('#crumb').innerHTML = page.crumb;
  $('#pageWrap').innerHTML = page.html;
  $('#editorScroll').scrollTop = 0;
  selectImg(null);
  bindPage();
}

/* ================= 标题双向联动 ================= */

/* 编辑区页头修改 → 写回数据（允许清空，清空后侧栏显示「未命名」） */
function updateDataTitle(m, id, name) {
  switch (m) {
    case 'volume':    { const v = volumeById(id); if (v) v.title = name; break; }
    case 'chapters':  { const f = chapterById(id); if (f) f.chapter.title = name; break; }
    case 'outline':   { const n = outlineNode(id); if (n) n.title = name; break; }
    case 'characters': { const c = charById(id); if (c) c.name = name; break; }
    case 'world':     { const w = worldById(id); if (w) w.title = name; break; }
    case 'scenes':    { const s = sceneById(id); if (s) s.title = name; break; }
    case 'plot':      { const p = plotById(id); if (p) p.name = name; break; }
    case 'timeline':  { const t = tlById(id); if (t) t.title = name; break; }
    case 'notes':     { const n = DATA.notes.find(x => x.id === id); if (n) n.title = name; break; }
    case 'settings': case 'library': { const t = findTerm(id); if (t) t.item.term = name; break; }
    case 'materials': { const mt = findMaterial(id); if (mt) mt.item.name = name; break; }
  }
}

/* 从数据读取当前标题 */
function titleOf(m, id) {
  switch (m) {
    case 'volume':    { const v = volumeById(id); return v ? v.title : ''; }
    case 'chapters':  { const f = chapterById(id); return f ? f.chapter.title : ''; }
    case 'outline':   { const n = outlineNode(id); return n ? n.title : ''; }
    case 'characters': { const c = charById(id); return c ? c.name : ''; }
    case 'world':     { const w = worldById(id); return w ? w.title : ''; }
    case 'scenes':    { const s = sceneById(id); return s ? s.title : ''; }
    case 'plot':      { const p = plotById(id); return p ? p.name : ''; }
    case 'timeline':  { const t = tlById(id); return t ? t.title : ''; }
    case 'notes':     { const n = DATA.notes.find(x => x.id === id); return n ? n.title : ''; }
    case 'settings': case 'library': { const t = findTerm(id); return t ? t.item.term : ''; }
    case 'materials': { const mt = findMaterial(id); return mt ? mt.item.name : ''; }
  }
  return '';
}

/* 当前编辑页对应的数据对象（字段读写的落点） */
function editorObject(m, id) {
  switch (m) {
    case 'volume':    return volumeById(id);
    case 'chapters':  { const f = chapterById(id); return f ? f.chapter : null; }
    case 'outline':   return outlineNode(id);
    case 'characters': return charById(id);
    case 'world':     return worldById(id);
    case 'scenes':    return sceneById(id);
    case 'plot':      return plotById(id);
    case 'timeline':  return tlById(id);
    case 'notes':     return DATA.notes.find(x => x.id === id) || null;
    case 'settings': case 'library': { const t = findTerm(id); return t ? t.item : null; }
    case 'materials': { const mt = findMaterial(id); return mt ? mt.item : null; }
  }
  return null;
}

/* 编辑区各字段 → 数据模型。
   正文支持加粗 / 图片 / 网格线等富文本，故按 innerHTML 存取。
   每次键入都同步，切换条目时 renderEditor 重建 DOM 也不会丢内容。 */
function syncFields() {
  const t = editorTarget();
  if (!t) return false;
  const obj = editorObject(t.key, t.id);
  if (!obj) return false;
  let changed = false;
  $$('#pageWrap .field-input[data-field]').forEach(el => {
    const key = el.dataset.field;
    const html = el.innerHTML;
    if (obj[key] !== html) { obj[key] = html; changed = true; }
  });
  if (changed) obj.edited = nowString();
  return changed;
}

/* 当前编辑页对应的数据键（章节模块可能是卷或章节） */
function editorTarget() {
  const m = state.module;
  if (m === 'chapters') {
    if (state.chapterId) return { key: 'chapters', id: state.chapterId };
    if (state.volumeId) return { key: 'volume', id: state.volumeId };
    return null;
  }
  const k = SEL_KEYS[m];
  return k && state[k] ? { key: m, id: state[k] } : null;
}

/* 数据变更 → 同步侧边栏列表行文本 */
function updateSidebarTitle(m, id) {
  if (!m || !id) return;
  const map = {
    chapters: ['.chapter-row', '.t'],
    volume:   ['.group-head', '.vol-name'],
    outline:  ['.tree-row', '.t'],
    characters: ['.char-row', '.n'],
    world:    ['.world-row', '.t'],
    scenes:   ['.scene-row', '.t'],
    plot:     ['.plot-item', '.p-name'],
    timeline: ['.tl-item', '.tl-name'],
    notes:    ['.note-card', '.n-title'],
    settings: ['.term-row', '.term'],
    library:  ['.term-row', '.term'],
    materials: ['.mat-row', '.m-name']
  };
  const [rowSel, nameSel] = map[m] || [];
  if (!rowSel) return;
  const name = titleOf(m, id);
  $$(rowSel, BODY_EL).forEach(r => {
    if (r.dataset.id === id) {
      const el = r.querySelector(nameSel);
      if (el) {
        el.textContent = name || '未命名';
        el.classList.toggle('untitled', !name);
      }
    }
  });
}

/* 章节字数变动 → 轻量联动侧栏章节行 / 卷头合计 / 页头 / 状态栏（不重渲染，避免闪烁与丢焦点） */
function refreshChapterCounts(f) {
  $$('.chapter-row', BODY_EL).forEach(r => {
    if (r.dataset.id === f.chapter.id) {
      const wEl = r.querySelector('.words');
      if (wEl) wEl.textContent = f.chapter.words ? fmt(f.chapter.words) + ' 字' : '—';
    }
  });
  $$('.group-head', BODY_EL).forEach(h => {
    const v = volumeById(h.dataset.vol);
    if (!v) return;
    const words = v.chapters.reduce((s, c) => s + c.words, 0);
    const meta = h.querySelector('.g-meta');
    if (meta) meta.textContent = `${v.chapters.length} 章 · 共 ${fmt(words)} 字`;
  });
  const pmWords = $('#pageWrap .pm-words');
  if (pmWords) pmWords.textContent = `当前 ${fmt(f.chapter.words)} 字`;
  const pmEdited = $('#pageWrap .pm-edited');
  if (pmEdited) pmEdited.textContent = `最后编辑 ${f.chapter.edited || '—'}`;
  updateStats();
}

/* 编辑页内容字段总字数（只统计各 field-input，排除徽章 / chips / 输入框等） */
const countPageWords = wrap => $$('.field-input', wrap).reduce((s, f) => s + f.textContent.replace(/\s+/g, '').length, 0);

/* 内容页事件：字数统计、标题联动、类型徽章、关系图节点、人物 chips */
const pageTimer = { t: null };
function bindPage() {
  const wrap = $('#pageWrap');

  /* 非章节页：页头字数统计初始化（按各内容字段实际字数） */
  if (state.module !== 'chapters') {
    const pmWords0 = wrap.querySelector('.pm-words');
    if (pmWords0) pmWords0.textContent = `当前 ${fmt(countPageWords(wrap))} 字`;
  }

  wrap.oninput = () => {   /* 属性赋值，避免重复绑定 */
    /* 每次键入即写回数据模型，切换条目重建 DOM 时不会丢内容 */
    syncFields();
    /* 立即写回章节正文实际字数与最后编辑时间（不依赖防抖，切换章节也不丢统计） */
    if (state.module === 'chapters' && state.chapterId) {
      const f = chapterById(state.chapterId);
      const bodyField = wrap.querySelector('.page-fields .field-input');
      if (bodyField && f) {
        f.chapter.words = bodyField.textContent.replace(/\s+/g, '').length;
        f.chapter.edited = nowString();
        refreshChapterCounts(f);
      }
    } else {
      /* 其余页面：页头字数统计 + 最后编辑时间（与电脑系统时间吻合） */
      const pmWords = wrap.querySelector('.pm-words');
      if (pmWords) pmWords.textContent = `当前 ${fmt(countPageWords(wrap))} 字`;
      const pmEdited = wrap.querySelector('.pm-edited');
      if (pmEdited) pmEdited.textContent = `最后编辑 ${nowString()}`;
    }
    /* 防抖：编辑区字数 + 信息面板刷新 */
    clearTimeout(pageTimer.t);
    pageTimer.t = setTimeout(() => {
      const txt = wrap.textContent.replace(/\s+/g, '');
      $('#editorWords').textContent = txt.length ? fmt(txt.length) + ' 字' : '0 字';
      renderInspector();
    }, 300);
    markDirty();
  };

  /* 页头标题：编辑即写回数据，并同步侧边栏对应行 */
  const titleEl = wrap.querySelector('.page-title');
  if (titleEl && titleEl.getAttribute('contenteditable') !== null) {
    titleEl.oninput = () => {
      const sync = editorTarget();
      if (!sync) return;
      updateDataTitle(sync.key, sync.id, titleEl.textContent.trim());
      updateSidebarTitle(sync.key, sync.id);
      markDirty();
    };
  }

  /* 状态徽章（卷编辑页）：点击展开状态选择，改后同步侧栏标签 */
  const stBadge = wrap.querySelector('.badge[data-status-edit]');
  if (stBadge) {
    stBadge.onclick = () => {
      const v = volumeById(state.volumeId);
      if (!v) return;
      toggleStatusMenu(stBadge, v.status, s => {
        v.status = s;
        stBadge.textContent = s;
        stBadge.className = 'badge status-badge ' + s;
        rerenderList();
        renderInspector();
      }, wrap);
    };
  }

  /* 相关人物 / 人物关系：× 移除 / 回车添加（纯手动编辑，无关联跳转） */
  const relInput = wrap.querySelector('.rel-input');
  if (relInput) {
    const chips = wrap.querySelector('#relChips');
    let arr = null;
    if (state.module === 'chapters' && state.chapterId) {
      const f = chapterById(state.chapterId);
      if (f) arr = f.chapter.related;              /* 字符串数组 */
    } else if (state.module === 'characters' && state.characterId) {
      const c = charById(state.characterId);
      if (c) arr = c.relations;                    /* {with, label} 数组 */
    }
    if (chips && arr) {
      const nameOf = r => {
        if (typeof r === 'string') return r;
        return r.with ? ((charById(r.with) || {}).name || r.label) : r.label;
      };
      const renderChips = () => {
        chips.innerHTML = arr.map(r => {
          const nm = nameOf(r);
          return `<span class="rel-chip" data-name="${nm}">${nm}<b class="x" title="移除">×</b></span>`;
        }).join('');
        $$('.rel-chip .x', chips).forEach(x => {
          x.onclick = () => {
            const nm = x.parentElement.dataset.name;
            for (let i = arr.length - 1; i >= 0; i--) {
              if (nameOf(arr[i]) === nm) arr.splice(i, 1);
            }
            renderChips();
          };
        });
      };
      renderChips();
      relInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const name = relInput.value.trim();
          if (!name || arr.some(r => nameOf(r) === name)) return;
          if (typeof arr[0] === 'string') {
            arr.push(name);
          } else {
            const hit = DATA.characters.find(c => c.name === name);
            arr.push(hit ? { with: hit.id, label: '关系' } : { with: '', label: name });
          }
          relInput.value = '';
          renderChips();
        }
      };
    }
  }

  /* 类型徽章（大纲编辑页）：点击展开类型菜单，改后同步侧栏 */
  const typeBadge = wrap.querySelector('.badge[data-type-edit]');
  if (typeBadge) {
    typeBadge.onclick = () => {
      const existing = wrap.querySelector('.type-menu');
      if (existing) { existing.remove(); return; }
      const n = outlineNode(state.outlineId);
      if (!n) return;
      const menu = document.createElement('span');
      menu.className = 'type-menu';
      menu.innerHTML = OUTLINE_TYPES.map(t =>
        `<span class="tm-item${t === n.type ? ' sel' : ''}" data-t="${t}">${t}</span>`).join('');
      typeBadge.after(menu);
      menu.querySelectorAll('.tm-item').forEach(it => {
        it.onclick = e => {
          e.stopPropagation();
          n.type = it.dataset.t;
          menu.remove();
          typeBadge.textContent = n.type;
          typeBadge.className = 'badge type-badge ' + n.type;
          rerenderList();
          refreshActive('outline');
          renderInspector();
        };
      });
    };
  }

  /* 自由输入徽章（场景 / 资料库 / 世界观 / 设定 / 人物 / 剧情 / 时间线 / 素材库编辑页）：
     点击 → 内联输入自定义（剧情为多选类型面板），同步侧栏标签与信息面板 */
  const tagBadge = wrap.querySelector('.badge[data-tag-edit]');
  if (tagBadge) {
    const sync = editorTarget();
    if (sync) {
      tagBadge.onclick = () => {
        if (sync.key === 'plot') {
          const p = plotById(sync.id);
          if (!p) return;
          plotTagMenu(tagBadge, p.type, arr => {
            if (!arr.length) return toast('请至少选择一个类型');
            setTag('plot', sync.id, arr);
            tagBadge.textContent = arr.join(' · ');
            tagBadge.className = 'badge type-badge';
            rerenderList();
            refreshActive('plot');
            renderInspector();
          });
        } else {
          tagInput(tagBadge, tagBadge.textContent, v => {
            setTag(sync.key, sync.id, v);
            tagBadge.className = 'badge type-badge ' + v;
            rerenderList();
            refreshActive(sync.key);
            renderInspector();
          });
        }
      };
    }
  }

  $$('.rel-chip[data-with]', wrap).forEach(ch => {
    ch.onclick = () => {
      selectCharacter(ch.dataset.with);
      if (state.module !== 'characters') switchModule('characters');
    };
  });

  /* 粘贴截图：剪贴板中的图片直接插入正文光标处 */
  wrap.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.indexOf('image/') === 0) {
        e.preventDefault();
        const f = it.getAsFile();
        if (f) {
          const sel = window.getSelection();
          if (sel.rangeCount > 0) savedSel = sel.getRangeAt(0).cloneRange();
          readFileAsDataURL(f, insertImage);
        }
        return;
      }
    }
  });

  /* 点击正文图片 → 选中并显示工具条；点击其他处 → 取消 */
  wrap.addEventListener('click', e => {
    const img = e.target && e.target.classList && e.target.classList.contains('in-img') ? e.target : null;
    selectImg(img);
  });
}

/* ================= 选中动作 ================= */

function selectChapter(id) {
  state.chapterId = id;
  refreshActive('chapters');
  updateDelBtn();
  renderEditor();
  renderInspector();
}

function selectCharacter(id) {
  state.characterId = id;
  refreshActive('characters');
  updateDelBtn();
  renderEditor();
  renderInspector();
}

/* ================= 信息面板 ================= */

function renderInspector() {
  const ins = $('#inspector');
  const m = state.module;
  let html = '';

  /* ---- 章节卡 / 卷卡 ---- */
  if (m === 'chapters') {
    const found = state.chapterId ? chapterById(state.chapterId) : null;
    if (found) {
      const { chapter, volume } = found;
      const pct = Math.min(100, Math.round(chapter.words / 8000 * 100));
      html = `
        <div class="ins-section">
          <div class="ins-label">当前章节</div>
          <div class="char-head">
            <span class="avatar" style="border-radius:10px">章</span>
            <div style="min-width:0">
              <div class="ch-name">${chapter.title}</div>
              <div class="ch-role">${volume.title} · <span class="badge ${chapter.status}">${chapter.status}</span></div>
            </div>
          </div>
        </div>
        <div class="ins-section">
          <div class="ins-label">写作进度</div>
          <div class="progress ${pct >= 100 ? 'fine' : ''}"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="stat-row"><span>当前字数</span><span class="v">${fmt(chapter.words)} 字</span></div>
        <div class="stat-row"><span>章节目标</span><span class="v">8,000 字</span></div>
        <div class="stat-row"><span>最后编辑</span><span class="v">${chapter.edited}</span></div>
        </div>
        <div class="ins-section">
          <div class="ins-label">相关人物</div>
          <div class="rels">${chapter.related.map(n => `<span class="rel-chip">${n}</span>`).join('')}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">写作工具</div>
          <div class="tools">
            ${toolBtn(I.pen, '润色当前章节', 'polish')}
            ${toolBtn(I.loop, '伏笔检查', 'foreshadow')}
            ${toolBtn(I.spark, '生成续写建议', 'continue')}
          </div>
        </div>`;
    } else if (state.volumeId) {
      const v = volumeById(state.volumeId);
      if (v) {
        const words = v.chapters.reduce((s, c) => s + c.words, 0);
        html = `
          <div class="ins-section">
            <div class="ins-label">当前卷</div>
            <div class="char-head">
              <span class="avatar" style="border-radius:10px">卷</span>
              <div style="min-width:0">
                <div class="ch-name">${v.title}</div>
                <div class="ch-role"><span class="badge ${v.status}">${v.status}</span></div>
              </div>
            </div>
          </div>
          <div class="ins-section">
            <div class="ins-label">卷概览</div>
            <div class="stat-row"><span>章节数</span><span class="v">${v.chapters.length} 章</span></div>
            <div class="stat-row"><span>卷总字数</span><span class="v">${fmt(words)} 字</span></div>
          </div>
          <div class="ins-section">
            <div class="ins-label">写作工具</div>
            <div class="tools">
              ${toolBtn(I.pen, '整卷润色建议', 'polish')}
              ${toolBtn(I.spark, '卷结构建议', 'continue')}
            </div>
          </div>`;
      }
    }
  }

  /* ---- 人物卡 ---- */
  if (m === 'characters' && state.characterId) {
    const c = charById(state.characterId);
    if (c) {
      html = `
        <div class="ins-section">
          <div class="char-head">
            <span class="avatar">${c.name[0]}</span>
            <div style="min-width:0">
              <div class="ch-name">${c.name}</div>
              <div class="ch-role">${c.role} · ${c.identity || '身份未设定'}</div>
              ${c.tagline ? `<div class="tagline">「${c.tagline}」</div>` : ''}
            </div>
          </div>
        </div>
        <div class="ins-section">
          <div class="ins-label">档案</div>
          <div class="meta-grid">
            <div class="meta-cell"><div class="k">年龄</div><div class="v">${c.age || '—'}</div></div>
            <div class="meta-cell"><div class="k">身份</div><div class="v">${c.identity || '—'}</div></div>
          </div>
          <div class="desc-text" style="margin-top:10px">${c.desc || '暂未填写。点击右侧编辑区的人物档案开始记录。'}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">人物关系</div>
          <div class="rels">${relChips(c.relations)}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">写作工具</div>
          <div class="tools">
            ${toolBtn(I.pen, '润色人物对话', 'polish')}
            ${toolBtn(I.chat, '生成人物对白', 'dialog')}
          </div>
        </div>`;
    }
  }

  /* ---- 场景卡 ---- */
  if (m === 'scenes' && state.sceneId) {
    const s = sceneById(state.sceneId);
    if (s) {
      html = `
        <div class="ins-section">
          <div class="ins-label">场景</div>
          <div class="ch-name" style="font-size:15px">${s.title}</div>
          <div class="ch-role" style="margin-top:3px">${s.place} · ${s.chapter}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">细节</div>
          <div class="meta-grid">
            <div class="meta-cell"><div class="k">氛围</div><div class="v">${s.mood || '—'}</div></div>
            <div class="meta-cell"><div class="k">预计字数</div><div class="v">${fmt(s.words)} 字</div></div>
          </div>
          <div class="desc-text" style="margin-top:10px">${s.desc || '暂未填写。'}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">出场人物</div>
          <div class="rels">${relChips(s.chars.map(id => ({ with: id, label: '出场' })))}</div>
        </div>`;
    }
  }

  /* ---- 世界观卡 ---- */
  if (m === 'world' && state.worldId) {
    const w = worldById(state.worldId);
    if (w) {
      html = `
        <div class="ins-section">
          <div class="ins-label">世界观条目</div>
          <div class="ch-name" style="font-size:15px">${w.title} <span class="tag ghost" style="vertical-align:2px">${w.type}</span></div>
        </div>
        <div class="ins-section">
          <div class="desc-text" style="line-height:2">${w.body || '暂未填写。在右侧编辑区写下这一设定。'}</div>
        </div>`;
    }
  }

  /* ---- 剧情线卡 ---- */
  if (m === 'plot' && state.plotId) {
    const p = plotById(state.plotId);
    if (p) {
      const types = typeArr(p.type);
      const cls = types.includes('主线') ? 'main' : types.includes('暗线') ? 'dark' : '';
      html = `
        <div class="ins-section">
          <div class="ins-label">剧情线</div>
          <div class="ch-name" style="font-size:15px">${p.name} <span class="tag ${cls}" style="vertical-align:2px">${types.join(' · ')}</span></div>
        </div>
        <div class="ins-section">
          <div class="ins-label">推进度</div>
          <div class="progress ${p.progress >= 100 ? 'fine' : ''}"><div class="progress-fill" style="width:${p.progress}%"></div></div>
          <div class="stat-row"><span>当前推进</span><span class="v">${p.progress}%</span></div>
        </div>
        <div class="ins-section">
          <div class="ins-label">写作备注</div>
          <div class="desc-text">${p.note || '暂未填写。'}</div>
        </div>`;
    }
  }

  /* ---- 时间线事件卡 ---- */
  if (m === 'timeline' && state.tlId) {
    const t = tlById(state.tlId);
    if (t) {
      html = `
        <div class="ins-section">
          <div class="ins-label">时间线事件</div>
          <div class="ch-name" style="font-size:15px">${t.title} <span class="tag ghost" style="vertical-align:2px">${t.type}</span></div>
          <div class="ch-role" style="margin-top:3px">${t.year}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">事件记录</div>
          <div class="desc-text" style="line-height:2">${t.desc || '暂未填写。在右侧编辑区记录事件。'}</div>
        </div>`;
    }
  }

  /* ---- 设定 / 资料库条目卡 ---- */
  if ((m === 'settings' || m === 'library') && state.termId) {
    const t = findTerm(state.termId);
    if (t) {
      html = `
        <div class="ins-section">
          <div class="ins-label">${m === 'settings' ? '设定条目' : '资料条目'}</div>
          <div class="ch-name" style="font-size:15px">${t.item.term} <span class="tag ghost" style="vertical-align:2px">${t.group}</span></div>
        </div>
        <div class="ins-section">
          <div class="desc-text" style="line-height:2">${t.item.def || '暂未填写。'}</div>
        </div>`;
    }
  }

  /* ---- 大纲节点卡 ---- */
  if (m === 'outline' && state.outlineId) {
    const n = outlineNode(state.outlineId);
    if (n) {
      html = `
        <div class="ins-section">
          <div class="ins-label">大纲节点</div>
          <div class="ch-name" style="font-size:15px">${n.title} <span class="tag ghost" style="vertical-align:2px">${n.type}</span></div>
        </div>
        <div class="ins-section">
          <div class="ins-label">要点</div>
          <div class="desc-text" style="line-height:2">${n.note || '暂未填写。在右侧编辑区写下要点。'}</div>
        </div>`;
    }
  }

  /* ---- 笔记卡 ---- */
  if (m === 'notes' && state.noteId) {
    const n = DATA.notes.find(x => x.id === state.noteId);
    if (n) {
      html = `
        <div class="ins-section">
          <div class="ins-label">写作笔记</div>
          <div class="ch-name" style="font-size:15px">${n.title}</div>
          <div class="ch-role" style="margin-top:3px">${n.tag} · ${n.date}</div>
        </div>
        <div class="ins-section">
          <div class="desc-text" style="line-height:2">${n.excerpt || '暂未填写。在右侧编辑区写下笔记。'}</div>
        </div>`;
    }
  }

  /* ---- 素材卡 ---- */
  if (m === 'materials' && state.matId) {
    const mt = findMaterial(state.matId);
    if (mt) {
      html = `
        <div class="ins-section">
          <div class="ins-label">素材</div>
          <div class="ch-name" style="font-size:15px">${mt.item.name}</div>
          <div class="ch-role" style="margin-top:3px">${mt.group.group} · ${mt.item.meta}</div>
        </div>
        <div class="ins-section">
          <div class="ins-label">采集时间</div>
          <div class="stat-row"><span>素材日期</span><span class="v">${mt.item.time}</span></div>
        </div>`;
    }
  }

  /* ---- 默认：工作台概况 ---- */
  if (!html) {
    const done = 1240;
    const pct = Math.round(done / DATA.project.dailyGoal * 100);
    html = `
      <div class="ins-section">
        <div class="ins-label">今日目标</div>
        <div class="overview-num">${fmt(done)}<small>/ ${fmt(DATA.project.dailyGoal)} 字</small></div>
        <div class="progress ${pct >= 100 ? 'fine' : ''}" style="margin-top:8px"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="stat-row"><span>今日达成</span><span class="v">${pct}%</span></div>
        <div class="stat-row"><span>连续写作</span><span class="v">17 天</span></div>
      </div>
      <div class="ins-section">
        <div class="ins-label">最近编辑</div>
        <div class="stat-row"><span>${DATA.volumes[0] && DATA.volumes[0].chapters.length ? '第一章' : '—'}</span></div>
      </div>
      <div class="ins-section">
        <div class="ins-label">快捷工具</div>
        <div class="tools">
          ${toolBtn(I.pen, '润色选中文字', 'polish')}
          ${toolBtn(I.spark, '续写建议', 'continue')}
          ${toolBtn(I.loop, '伏笔检查', 'foreshadow')}
        </div>
      </div>`;
  }

  ins.innerHTML = html;

  /* 关系 chips 与工具按钮事件 */
  $$('.rel-chip', ins).forEach(ch => {
    ch.onclick = () => {
      selectCharacter(ch.dataset.with);
      if (state.module !== 'characters') switchModule('characters');
    };
  });
  $$('.tool-btn', ins).forEach(btn => {
    btn.onclick = () => {
      const actions = {
        polish: '已生成润色建议 · 原型演示',
        foreshadow: '伏笔检查完成 · 原型演示',
        continue: '已生成 3 条续写方向 · 原型演示',
        dialog: '已生成人物对白 · 原型演示'
      };
      toast(actions[btn.dataset.action] || '原型演示');
    };
  });
}

/* ================= 书库 ================= */

const bookWords = b => b.volumes.reduce((s, v) => s + v.chapters.reduce((x, c) => x + c.words, 0), 0);

function createBook(name, genre) {
  return {
    id: 'b' + Date.now(),
    updated: nowString(),
    project: { name, genre, targetWords: 400000, lastSaved: '刚刚', dailyGoal: 2000 },
    volumes: [{ id: 'v1', title: '卷一', status: '写作中', chapters: [] }],
    characters: [],
    world: [],
    settingsGroups: [
      { name: '核心规则', items: [] },
      { name: '历史大事', items: [] }
    ],
    plotlines: [],
    timeline: [],
    outline: [],
    scenes: [],
    library: [
      { group: '地名考据', items: [] },
      { group: '机构沿革', items: [] },
      { group: '物件档案', items: [] },
      { group: '行业术语', items: [] }
    ],
    notes: [],
    materials: [
      { group: '意象图片', type: 'image', items: [] },
      { group: '文字摘录', type: 'text', items: [] },
      { group: '声音采集', type: 'audio', items: [] }
    ],
    relations: { nodes: [], links: [] }
  };
}

function renderLibraryView() {
  const grid = $('#libGrid');
  if (!BOOKS.length) {
    grid.innerHTML = `
      <div class="lib-empty">
        <div class="orn">❦</div>
        <p class="p1">书库还是空的</p>
        <p class="p2">点击右上角「新建作品」开始你的第一本书</p>
      </div>`;
    return;
  }
  grid.innerHTML = BOOKS.map(b => {
    const w = bookWords(b);
    return `
      <div class="book-card" data-id="${b.id}">
        <div class="book-name" title="双击修改书名">《${b.project.name}》</div>
        <div class="book-meta">
          <span class="tag ghost lib-type" title="点击修改类型">${b.project.genre}</span>
          <span>更新于 ${b.updated}</span>
        </div>
        <div class="book-words">总字数 ${fmt(w)} 字</div>
        <div class="book-actions">
          <button class="btn primary" data-act="edit">编辑</button>
          <button class="btn danger" data-act="del">删除</button>
        </div>
      </div>`;
  }).join('');

  /* 卡片事件 */
  $$('.book-card', grid).forEach(card => {
    const b = BOOKS.find(x => x.id === card.dataset.id);
    if (!b) return;
    $$('button', card).forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (btn.dataset.act === 'edit') openBook(card.dataset.id);
        else confirmDelBook(card, btn, card.dataset.id);
      };
    });
    /* 双击书名 → 修改作品名称（同步工作台标题栏） */
    const nameEl = card.querySelector('.book-name');
    nameEl.ondblclick = e => {
      e.stopPropagation();
      inlineEdit(nameEl, name => {
        b.project.name = name;
        renderLibraryView();
        if (DATA === b) $('#projectName').textContent = name;
        markDirty();
      });
    };
    /* 点击类型标签 → 修改作品类型 */
    const typeEl = card.querySelector('.lib-type');
    typeEl.onclick = e => {
      e.stopPropagation();
      inlineEdit(typeEl, genre => {
        b.project.genre = genre;
        renderLibraryView();
        markDirty();
      });
    };
  });
}

/* 就地编辑（书库书名 / 类型 / 工作台标题栏等） */
function inlineEdit(el, onCommit) {
  const old = el.textContent.replace(/[《》]/g, '');
  const input = document.createElement('input');
  input.className = 'tree-name-input';
  input.style.fontSize = 'inherit';
  input.value = old;
  /* 提交后还原原元素（保留 id / class），回调不再依赖原元素存在 */
  const restore = val => {
    const fresh = document.createElement(el.tagName);
    if (el.id) fresh.id = el.id;
    if (el.className) fresh.className = el.className;
    fresh.textContent = val;
    input.replaceWith(fresh);
    return fresh;
  };
  el.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const val = input.value.trim() || old;
    restore(val);
    onCommit(val);
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { done = true; restore(old); }
  });
  input.addEventListener('blur', commit);
  input.addEventListener('mousedown', e => e.stopPropagation());
}

/* 删除书：二次确认 */
function confirmDelBook(card, btn, id) {
  if (!btn.classList.contains('confirming')) {
    btn.classList.add('confirming');
    btn.textContent = '确认删除？';
    toast('再次点击确认删除该书');
    setTimeout(() => {
      btn.classList.remove('confirming');
      btn.textContent = '删除';
    }, 3000);
    return;
  }
  const idx = BOOKS.findIndex(b => b.id === id);
  if (idx > -1) BOOKS.splice(idx, 1);
  if (DATA && DATA.id === id) DATA = BOOKS[0] || null;
  renderLibraryView();
  markDirty(0);
  toast('已从书库删除');
}

/* 进入某本书的工作台（更新日期与电脑日期关联） */
function openBook(id) {
  const b = BOOKS.find(x => x.id === id);
  if (!b) return;
  b.updated = nowString();
  DATA = b;
  document.body.classList.remove('view-home');
  initWorkbench();
  markDirty();
}

/* 新建作品 */
function showNewBookForm(show) {
  $('#libForm').style.display = show ? 'flex' : 'none';
  if (show) $('#newBookName').focus();
}

function confirmNewBook() {
  const name = $('#newBookName').value.trim();
  if (!name) return toast('请输入书名');
  const genre = $('#newBookGenre').value;
  BOOKS.push(createBook(name, genre));
  $('#newBookName').value = '';
  showNewBookForm(false);
  renderLibraryView();
  markDirty(0);
  toast(`已创建《${name}》`);
}

/* 进入工作台：重置状态并全量渲染当前书 */
function initWorkbench() {
  for (const k of Object.keys(SEL_KEYS)) state[SEL_KEYS[k]] = null;
  state.volumeId = null;
  state.module = 'chapters';
  resetDel();
  $('#projectName').textContent = DATA.project.name;
  updateStats();
  switchModule('chapters');
  const first = DATA.volumes[0] && DATA.volumes[0].chapters[0];
  if (first) selectChapter(first.id);
  else renderEditor();
}

/* 双击标题栏书名 → 修改作品名称（同步书库卡片） */
function bindTitleRename() {
  $('#projectName').ondblclick = () => {
    inlineEdit($('#projectName'), name => {
      DATA.project.name = name;
      $('#projectName').textContent = name;
      renderLibraryView();
    });
  };
}

/* ================= 备份：导出 / 导入 JSON ================= */

function exportBackup() {
  syncFields();
  let json;
  try {
    json = JSON.stringify({
      app: '墨庐 · 小说创作工作台',
      format: ML_STORE.FORMAT,
      savedAt: new Date().toISOString(),
      books: BOOKS,
    }, null, 2);
  } catch (e) {
    return toast('导出失败：数据无法序列化');
  }
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const name = `墨庐备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`已导出 ${name}`);
  } catch (e) {
    toast('导出失败：' + e.message);
  }
}

function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let raw;
    try { raw = JSON.parse(String(rd.result)); }
    catch (e) { return toast('导入失败：文件不是合法 JSON'); }
    const books = sanitizeBooks(Array.isArray(raw) ? raw : raw && raw.books);
    if (!books) return toast('导入失败：文件中没有可识别的作品数据');
    adoptBooks(books);
    renderLibraryView();
    document.body.classList.add('view-home');
    markDirty(0);
    toast(`已导入 ${books.length} 部作品`);
  };
  rd.onerror = () => toast('导入失败：无法读取文件');
  rd.readAsText(file);
}

/* 导入会覆盖整个书库，沿用应用内既有的二次确认交互 */
const importArm = { on: false, timer: null };
function armImport(btn) {
  const reset = () => {
    importArm.on = false;
    btn.classList.remove('confirming');
    btn.textContent = '导入备份';
  };
  if (!importArm.on) {
    importArm.on = true;
    btn.classList.add('confirming');
    btn.textContent = '确认覆盖？';
    toast('导入会覆盖当前书库，再次点击确认');
    clearTimeout(importArm.timer);
    importArm.timer = setTimeout(reset, 3000);
    return;
  }
  clearTimeout(importArm.timer);
  reset();
  $('#backupFileInput').click();
}

/* ================= 统计 ================= */
function totalWords() {
  return DATA.volumes.reduce((s, v) => s + v.chapters.reduce((x, c) => x + c.words, 0), 0);
}

function updateStats() {
  $('#totalWordsText').textContent = fmt(totalWords()) + ' 字';
}

/* ================= 主题 / 侧边栏 / 专注 / 保存 ================= */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  store.set('ml-theme', state.theme);
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme();
}

/* ================= 正文图片：插入 / 调整大小 / 旋转 ================= */

let currentImg = null;   /* 当前选中的正文图片 */

function readFileAsDataURL(file, cb) {
  const rd = new FileReader();
  rd.onload = () => cb(rd.result);
  rd.readAsDataURL(file);
}

/* 在光标处插入图片（直接 DOM 插入，真实浏览器与 jsdom 均可） */
function insertImage(url) {
  const wrap = $('#pageWrap');
  const field = wrap.querySelector('.field-input');
  if (!field) return toast('请先在正文中放置光标');
  let range = null;
  if (savedSel && wrap.contains(savedSel.commonAncestorContainer)) {
    range = savedSel;
    savedSel = null;
  } else {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) range = sel.getRangeAt(0);
  }
  if (!range || !field.contains(range.commonAncestorContainer)) {
    field.focus();
    range = null;
  }
  const img = document.createElement('img');
  img.className = 'in-img';
  img.src = url;
  if (range) {
    range.deleteContents();
    range.insertNode(img);
  } else {
    field.appendChild(img);
  }
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStartAfter(img);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  toast('图片已插入 · 点击图片可调整大小与方向');
}

/* 选中 / 取消选中正文图片（显示 / 隐藏图片工具条） */
function selectImg(img) {
  currentImg = img || null;
  const tools = $('#imgTools');
  if (!tools) return;
  $$('.in-img.img-sel', $('#pageWrap')).forEach(i => i.classList.remove('img-sel'));
  if (img) {
    img.classList.add('img-sel');
    tools.style.display = 'flex';
    updateImgTools();
  } else {
    tools.style.display = 'none';
  }
}

/* 刷新图片工具条信息（当前宽度与旋转角度） */
function updateImgTools() {
  const t = $('#imgSizeText');
  if (!t) return;
  const w = Math.round(parseFloat(currentImg.style.width) || currentImg.getBoundingClientRect().width || 420);
  const rot = parseInt(currentImg.dataset.rot || '0', 10);
  t.textContent = `${w}px${rot ? ' · 旋转 ' + rot + '°' : ''}`;
}

/* ================= 格式工具栏 ================= */

/* 电脑当前时间（最后编辑用），格式：MM-DD HH:mm */
function nowString() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const FONT_OPTIONS = [
  { v: 'f-song',     t: '宋体' },
  { v: 'f-fangsong', t: '仿宋' },
  { v: 'f-msyh',     t: '微软雅黑' }
];
const SIZE_OPTIONS = [12, 14, 16, 18, 20].map(s => ({ v: 's-' + s, t: s + ' 号' }));
const LH_OPTIONS = [
  { v: 'lh-15', t: '1.5' },
  { v: 'lh-18', t: '1.8' },
  { v: 'lh-2',  t: '2.0' },
  { v: 'lh-25', t: '2.5' }
];

/* 浮动选择菜单（字体 / 字号 / 行距） */
function fmtPop(anchor, options, current, onPick) {
  const existing = anchor.closest('.fmt-wrap').querySelector('.fmt-pop');
  if (existing) { existing.remove(); return; }
  $$('.fmt-pop').forEach(p => p.remove());
  const pop = document.createElement('span');
  pop.className = 'fmt-pop';
  pop.innerHTML = options.map(o =>
    `<span class="tm-item${o.v === current ? ' sel' : ''}" data-v="${o.v}" data-t="${o.t}">${o.t}</span>`).join('');
  anchor.closest('.fmt-wrap').appendChild(pop);
  pop.querySelectorAll('.tm-item').forEach(it => {
    it.onclick = () => {
      onPick(it.dataset.v, it.dataset.t);
      pop.remove();
    };
  });
}

/* 正文搜索高亮（作用于全部字段） */
function highlightText(keyword) {
  const wrap = $('#pageWrap');
  $$('mark.hl', wrap).forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
  if (!keyword) { $('#fmtSearchCount').textContent = ''; return; }
  let count = 0;
  $$('.field-input', wrap).forEach(field => {
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const idx = node.nodeValue.indexOf(keyword);
      if (idx === -1) return;
      const frag = document.createDocumentFragment();
      if (idx > 0) frag.appendChild(document.createTextNode(node.nodeValue.slice(0, idx)));
      const mark = document.createElement('mark');
      mark.className = 'hl';
      mark.textContent = keyword;
      frag.appendChild(mark);
      frag.appendChild(document.createTextNode(node.nodeValue.slice(idx + keyword.length)));
      node.parentNode.replaceChild(frag, node);
      count++;
    });
  });
  $('#fmtSearchCount').textContent = count ? `找到 ${count} 处` : '无匹配';
}

/* ---------- 选区快照：点击工具栏会清除 contenteditable 选区，
   因此在 mousedown 捕获阶段保存 Range，应用格式前先恢复 ---------- */
let savedSel = null;

function saveSelection() {
  const sel = window.getSelection();
  savedSel = null;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if ($('#pageWrap').contains(r.commonAncestorContainer)) {
      savedSel = r.cloneRange();
    }
  }
}

function restoreSelection() {
  if (!savedSel) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedSel);
  return true;
}

/* 校验保存的选区：仅当用户选中正文内文字时才允许格式操作 */
function validSelection() {
  if (!savedSel || savedSel.collapsed) {
    toast('请先在正文中选中要修改的文字');
    return null;
  }
  const field = $('#pageWrap .field-input');
  if (!field || !field.contains(savedSel.commonAncestorContainer)) {
    toast('请在正文区域中选中文字');
    return null;
  }
  return savedSel;
}

/* execCommand 安全包装（部分环境不支持时返回 false） */
const exec = (cmd, val) => {
  try { return document.execCommand(cmd, false, val); } catch (e) { return false; }
};

/* 网格线：作用于选中文字所在的段落 */
function applyGridToSelection() {
  const range = validSelection();
  if (!range) return;
  const field = $('#pageWrap .field-input');
  const getP = n => {
    let el = n.nodeType === 3 ? n.parentElement : n;
    while (el && el !== field && el.parentElement !== field) el = el.parentElement;
    return el;
  };
  const paras = new Set();
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node !== field && node.parentElement === field) {
      if (range.intersectsNode(node)) paras.add(node);
    }
    node = walker.nextNode();
  }
  const startP = getP(range.startContainer);
  const endP = getP(range.endContainer);
  if (startP) paras.add(startP);
  if (endP) paras.add(endP);
  if (!paras.size) { toast('请在正文中选中文字'); return; }
  let anyOn = false;
  paras.forEach(p => {
    const on = p.classList.toggle('grid-p');
    if (on) anyOn = true;
  });
  toast(anyOn ? '已为 ' + paras.size + ' 个选中段落添加网格线' : '已移除选中段落的网格线');
}

function bindFmtBar() {
  /* 捕获阶段保存选区（在浏览器清除选区之前） */
  $('#fmtBar').addEventListener('mousedown', e => {
    if (e.target.closest('.fmt-pop')) return;   /* 菜单内点击不重新捕获 */
    saveSelection();
  }, true);

  /* 字体：只作用于选中文字 */
  $('#fmtFont').onclick = () => {
    if (!validSelection()) return;
    fmtPop($('#fmtFont'), FONT_OPTIONS, null, (v, t) => {
      const fam = { 'f-song': 'SimSun', 'f-fangsong': 'FangSong', 'f-msyh': 'Microsoft YaHei' }[v];
      if (restoreSelection()) {
        exec('fontName', fam);
        toast('已应用「' + t + '」到选中文字');
      }
    });
  };

  /* 字号：只作用于选中文字（execCommand 1-7 号映射） */
  $('#fmtSize').onclick = () => {
    if (!validSelection()) return;
    fmtPop($('#fmtSize'), SIZE_OPTIONS, null, (v, t) => {
      const sizeMap = { 12: '1', 14: '2', 16: '3', 18: '4', 20: '5' };
      if (restoreSelection()) {
        exec('fontSize', sizeMap[Number(v.slice(2))]);
        toast('已应用字号「' + t + '」到选中文字');
      }
    });
  };

  /* 行距：只作用于选中文字所在段落 */
  $('#fmtLineH').onclick = () => {
    if (!validSelection()) return;
    fmtPop($('#fmtLineH'), LH_OPTIONS, null, (v, t) => {
      const lh = { 'lh-15': '1.5', 'lh-18': '1.8', 'lh-2': '2', 'lh-25': '2.5' }[v];
      if (restoreSelection()) {
        const ok = exec('lineHeight', lh);
        if (!ok) toast('行距仅对选中文字所在段落生效（当前浏览器可能不支持）');
        else toast('已应用行距「' + t + '」到选中文字');
      }
    });
  };

  /* 格式化经 execCommand 或直接改 DOM，统一在此回写数据模型 */
  const afterFmt = () => { syncFields(); markDirty(); };

  /* 加粗 / 斜体：仅作用于选区 */
  const applyInline = cmd => {
    if (!validSelection()) return;
    if (restoreSelection()) exec(cmd);
    afterFmt();
  };
  $('#fmtBold').onclick = () => applyInline('bold');
  $('#fmtItalic').onclick = () => applyInline('italic');

  /* 网格线：作用于选中段落 */
  $('#fmtGrid').onclick = () => { applyGridToSelection(); afterFmt(); };

  /* 分割线：在光标处插入水平线（插入操作） */
  $('#fmtHr').onclick = () => {
    if (!savedSel) { toast('请先在正文中放置光标'); return; }
    if (restoreSelection()) {
      const ok = exec('insertHorizontalRule');
      if (!ok) toast('请在正文中放置光标后再插入分割线');
    }
    afterFmt();
  };

  /* 插入图片：打开文件选择器 → 读为 dataURL → 插入光标处（也支持直接粘贴截图） */
  $('#fmtImage').onclick = () => {
    saveSelection();
    $('#imgFileInput').click();
  };
  $('#imgFileInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    readFileAsDataURL(f, insertImage);
  });

  /* 图片工具条：放大 / 缩小 / 旋转 / 移除（作用于当前选中的图片） */
  $('#imgTools').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || !currentImg) return;
    if (btn.dataset.act === 'grow' || btn.dataset.act === 'shrink') {
      const cur = Math.round(parseFloat(currentImg.style.width) || currentImg.getBoundingClientRect().width || 420);
      const next = Math.max(60, cur + (btn.dataset.act === 'grow' ? 20 : -20));
      currentImg.style.width = next + 'px';
      updateImgTools();
    } else if (btn.dataset.act === 'rotate') {
      const rot = (parseInt(currentImg.dataset.rot || '0', 10) + 90) % 360;
      currentImg.dataset.rot = rot;
      currentImg.style.transform = rot ? `rotate(${rot}deg)` : '';
      updateImgTools();
    } else if (btn.dataset.act === 'remove') {
      currentImg.remove();
      selectImg(null);
      const field = $('#pageWrap .field-input');
      if (field) field.dispatchEvent(new Event('input', { bubbles: true }));
      toast('图片已移除');
    }
    /* 直接改 DOM 不触发 input，需显式回写 */
    syncFields();
    markDirty();
  });

  /* 搜索 */
  $('#fmtSearch').onclick = () => {
    const box = $('#fmtSearchBox');
    const show = box.style.display === 'none';
    box.style.display = show ? 'flex' : 'none';
    $('#fmtSearch').classList.toggle('on', show);
    if (show) $('#fmtSearchInput').focus();
    else highlightText('');
  };
  $('#fmtSearchInput').addEventListener('input', e => {
    highlightText(e.target.value.trim());
  });
  $('#fmtSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#fmtSearch').click(); }
  });

  /* 撤回 / 恢复 */
  $('#fmtUndo').onclick = () => { exec('undo'); afterFmt(); };
  $('#fmtRedo').onclick = () => { exec('redo'); afterFmt(); };

  /* 点击编辑区关闭浮动菜单 */
  $('#editorScroll').addEventListener('mousedown', () => {
    $$('.fmt-pop').forEach(p => p.remove());
  });
}

/* ================= 入口 ================= */
let appInited = false;   /* 幂等保护：DOMContentLoaded 重复触发时避免重复绑定 */
document.addEventListener('DOMContentLoaded', () => {
  if (appInited) return;
  appInited = true;
  applyTheme();
  bootData();              /* 先恢复本地数据，再渲染书库 */
  renderLibraryView();
  persist.booting = false;
  setSaveState(ML_STORE.usable ? 'saved' : 'none');

  /* 关闭 / 刷新前立即落盘，防止防抖窗口内的改动丢失
     （ML_STORE.save 先同步写 localStorage，故此处必定生效） */
  const flush = () => {
    if (persist.timer) { clearTimeout(persist.timer); saveLibrary(); }
  };
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  /* 备份：导出 / 导入 */
  $('#exportBtn').onclick = exportBackup;
  $('#importBtn').onclick = () => armImport($('#importBtn'));
  $('#backupFileInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importBackup(f);
  });

  /* 书库 ↔ 工作台 */
  $('#homeBtn').onclick = () => {
    renderLibraryView();
    document.body.classList.add('view-home');
  };

  /* 新建作品表单 */
  $('#newBookBtn').onclick = () => showNewBookForm(true);
  $('#newBookCancel').onclick = () => showNewBookForm(false);
  $('#newBookOk').onclick = confirmNewBook;
  $('#newBookName').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmNewBook();
    if (e.key === 'Escape') showNewBookForm(false);
  });

  /* 模块导航 */
  $$('.rail-btn').forEach(b => {
    b.onclick = () => switchModule(b.dataset.module);
  });

  /* 条目新建 / 删除 */
  $('#moduleAdd').onclick = addItem;
  $('#moduleVol').onclick = addVolume;
  bindDelBtn();

  /* 格式工具栏 */
  bindFmtBar();

  /* 标题栏书名双击改名 */
  bindTitleRename();

  /* 侧边栏收起 / 展开（收起后编辑区自动居中） */
  $('#sidebarBtn').onclick = () => {
    state.sidebar = !state.sidebar;
    document.body.classList.toggle('collapsed', !state.sidebar);
  };

  /* 主题（工作台 + 书库两处按钮） */
  $('#themeBtn').onclick = toggleTheme;
  $('#themeBtnHome').onclick = toggleTheme;

  /* 专注模式 */
  $('#focusBtn').onclick = () => {
    state.focus = !state.focus;
    document.body.classList.toggle('focus', state.focus);
    $('#focusBtn').classList.toggle('active', state.focus);
    $('#focusHint').innerHTML = state.focus ? '<span style="color:var(--accent)">专注中 · 按 Esc 退出</span>' : '<span>专注模式 · F2</span>';
  };

  /* 信息面板 */
  $('#inspectorBtn').onclick = () => {
    state.inspector = !state.inspector;
    document.body.classList.toggle('no-inspector', !state.inspector);
    $('#inspectorBtn').classList.toggle('active', state.inspector);
  };

  /* 保存 */
  $('#saveBtn').onclick = saveNow;
  function saveNow() {
    const b = $('#saveBtn');
    b.classList.add('saved');
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>已保存';
    syncFields();
    if (DATA) {
      DATA.project.lastSaved = '刚刚';
      DATA.updated = nowString();   /* 作品更新日期与电脑日期关联 */
    }
    /* 更新当前编辑对象的最后编辑时间（与电脑日期关联） */
    const t = editorTarget();
    if (t) {
      if (t.key === 'chapters') {
        const f = chapterById(t.id);
        if (f) { f.chapter.edited = nowString(); refreshChapterCounts(f); }
      } else if (t.key === 'volume') {
        const v = volumeById(t.id);
        if (v) {
          v.edited = nowString();
          const pmEd = $('#pageWrap .pm-edited');
          if (pmEd) pmEd.textContent = `最后编辑 ${v.edited}`;
          renderInspector();
        }
      }
    }
    saveLibrary().then(res => {
      if (res && (res.ls || res.idb)) toast('已保存到本地 · ' + ML_STORE.describe());
      else if (!ML_STORE.usable) toast('当前环境无法本地存储，请用「导出备份」保存进度');
      else toast('保存失败，请用「导出备份」保存进度');
    });
    setTimeout(() => {
      b.classList.remove('saved');
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3.5h11l3 3v14H5z"/><path d="M8 3.5v6h8v-6M8 20.5v-7h8v7"/></svg>保存';
    }, 1600);
  }

  /* 搜索过滤 */
  $('#searchInput').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    let hits = 0;
    $$('[data-search]', BODY_EL).forEach(el => {
      const match = !q || el.dataset.search.includes(q);
      el.classList.toggle('hidden', !match);
      if (match) hits++;
    });
    if (q && !hits) {
      if (!$('.empty', BODY_EL)) {
        BODY_EL.insertAdjacentHTML('beforeend', '<div class="empty"><div class="orn">❧</div>无匹配条目</div>');
      }
    } else {
      const empty = $('.empty', BODY_EL);
      if (empty) empty.remove();
    }
  });

  /* 设置 */
  $('#settingsBtn').onclick = () => toast('原型演示 · 设置');

  /* 快捷键 */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
    if (e.key === 'F2') { e.preventDefault(); $('#focusBtn').click(); }
    if (e.key === 'Escape') {
      if (state.focus) $('#focusBtn').click();
      else if (document.activeElement === $('#searchInput')) { $('#searchInput').value = ''; $('#searchInput').dispatchEvent(new Event('input')); }
    }
  });

  /* 初始：默认停留在书库主页 */
  document.body.classList.add('view-home');
});
