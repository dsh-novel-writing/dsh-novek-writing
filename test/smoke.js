/* 墨庐 全量回归测试（jsdom）
 * 运行: node test/smoke.js
 * 覆盖: 书库 / 八模块统一格式（行内删除、双击重命名、类型标签）/
 *       章节卷头横体 / 大纲 / 删除人物关系图栏 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  /* execCommand 为 jsdom 未实现项，应用内有 try/catch 兜底，不算失败 */
  if (e && /execCommand|Not implemented/i.test(String(e.message || e))) return;
  errors.push(String((e && e.stack) || e));
});
vc.on('error', m => errors.push(String(m)));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', virtualConsole: vc });
const { window } = dom;
const { document } = window;

/* 串联 storage.js + data.js + app.js 后 eval（window.eval 的 const/let 不进 window，也不跨调用共享；
   因此在脚本末尾挂一个直接 eval 桥接，所有断言经由它读取脚本内的词法作用域） */
const read = f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
const src = [read('storage.js'), read('data.js'), read('app.js')].join('\n')
  + '\nwindow.__ml = { get DATA(){ return DATA; }, get state(){ return state; }, get BOOKS(){ return BOOKS; },'
  + ' MODULES, LIST_RENDERERS, ML_STORE, evalIn: c => eval(c) };';
window.eval(src);

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const EV = (el, type) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }));
const KEY = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const evalJS = code => window.__ml.evalIn(code);

/* 进入工作台 */
document.dispatchEvent(new window.Event('DOMContentLoaded'));
ok(!evalJS('typeof DATA === "undefined"'), '脚本载入（DATA 可读）');
ok(errors.length === 0, '无运行时错误（当前 ' + errors.length + ' 个）');

/* ---------- 1. 删除人物关系图栏 ---------- */
ok(!$('[data-module="relations"]'), '侧栏无「人物关系图」按钮');
ok(evalJS('!("relations" in MODULES)'), 'MODULES 无 relations');
ok(evalJS('!("relations" in LIST_RENDERERS)'), 'LIST_RENDERERS 无 relations');
ok(evalJS('typeof renderRelations === "undefined" && typeof graphPage === "undefined"'), '渲染函数已删除');

/* ---------- 2. 章节卷头横体 ---------- */
EV($('[data-module="chapters"]'), 'click');
ok($$('.group-head .fold-mark').length > 0, '章节卷头使用行首折叠标记');
ok($('.group-head .vol-name') && $('.group-head .vol-name').textContent.startsWith('卷'), '卷名横排显示于行首');
ok($$('.chapter-row .row-act.del').length > 0, '章节行保留行内删除');

/* ---------- 3. 八模块统一格式 ---------- */
const MODS = [
  ['scenes', '.scene-row', '.t'],
  ['characters', '.char-row', '.n'],
  ['world', '.world-row', '.t'],
  ['settings', '.term-row', '.term'],
  ['plot', '.plot-item', '.p-name'],
  ['timeline', '.tl-item', '.tl-name'],
  ['library', '.term-row', '.term'],
  ['notes', '.note-card', '.n-title'],
  ['materials', '.mat-row', '.m-name']
];
for (const [m, rowSel, nameSel] of MODS) {
  EV($('[data-module="' + m + '"]'), 'click');
  const rows = $$(rowSel);
  ok(rows.length > 0, m + '：条目渲染 ' + rows.length + ' 行');
  const withDel = rows.filter(r => r.querySelector('.row-act.del'));
  ok(withDel.length === rows.length, m + '：每行含行内删除按钮');
  ok(rows.every(r => r.querySelector(nameSel)), m + '：名称元素存在（' + nameSel + '）');
}

/* ---------- 3a. 双击重命名（world） ---------- */
EV($('[data-module="world"]'), 'click');
let wRow = $('.world-row');
const wId = wRow.dataset.id;
EV(wRow.querySelector('.t'), 'dblclick');
let inp = wRow.querySelector('.tree-name-input');
ok(!!inp, 'world：双击出现重命名输入框');
inp.value = '新世界名';
KEY(inp, 'Enter');
ok(evalJS('DATA.world.find(w => w.id === "' + wId + '").title') === '新世界名', 'world：重命名写回数据');
ok($$('.world-row').some(r => r.textContent.includes('新世界名')), 'world：侧栏名称同步');

/* ---------- 3b. 行内删除（world，二次确认） ---------- */
const nBefore = evalJS('DATA.world.length');
wRow = $('.world-row');
const delBtn = wRow.querySelector('.row-act.del');
EV(delBtn, 'click');
ok(delBtn.classList.contains('confirming'), 'world：删除按钮进入确认态');
EV(delBtn, 'click');
ok(evalJS('DATA.world.length') === nBefore - 1, 'world：行内删除生效');
ok(evalJS('state.worldId') === null, 'world：删除后选中清空');

