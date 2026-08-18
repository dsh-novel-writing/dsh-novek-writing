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

/* 串联 data.js + app.js 后 eval（window.eval 的 const/let 不进 window，也不跨调用共享；
   因此在脚本末尾挂一个直接 eval 桥接，所有断言经由它读取脚本内的词法作用域） */
const src = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8')
  + '\nwindow.__ml = { get DATA(){ return DATA; }, get state(){ return state; }, MODULES, LIST_RENDERERS, evalIn: c => eval(c) };';
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

/* ---------- 7. 正文图片：插入 / 调整大小 / 旋转 / 移除 ---------- */
(async () => {
  try {
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