/* ---------- 3c. 标签自由输入自定义（8 模块统一） ---------- */
const tagInputTest = (m, rowSel, dataExpr, newVal) => {
  EV($('[data-module="' + m + '"]'), 'click');
  const row = $(rowSel);
  const tag = row.querySelector('.tag-editable');
  EV(tag, 'click');
  const inp = row.querySelector('.tag-input');
  ok(!!inp, m + '：点击标签出现输入框');
  inp.value = newVal;
  KEY(inp, 'Enter');
  ok(evalJS(dataExpr) === newVal, m + '：自定义标签写回数据');
};
tagInputTest('world', '.world-row', 'DATA.world[0].type', '自定义类型');
/* 剧情：标签点击弹出多选类型面板 */
EV($('[data-module="plot"]'), 'click');
const pTag = $('.plot-item .tag-editable');
EV(pTag, 'click');
const pMenu = $('.plot-item .type-menu.multi');
ok(!!pMenu, 'plot：点击标签出现多选面板');
ok(pMenu.querySelectorAll('.tm-item').length >= 5, 'plot：预设选项至少 5 个（主线/支线/暗线/明线/感情线等）');
ok(!!pMenu.querySelector('.tm-item.sel'), 'plot：当前类型已选中');
EV(pMenu.querySelector('.tm-item:not(.sel)'), 'click');
EV(pMenu.querySelector('.tm-ok'), 'click');
const pTypes = evalJS('DATA.plotlines[0].type');
ok(Array.isArray(pTypes) && pTypes.length === 2, 'plot：多选写回数组数据');
ok($('.plot-item .tag-editable').textContent === pTypes.join(' · '), 'plot：标签显示多个类型');
/* 剧情编辑页徽章同样多选 */
EV($('.plot-item'), 'click');
const pBadge = $('.badge[data-tag-edit]');
EV(pBadge, 'click');
const bMenu = $('#pageWrap .type-menu.multi');
ok(!!bMenu, 'plot 编辑页徽章弹出多选面板');
EV(bMenu.querySelector('.tm-item[data-t="明线"]'), 'click');
EV(bMenu.querySelector('.tm-ok'), 'click');
ok(evalJS('DATA.plotlines[0].type').includes('明线'), 'plot：编辑页徽章多选同步');
tagInputTest('timeline', '.tl-item', 'DATA.timeline[0].type', '异变');
tagInputTest('characters', '.char-row', 'DATA.characters[0].role', '挚友');
tagInputTest('scenes', '.scene-row', 'DATA.scenes[0].type', '高潮');
tagInputTest('settings', '.term-row', 'DATA.settingsGroups[0].items[0].tag', '专属');
tagInputTest('library', '.term-row', 'DATA.library[0].items[0].tag', '考据');
tagInputTest('materials', '.mat-row', 'DATA.materials[0].items[0].tag', '收藏');

/* ---------- 3d. 编辑页徽章自由输入（world） ---------- */
EV($('[data-module="world"]'), 'click');
EV($('.world-row'), 'click');
const badge = $('.badge[data-tag-edit]');
ok(!!badge, 'world 编辑页有可自定义徽章');
EV(badge, 'click');
const bInp = $('#pageWrap .tag-input');
ok(!!bInp, 'world：编辑页徽章点击出现输入框');
bInp.value = '纪元';
KEY(bInp, 'Enter');
ok(evalJS('DATA.world[0].type') === '纪元', 'world：编辑页徽章自定义并同步');
ok($('.badge[data-tag-edit]').textContent === '纪元', 'world：徽章文字更新');

/* ---------- 3e. 设定栏分组删除 ---------- */
ok(evalJS('DATA.settingsGroups.length') === 2, '设定栏仅剩 2 个分组');
ok(!evalJS('DATA.settingsGroups.some(g => g.name === "地理分区" || g.name === "关键物件")'), '地理分区 / 关键物件已删除');
EV($('[data-module="settings"]'), 'click');
ok($$('.setting-group').length === 2, '侧栏设定分区渲染 2 组');
ok(!fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8').includes('.term-row .row-acts { position: absolute'), '设定条目删除按钮不再悬浮（与标签分离）');

/* ---------- 3f. 灰色说明文字已删除 ---------- */
EV($('[data-module="scenes"]'), 'click');
ok(!$('.scene-row .sub'), '场景行无灰色副文本');
EV($('[data-module="plot"]'), 'click');
ok(!$('.plot-item .p-foot'), '剧情行无灰色脚注');
ok(!$('.plot-item .p-bar'), '剧情条目下方无线条');
EV($('[data-module="characters"]'), 'click');
ok(!$('.char-row .r'), '人物行无灰色角色字');
EV($('[data-module="materials"]'), 'click');
ok(!$('.mat-row .m-meta'), '素材行无灰色元数据');

/* ---------- 3g. 人物关系可自定义（人物页） ---------- */
EV($('[data-module="characters"]'), 'click');
EV($('.char-row'), 'click');
const relInp = $('#pageWrap .rel-input');
ok(!!relInp, '人物编辑页有关系输入框');
const relBefore = evalJS('DATA.characters[0].relations.length');
relInp.value = '人物五';
KEY(relInp, 'Enter');
ok(evalJS('DATA.characters[0].relations.length') === relBefore + 1, '人物关系添加生效');
ok($$('#pageWrap #relChips .rel-chip').some(c => c.dataset.name === '人物五'), '人物关系 chip 显示');
const chip = $$('#pageWrap #relChips .rel-chip').find(c => c.dataset.name === '人物五');
EV(chip.querySelector('.x'), 'click');
ok(evalJS('DATA.characters[0].relations.length') === relBefore, '人物关系移除生效');

/* ---------- 3h. 编辑页：仅保留字数统计与最后编辑时间 ---------- */
EV($('[data-module="world"]'), 'click');
EV($('.world-row'), 'click');
const pw = $('#pageWrap');
ok(!pw.textContent.includes('世界观条目'), 'world 编辑页无灰色说明');
ok(!pw.textContent.includes('点击任意处即可编辑'), '无「点击任意处即可编辑」');
ok(!!pw.querySelector('.pm-words'), '页头有字数统计');
ok(!!pw.querySelector('.pm-edited'), '页头有最后编辑时间');
ok(pw.querySelector('.pm-edited').textContent === '最后编辑 —', '初始最后编辑为 —');
const fld = pw.querySelector('.field-input');
fld.textContent = '这是一段测试内容';
fld.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(pw.querySelector('.pm-words').textContent === '当前 8 字', '字数统计实时更新');
ok(/^\d{2}-\d{2} \d{2}:\d{2}$/.test(pw.querySelector('.pm-edited').textContent.replace('最后编辑 ', '')), '输入后最后编辑时间与系统时间格式吻合（MM-DD HH:mm）');

/* 章节页：徽章右侧灰色说明删除，字数/最后编辑保留 */
EV($('[data-module="chapters"]'), 'click');
EV($('.chapter-row'), 'click');
ok(!$('#pageWrap .page-meta').textContent.includes('卷一'), '章节页徽章右侧无卷名灰色说明');
ok(!!$('#pageWrap .pm-words') && !!$('#pageWrap .pm-edited'), '章节页保留字数与最后编辑时间');

/* 人物编辑页：同样无灰色说明、有字数/时间 */
EV($('[data-module="characters"]'), 'click');
EV($('.char-row'), 'click');
ok(!$('#pageWrap').textContent.includes('年龄未设定'), '人物编辑页无年龄灰色说明');
ok(!!$('#pageWrap .pm-words') && !!$('#pageWrap .pm-edited'), '人物页保留字数与最后编辑时间');

/* ---------- 3i. 设定栏：分组行内新建（新条目直接落入对应分组） ---------- */
EV($('[data-module="settings"]'), 'click');
ok($$('.sg-head').length === 2, '设定栏 2 个分组头');
ok($$('.sg-head').every(h => h.querySelector('.row-act.add')), '每个分组行内都有 ＋ 按钮');
const g0Before = evalJS('DATA.settingsGroups[0].items.length');
const g1Before = evalJS('DATA.settingsGroups[1].items.length');
EV($('.setting-group .sg-head[data-group="核心规则"] .row-act.add'), 'click');
ok(evalJS('DATA.settingsGroups[0].items.length') === g0Before + 1, '核心规则分组下新建生效');
ok(!$$('.setting-group')[0].classList.contains('collapsed'), '点击 ＋ 不触发折叠');
ok($('#pageWrap .page-title').textContent === '规则三', '编辑页打开新条目（核心规则 → 规则三）');
EV($('.setting-group .sg-head[data-group="历史大事"] .row-act.add'), 'click');
ok(evalJS('DATA.settingsGroups[1].items.length') === g1Before + 1, '历史大事分组下新建生效');
ok($('#pageWrap .page-title').textContent === '事件五', '编辑页打开新条目（历史大事 → 事件五）');
ok($$('.term-row').some(r => r.textContent.includes('事件五')), '新条目直接出现在历史大事分组下');

/* ---------- 3j. 时间线：灰色时间可修改 ---------- */
EV($('[data-module="timeline"]'), 'click');
const tRow = $('.tl-item');
EV(tRow.querySelector('.tl-year'), 'dblclick');
const yInp = tRow.querySelector('.tag-input');
ok(!!yInp, 'timeline：双击时间出现输入框');
yInp.value = '1999-01-01';
KEY(yInp, 'Enter');
ok(evalJS('DATA.timeline[0].year') === '1999-01-01', 'timeline：时间修改写回数据');
ok($('.tl-item .tl-year').textContent === '1999-01-01', 'timeline：侧栏显示新时间');

/* ---------- 3k. 资料库：分组行内新建 + 模块栏＋ = 新建新分组 ---------- */
EV($('[data-module="library"]'), 'click');
ok($$('.group-head').every(h => h.querySelector('.row-act.add')), '资料库每个分组行内都有 ＋ 按钮');
const libBefore = evalJS('DATA.library[0].items.length');
EV($('.group-head[data-group="地名考据"] .row-act.add'), 'click');
ok(evalJS('DATA.library[0].items.length') === libBefore + 1, '资料库：分组行内新建生效');
ok($('#pageWrap .page-title').textContent === evalJS('DATA.library[0].items[DATA.library[0].items.length - 1].term'), '资料库：新条目自动打开');
const libG = evalJS('DATA.library.length');
EV($('#moduleAdd'), 'click');
ok(evalJS('DATA.library.length') === libG + 1, '资料库：模块栏＋新建新分组');
ok(evalJS('DATA.library[DATA.library.length - 1].group') === '分组五', '资料库：新分组名为「分组五」');
ok($$('.group-head').length === libG + 1, '资料库：新分组出现在侧栏');

/* ---------- 3l. 笔记：标签可编辑（名字已可双击重命名） ---------- */
EV($('[data-module="notes"]'), 'click');
const nTag = $('.note-card .tag-editable');
EV(nTag, 'click');
const nInp = $('.note-card .tag-input');
ok(!!nInp, 'notes：点击标签出现输入框');
nInp.value = '灵感收集';
KEY(nInp, 'Enter');
ok(evalJS('DATA.notes[0].tag') === '灵感收集', 'notes：标签修改写回数据');

/* ---------- 3m. 素材库：去图标 + 分组行内新建 + 模块栏＋ = 新建新分组 ---------- */
EV($('[data-module="materials"]'), 'click');
ok(!$('.mat-row .mat-icon'), '素材行无图标');
ok($$('.group-head').every(h => h.querySelector('.row-act.add')), '素材库每个分组行内都有 ＋ 按钮');
const matBefore = evalJS('DATA.materials[0].items.length');
EV($('.group-head[data-group="意象图片"] .row-act.add'), 'click');
ok(evalJS('DATA.materials[0].items.length') === matBefore + 1, '素材库：分组行内新建生效');
const matG = evalJS('DATA.materials.length');
EV($('#moduleAdd'), 'click');
ok(evalJS('DATA.materials.length') === matG + 1, '素材库：模块栏＋新建新分组');
ok(evalJS('DATA.materials[DATA.materials.length - 1].group') === '素材组四', '素材库：新分组名为「素材组四」');

/* ---------- 4. 其余模块行内删除冒烟（characters / notes / materials） ---------- */
EV($('[data-module="characters"]'), 'click');
const cnBefore = evalJS('DATA.characters.length');
const cDel = $('.char-row .row-act.del');
EV(cDel, 'click');
EV(cDel, 'click');
ok(evalJS('DATA.characters.length') === cnBefore - 1, 'characters：行内删除生效');

EV($('[data-module="materials"]'), 'click');
const mnBefore = evalJS('DATA.materials.reduce((s, g) => s + g.items.length, 0)');
const mDel = $('.mat-row .row-act.del');
EV(mDel, 'click');
EV(mDel, 'click');
ok(evalJS('DATA.materials.reduce((s, g) => s + g.items.length, 0)') === mnBefore - 1, 'materials：行内删除生效');

/* ---------- 5. 大纲 / 章节既有功能回归 ---------- */
EV($('[data-module="outline"]'), 'click');
const oRow = $('.tree-row');
ok(!!oRow.querySelector('.fold-mark'), '大纲：行首折叠标记保留');
EV(oRow.querySelector('.t'), 'dblclick');
const oInp = $('.tree-row .tree-name-input');
ok(!!oInp, '大纲：双击重命名保留');
oInp.value = '新卷名';
KEY(oInp, 'Enter');
ok($$('.tree-row').some(r => r.textContent.includes('新卷名')), '大纲：重命名生效');

EV($('[data-module="chapters"]'), 'click');
const chRow = $('.chapter-row');
const chId = chRow.dataset.id;
EV(chRow.querySelector('.status-dot'), 'click');
const stItems = $$('.chapter-row .tm-item');
EV(stItems.find(i => i.textContent === '定稿'), 'click');
ok(evalJS('chapterById("' + chId + '").chapter.status') === '定稿', '章节：状态点修改保留');

/* 卷状态标签 */
const volTag = $('.group-head .status-tag');
EV(volTag, 'click');
const vItems = $$('.group-head .tm-item');
EV(vItems.find(i => i.textContent === '修改中'), 'click');
ok(evalJS('DATA.volumes[0].status') === '修改中', '章节：卷状态标签修改保留');

/* ---------- 6. 书库 ---------- */
EV($('#homeBtn'), 'click');
ok(document.body.classList.contains('view-home'), '返回书库');
ok($$('.book-card').length > 0, '书库卡片渲染');
ok($('.book-card .book-words').textContent.includes('总字数'), '书库显示总字数');
EV($('.book-card [data-act="edit"]'), 'click');
ok(!document.body.classList.contains('view-home'), '点击编辑进入工作台');

/* ---------- 7. 设定分区：顶部 ＋ 建同级分区 / 预设分区名可改 ---------- */
EV($('[data-module="settings"]'), 'click');
const sgBefore = evalJS('DATA.settingsGroups.length');
const sgItems = () => evalJS('DATA.settingsGroups.reduce((s, g) => s + g.items.length, 0)');
const sgItemsBefore = sgItems();
EV($('#moduleAdd'), 'click');
ok(evalJS('DATA.settingsGroups.length') === sgBefore + 1, '设定：顶部 ＋ 新建分区（不再往核心规则里塞条目）');
ok(sgItems() === sgItemsBefore, '设定：顶部 ＋ 不改变条目总数');
ok($$('.setting-group').length === sgBefore + 1, '设定：新分区渲染在侧栏');
const newSg = evalJS('DATA.settingsGroups[DATA.settingsGroups.length - 1]');
ok(/^分区/.test(newSg.name), '设定：新分区默认名为「分区N」（实际 ' + newSg.name + '）');
ok(newSg.items.length === 0, '设定：新分区初始为空');
const sgNames = evalJS('DATA.settingsGroups.map(g => g.name)');
ok(sgNames.includes('核心规则') && sgNames.includes('历史大事') && sgNames.includes(newSg.name),
  '设定：新分区与核心规则 / 历史大事同级（' + sgNames.join(' / ') + '）');

/* 预设分区「核心规则」双击改名 */
const coreHead = $('.setting-group .sg-head[data-group="核心规则"]');
ok(!!coreHead.querySelector('.sg-name'), '设定：分区名有独立的 .sg-name 元素');
EV(coreHead.querySelector('.sg-name'), 'dblclick');
let sgInp = coreHead.querySelector('.tree-name-input');
ok(!!sgInp, '设定：双击分区名出现重命名输入框');
sgInp.value = '世界规则';
KEY(sgInp, 'Enter');
ok(evalJS('DATA.settingsGroups.some(g => g.name === "世界规则")'), '设定：预设分区「核心规则」改名写回数据');
ok(!evalJS('DATA.settingsGroups.some(g => g.name === "核心规则")'), '设定：旧分区名已不存在');
ok($$('.sg-head').some(h => h.dataset.group === '世界规则'), '设定：侧栏显示新分区名');

/* 分区名参与条目 id，改名后条目不能丢、且仍能继续新建 */
const renamedCount = evalJS('DATA.settingsGroups.find(g => g.name === "世界规则").items.length');
ok(renamedCount > 0, '设定：改名后分区内条目未丢失（' + renamedCount + ' 条）');
EV($('.setting-group .sg-head[data-group="世界规则"] .row-act.add'), 'click');
ok(evalJS('DATA.settingsGroups.find(g => g.name === "世界规则").items.length') === renamedCount + 1,
  '设定：改名后的分区下仍可新建条目');

/* 预设分区「历史大事」同样可改 */
const histHead = $('.setting-group .sg-head[data-group="历史大事"]');
EV(histHead.querySelector('.sg-name'), 'dblclick');
sgInp = histHead.querySelector('.tree-name-input');
sgInp.value = '年表';
KEY(sgInp, 'Enter');
ok(evalJS('DATA.settingsGroups.some(g => g.name === "年表")'), '设定：预设分区「历史大事」同样可改名');

/* 重名会破坏「分区名·条目名」定位，应被拒绝 */
const dupHead = $('.setting-group .sg-head[data-group="年表"]');
EV(dupHead.querySelector('.sg-name'), 'dblclick');
sgInp = dupHead.querySelector('.tree-name-input');
sgInp.value = '世界规则';
KEY(sgInp, 'Enter');
ok(evalJS('DATA.settingsGroups.filter(g => g.name === "世界规则").length') === 1, '设定：拒绝重名分区');
ok(evalJS('DATA.settingsGroups.some(g => g.name === "年表")'), '设定：重名被拒后原名保留');

/* 空名视为放弃修改 */
const keepHead = $('.setting-group .sg-head[data-group="年表"]');
EV(keepHead.querySelector('.sg-name'), 'dblclick');
sgInp = keepHead.querySelector('.tree-name-input');
sgInp.value = '   ';
KEY(sgInp, 'Enter');
ok(evalJS('DATA.settingsGroups.some(g => g.name === "年表")'), '设定：空名不改动原分区名');

/* 改名依赖点击分区名，因此点名字不能连带折叠 */
const foldHead = $('.setting-group .sg-head[data-group="世界规则"]');
const foldGroup = foldHead.parentElement;
const wasCollapsed = foldGroup.classList.contains('collapsed');
EV(foldHead.querySelector('.sg-name'), 'click');
ok(foldGroup.classList.contains('collapsed') === wasCollapsed, '设定：点击分区名不触发折叠');
EV(foldHead.querySelector('.fold-mark'), 'click');
ok(foldGroup.classList.contains('collapsed') !== wasCollapsed, '设定：点击折叠标记仍可折叠');

/* 分区删除：二次确认，空分区 */
const sgDelBase = evalJS('DATA.settingsGroups.length');
const emptySg = evalJS('DATA.settingsGroups[DATA.settingsGroups.length - 1].name');
const sgDelBtn = $('.setting-group .sg-head[data-group="' + emptySg + '"] .row-act.del');
ok(!!sgDelBtn, '设定：分区头有删除按钮');
EV(sgDelBtn, 'click');
ok(sgDelBtn.classList.contains('confirming'), '设定：分区删除进入二次确认态');
ok(evalJS('DATA.settingsGroups.length') === sgDelBase, '设定：首次点击不删除');
EV(sgDelBtn, 'click');
ok(evalJS('DATA.settingsGroups.length') === sgDelBase - 1, '设定：二次确认后分区被删除');
ok(!evalJS('DATA.settingsGroups.some(g => g.name === ' + JSON.stringify(emptySg) + ')'), '设定：被删分区已不在数据中');
ok(!$$('.sg-head').some(h => h.dataset.group === emptySg), '设定：侧栏不再显示该分区');

/* 分区删除：含条目的分区应连带清空条目与选中态 */
const richSg = evalJS('DATA.settingsGroups.find(g => g.items.length > 0).name');
const richCount = evalJS('DATA.settingsGroups.find(g => g.name === ' + JSON.stringify(richSg) + ').items.length');
const totalBeforeDel = sgItems();
const richHead = $('.setting-group .sg-head[data-group="' + richSg + '"]');
EV(richHead.nextElementSibling.querySelector('.term-row'), 'click');
ok(evalJS('state.termId') !== null, '设定：已选中待删分区内的条目');
const richDelBtn = richHead.querySelector('.row-act.del');
EV(richDelBtn, 'click');
EV(richDelBtn, 'click');
ok(sgItems() === totalBeforeDel - richCount, '设定：删除分区连带移除其 ' + richCount + ' 条条目');
ok(!evalJS('DATA.settingsGroups.some(g => g.name === ' + JSON.stringify(richSg) + ')'), '设定：含条目的分区已删除');
ok(evalJS('state.termId') === null, '设定：删除分区后清空选中态（编辑区不再指向已删数据）');

/* ---------- 7b. 资料库分组：与设定分区一致的新建 / 改名 / 删除 ---------- */
EV($('[data-module="library"]'), 'click');
const libGroups = () => evalJS('DATA.library.map(g => g.group)');
const libItems = () => evalJS('DATA.library.reduce((s, g) => s + g.items.length, 0)');

/* 顶部 ＋ 建的是同级分组，不是往第一个分组里塞条目 */
const libGBase = evalJS('DATA.library.length');
const libItemsBase = libItems();
EV($('#moduleAdd'), 'click');
ok(evalJS('DATA.library.length') === libGBase + 1, '资料库：顶部 ＋ 新建同级分组');
ok(libItems() === libItemsBase, '资料库：顶部 ＋ 不改变条目总数');
ok($$('.group-head').length === libGBase + 1, '资料库：新分组渲染在侧栏');

/* 分组名可双击改名（预设分组同样可改） */
const libHead = $('.group-head[data-group="地名考据"]');
ok(!!libHead, '资料库：预设分组「地名考据」存在');
ok(!!libHead.querySelector('.g-name'), '资料库：分组名有独立的 .g-name 元素');
ok(!!libHead.querySelector('.row-act.del'), '资料库：分组头有删除按钮');
EV(libHead.querySelector('.g-name'), 'dblclick');
let libInp = libHead.querySelector('.tree-name-input');
ok(!!libInp, '资料库：双击分组名出现重命名输入框');
const libRenamedCount = evalJS('DATA.library[0].items.length');
libInp.value = '地理志';
KEY(libInp, 'Enter');
ok(libGroups().includes('地理志'), '资料库：预设分组改名写回数据');
ok(!libGroups().includes('地名考据'), '资料库：旧分组名已不存在');
ok($$('.group-head').some(h => h.dataset.group === '地理志'), '资料库：侧栏显示新分组名');
ok(evalJS('DATA.library[0].items.length') === libRenamedCount, '资料库：改名后分组内条目未丢失（' + libRenamedCount + ' 条）');
EV($('.group-head[data-group="地理志"] .row-act.add'), 'click');
ok(evalJS('DATA.library[0].items.length') === libRenamedCount + 1, '资料库：改名后的分组下仍可新建条目');
ok(evalJS('state.termId').indexOf('地理志·') === 0, '资料库：选中态跟着新分组名迁移');

/* 条目 id 是「分组名·条目名」，且设定与资料库共用这套 id，故跨模块重名也必须拒绝 */
const libDupHead = $('.group-head[data-group="地理志"]');
EV(libDupHead.querySelector('.g-name'), 'dblclick');
libInp = libDupHead.querySelector('.tree-name-input');
libInp.value = evalJS('DATA.library[1].group');
KEY(libInp, 'Enter');
ok(libGroups().includes('地理志'), '资料库：同模块重名被拒，原名保留');
const sgLeft = evalJS('DATA.settingsGroups[0].name');
EV($('.group-head[data-group="地理志"] .g-name'), 'dblclick');
libInp = $('.group-head[data-group="地理志"] .tree-name-input');
libInp.value = sgLeft;
KEY(libInp, 'Enter');
ok(libGroups().includes('地理志'), '资料库：与设定分区同名也被拒（两者共用条目 id）');
ok(evalJS('DATA.settingsGroups.filter(g => g.name === ' + JSON.stringify(sgLeft) + ').length') === 1, '资料库：跨模块重名未污染设定分区');

/* 空名视为放弃修改 */
EV($('.group-head[data-group="地理志"] .g-name'), 'dblclick');
libInp = $('.group-head[data-group="地理志"] .tree-name-input');
libInp.value = '   ';
KEY(libInp, 'Enter');
ok(libGroups().includes('地理志'), '资料库：空名不改动原分组名');

/* 改名依赖点击分组名，因此点名字不能连带折叠 */
const libFold = $('.group-head[data-group="地理志"]');
const libWasOpen = libFold.classList.contains('open');
EV(libFold.querySelector('.g-name'), 'click');
ok(libFold.classList.contains('open') === libWasOpen, '资料库：点击分组名不触发折叠');
EV(libFold.querySelector('.fold-mark'), 'click');
ok(libFold.classList.contains('open') !== libWasOpen, '资料库：点击折叠标记仍可折叠');

/* 分组删除：二次确认，空分组 */
const libDelBase = evalJS('DATA.library.length');
const emptyLib = evalJS('DATA.library[DATA.library.length - 1].group');
const libDelBtn = $('.group-head[data-group="' + emptyLib + '"] .row-act.del');
EV(libDelBtn, 'click');
ok(libDelBtn.classList.contains('confirming'), '资料库：分组删除进入二次确认态');
ok(evalJS('DATA.library.length') === libDelBase, '资料库：首次点击不删除');
EV(libDelBtn, 'click');
ok(evalJS('DATA.library.length') === libDelBase - 1, '资料库：二次确认后分组被删除');
ok(!libGroups().includes(emptyLib), '资料库：被删分组已不在数据中');
ok(!$$('.group-head').some(h => h.dataset.group === emptyLib), '资料库：侧栏不再显示该分组');

/* 分组删除：含条目的分组应连带清空条目与选中态 */
const richLib = evalJS('DATA.library.find(g => g.items.length > 0).group');
const richLibCount = evalJS('DATA.library.find(g => g.group === ' + JSON.stringify(richLib) + ').items.length');
const libItemsBeforeDel = libItems();
const richLibHead = $('.group-head[data-group="' + richLib + '"]');
EV(richLibHead.nextElementSibling.querySelector('.term-row'), 'click');
ok(evalJS('state.termId') !== null, '资料库：已选中待删分组内的条目');
const richLibDel = richLibHead.querySelector('.row-act.del');
EV(richLibDel, 'click');
EV(richLibDel, 'click');
ok(libItems() === libItemsBeforeDel - richLibCount, '资料库：删除分组连带移除其 ' + richLibCount + ' 条条目');
ok(!libGroups().includes(richLib), '资料库：含条目的分组已删除');
ok(evalJS('state.termId') === null, '资料库：删除分组后清空选中态');

/* 素材库仍是原有行为，不应被这轮改动带上删除按钮 */
EV($('[data-module="materials"]'), 'click');
ok($$('.group-head').every(h => !h.querySelector('.row-act.del')), '素材库：分组头保持原样（无删除按钮）');
ok($$('.group-head').every(h => !h.querySelector('.g-name')), '素材库：分组名未接入改名');

/* ---------- 8. 持久化：字段写回 / 落盘 / 还原 ---------- */
ok(evalJS('typeof ML_STORE === "object" && ML_STORE !== null'), '持久化模块已加载');
ok(evalJS('ML_STORE.hasLS'), 'localStorage 可用（jsdom 无 IndexedDB，走快照兜底路径）');
ok(evalJS('ML_STORE.hasIDB') === false, 'jsdom 环境如实报告 IndexedDB 不可用');

/* 章节正文：此前是硬编码空值，从不写回数据 */
EV($('[data-module="chapters"]'), 'click');
const pRow = $('.chapter-row');
const pChId = pRow.dataset.id;
EV(pRow, 'click');
const bodyField = $('#pageWrap .field-input[data-field="body"]');
ok(!!bodyField, '章节正文字段带有 data-field="body"');
bodyField.innerHTML = '第一章的正文内容';
bodyField.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(evalJS('chapterById("' + pChId + '").chapter.body') === '第一章的正文内容', '章节正文写回数据模型');
ok(evalJS('chapterById("' + pChId + '").chapter.words') === 8, '章节字数按正文实际长度统计');

/* 切到别的章节再切回来：内容应当还在 */
EV($$('.chapter-row')[1], 'click');
EV($('.chapter-row'), 'click');
ok($('#pageWrap .field-input[data-field="body"]').innerHTML === '第一章的正文内容', '切换条目后正文仍可恢复');

/* 富文本（图片 / 加粗）按 innerHTML 存取 */
const richField = $('#pageWrap .field-input[data-field="body"]');
richField.innerHTML = '正文<b>加粗</b>片段';
richField.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(evalJS('chapterById("' + pChId + '").chapter.body').includes('<b>加粗</b>'), '富文本标记随正文一同保存');

/* 其余模块的字段同样接入数据模型 */
EV($('[data-module="notes"]'), 'click');
EV($('.note-card'), 'click');
const noteField = $('#pageWrap .field-input[data-field="excerpt"]');
ok(!!noteField, 'notes：笔记正文字段已绑定');
noteField.innerHTML = '一条笔记';
noteField.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(evalJS('DATA.notes[0].excerpt') === '一条笔记', 'notes：笔记正文写回数据模型');

/* 先前完全没有数据落点的 7 个字段，现在都有 data-field */
const boundFields = [
  ['chapters', '.chapter-row', ['body', 'note']],
  ['outline', '.tree-row', ['note', 'link']],
  ['timeline', '.tl-item', ['desc', 'impact']],
  ['settings', '.term-row', ['def', 'extra']],
  ['materials', '.mat-row', ['note']]
];
for (const [m, rowSel, keys] of boundFields) {
  EV($('[data-module="' + m + '"]'), 'click');
  const r = $(rowSel);
  if (!r) { ok(false, m + '：找不到条目行'); continue; }
  EV(r, 'click');
  const got = $$('#pageWrap .field-input[data-field]').map(el => el.dataset.field);
  ok(keys.every(k => got.includes(k)), m + '：字段已绑定（' + keys.join(' / ') + '）');
}

/* 立即落盘，校验 localStorage 快照 */
evalJS('saveLibrary()');
const snapRaw = window.localStorage.getItem('ml-books');
ok(!!snapRaw, 'localStorage 已写入书库快照');
let snap = null;
try { snap = JSON.parse(snapRaw); } catch (e) {}
ok(!!snap && Array.isArray(snap.books), '快照结构含 books 数组');
ok(!!snap && typeof snap.savedAt === 'string' && snap.savedAt.length > 0, '快照带有保存时间戳');
ok(!!snapRaw && snapRaw.includes('第一章的正文内容') === false, '快照记录的是最新正文（旧内容已被覆盖）');
ok(!!snapRaw && snapRaw.includes('加粗'), '快照中包含最新写入的正文');

/* 模拟重新打开页面：从快照还原 */
const restoredBody = evalJS(
  '(() => { const bs = sanitizeBooks(' + JSON.stringify(snap.books) + ');'
  + ' return bs && bs[0].volumes[0].chapters[0].body; })()'
);
ok(typeof restoredBody === 'string' && restoredBody.includes('加粗'), '还原后的数据仍含章节正文');
ok(evalJS('sanitizeBooks([])') === null, 'sanitizeBooks 拒绝空数据');
ok(evalJS('sanitizeBooks("nonsense")') === null, 'sanitizeBooks 拒绝非法数据');

/* 早期版本 body 为数组占位，应归一为字符串 */
ok(evalJS('sanitizeBooks([{ volumes: [{ chapters: [{ body: [] }] }] }])[0].volumes[0].chapters[0].body') === '',
  '旧版数组型 body 归一为空字符串');

/* ---------- 9. 时间线长按拖动排序 + 10. 正文图片 ---------- */
(async () => {
  try {
    /* === 9. 时间线：长按拾起 → 拖动 → 松开提交 === */
    EV($('[data-module="timeline"]'), 'click');
    const tlOrder = () => evalJS('DATA.timeline.map(t => t.year)');
    const tlDom = () => $$('.timeline .tl-item').map(el => el.dataset.id);
    const MEV = (el, type, x, y) => el.dispatchEvent(new window.MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
    }));
    /* jsdom 无布局，getBoundingClientRect 全为 0；按当前 DOM 顺序合成每行 40px 的几何 */
    const stubRects = () => {
      $$('.timeline .tl-item').forEach(el => {
        el.getBoundingClientRect = () => {
          const sibs = Array.from(el.parentNode.children).filter(x => x.classList.contains('tl-item'));
          const i = sibs.indexOf(el);
          return { top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 200, width: 200, x: 0, y: i * 40, toJSON() {} };
        };
      });
    };

    const before = tlOrder();
    ok(before.length >= 4, '时间线：有足够事件可排序（' + before.length + ' 个）');
    ok(tlDom().join('|') === before.join('|'), '时间线：DOM 顺序与数据顺序一致');

    /* 快速点击不该触发拖动 */
    let row = $('.timeline .tl-item');
    MEV(row, 'mousedown', 10, 5);
    MEV(row, 'mouseup', 10, 5);
    ok(!row.classList.contains('tl-dragging'), '时间线：快速点击不进入拖动态');
    ok(tlOrder().join('|') === before.join('|'), '时间线：快速点击不改变顺序');

    /* 长按成立前就移动 → 判为划选，取消拾起 */
    row = $('.timeline .tl-item');
    MEV(row, 'mousedown', 10, 5);
    MEV(row, 'mousemove', 10, 60);
    await new Promise(r => setTimeout(r, 450));
    ok(!row.classList.contains('tl-dragging'), '时间线：长按成立前移动则取消拾起');
    MEV(row, 'mouseup', 10, 60);
    ok(tlOrder().join('|') === before.join('|'), '时间线：取消拾起后顺序不变');

    /* 完整长按拖动 */
    stubRects();
    row = $('.timeline .tl-item');
    const movedId = row.dataset.id;
    MEV(row, 'mousedown', 10, 5);
    await new Promise(r => setTimeout(r, 450));
    ok(row.classList.contains('tl-dragging'), '时间线：长按 350ms 后进入拖动态');
    ok($('.timeline').classList.contains('tl-reordering'), '时间线：容器进入排序态');
    ok(document.body.classList.contains('no-select'), '时间线：拖动中禁用文字划选');

    /* 拖到第 3 行中线（top=80）以下 → 应换位到其后 */
    MEV(row, 'mousemove', 10, 105);
    ok(tlDom()[0] !== movedId, '时间线：拖动过程中实时换位（松手前已见预览）');

    MEV(row, 'mouseup', 10, 105);
    const after = tlOrder();
    ok(after.length === before.length, '时间线：拖动后事件总数不变');
    ok(after.join('|') !== before.join('|'), '时间线：松开后数据顺序已更新');
    ok(after.indexOf(movedId) > 0, '时间线：被拖事件已离开首位（现为第 ' + (after.indexOf(movedId) + 1) + ' 位）');
    ok(before.every(y => after.includes(y)), '时间线：拖动未丢失任何事件');
    ok(!$$('.timeline .tl-item').some(el => el.classList.contains('tl-dragging')), '时间线：松开后清除拖动态');
    ok(!$('.timeline').classList.contains('tl-reordering'), '时间线：松开后容器退出排序态');
    ok(!document.body.classList.contains('no-select'), '时间线：松开后恢复文字划选');
    ok(tlDom().join('|') === after.join('|'), '时间线：重渲染后 DOM 与数据顺序一致');

    /* 新顺序应当落盘 */
    evalJS('saveLibrary()');
    const tlSnap = JSON.parse(window.localStorage.getItem('ml-books'));
    ok(tlSnap.books[0].timeline.map(t => t.year).join('|') === after.join('|'), '时间线：新顺序已写入本地存储');

    /* 搜索过滤时禁止拖动，避免打乱被隐藏的条目。
       用首行自身的完整检索串作关键词，保证首行必然命中、其余行必然被隐藏 */
    const soloKey = $('.timeline .tl-item').dataset.search;
    $('#searchInput').value = soloKey;
    $('#searchInput').dispatchEvent(new window.Event('input', { bubbles: true }));
    ok($$('.timeline .tl-item.hidden').length === before.length - 1, '时间线：检索串仅保留一条可见事件');

    const orderUnderFilter = tlOrder();
    stubRects();
    const fRow = $$('.timeline .tl-item').find(el => !el.classList.contains('hidden'));
    MEV(fRow, 'mousedown', 10, 5);
    await new Promise(r => setTimeout(r, 450));
    ok(!fRow.classList.contains('tl-dragging'), '时间线：搜索过滤时不进入拖动态');
    MEV(fRow, 'mouseup', 10, 5);
    ok(tlOrder().join('|') === orderUnderFilter.join('|'), '时间线：搜索过滤时顺序不被改动');

    $('#searchInput').value = '';
    $('#searchInput').dispatchEvent(new window.Event('input', { bubbles: true }));
    ok($$('.timeline .tl-item.hidden').length === 0, '时间线：清空搜索后全部事件恢复可见');

    /* === 10. 正文图片 === */
    EV($('[data-module="chapters"]'), 'click');
    EV($('.chapter-row'), 'click');
    ok(!!$('#pageWrap .field-input'), '章节正文编辑区存在');
    /* 模拟选择图片文件（FileReader 异步 → 等待回调） */
    const file = new window.File(['hello'], 'shot.png', { type: 'image/png' });
    const fInput = $('#imgFileInput');
    Object.defineProperty(fInput, 'files', { value: [file], configurable: true });
    fInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
    const img = $('#pageWrap img.in-img');
    ok(!!img, '图片已插入正文');
    ok(img.src.startsWith('data:'), '图片以 dataURL 存储');
    /* 点击图片 → 工具条显示 */
    EV(img, 'click');
    ok($('#imgTools').style.display !== 'none', '点击图片显示工具条');
    const wBase = parseFloat(img.style.width) || 420;
    EV($('#imgTools [data-act="grow"]'), 'click');
    ok(parseFloat(img.style.width) === wBase + 20, '放大按钮调整大小');
    EV($('#imgTools [data-act="shrink"]'), 'click');
    ok(parseFloat(img.style.width) === wBase, '缩小按钮调整大小');
    EV($('#imgTools [data-act="rotate"]'), 'click');
    ok(img.style.transform === 'rotate(90deg)', '旋转 90°');
    EV($('#imgTools [data-act="rotate"]'), 'click');
    ok(img.style.transform === 'rotate(180deg)', '再旋转 90°');
    EV($('#imgTools [data-act="remove"]'), 'click');
    ok(!$('#pageWrap img.in-img'), '图片移除');
    ok($('#imgTools').style.display === 'none', '移除后工具条隐藏');
  } catch (e) {
    console.log('  ! 图片测试异常：' + e.message);
    fail++;
  }
  finish();
})();

/* ---------- 汇总 ---------- */
function finish() {
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (errors.length) {
    console.log('\n运行时错误：');
    errors.slice(0, 10).forEach(e => console.log('  ! ' + e));
    fail += errors.length;
  }
  process.exit(fail ? 1 : 0);
}
