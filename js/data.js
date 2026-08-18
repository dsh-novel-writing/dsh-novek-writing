/* ============================================================
 * 墨庐 · 小说创作工作台 — 书库数据
 * BOOKS：书库中的全部作品（每本书包含完整项目数据）
 * DATA：当前打开的作品，工作台直接读写它
 * 条目均为中性占位，正文内容留空，由用户在工作台内填写
 * ============================================================ */

const BOOKS = [
{
  id: 'b1',
  updated: '08-17 22:41',
  project: {
    name: '未命名作品',
    genre: '长篇',
    targetWords: 400000,
    lastSaved: '刚刚',
    dailyGoal: 2000
  },

  /* ---------- 卷 / 章节 ---------- */
  volumes: [
    {
      id: 'v1',
      title: '卷一',
      status: '修改中',
      chapters: [
        { id: 'c1',  title: '第一章', words: 0, status: '定稿',  edited: '08-17 22:41', related: ['人物一', '人物七'], body: [] },
        { id: 'c2',  title: '第二章', words: 0, status: '定稿',  edited: '08-16 19:02', related: ['人物五', '人物一'], body: [] },
        { id: 'c3',  title: '第三章', words: 0, status: '修改中',  edited: '08-15 16:30', related: ['人物二', '人物一'], body: [] },
        { id: 'c4',  title: '第四章', words: 0, status: '草稿',  edited: '08-14 09:12', related: ['人物一', '人物四'], body: [] }
      ]
    },
    {
      id: 'v2',
      title: '卷二',
      status: '写作中',
      chapters: [
        { id: 'c5',  title: '第五章', words: 0, status: '修改中',  edited: '08-13 21:44', related: ['人物二', '人物一', '人物四'], body: [] },
        { id: 'c6',  title: '第六章', words: 0, status: '写作中',  edited: '08-12 23:05', related: ['人物七', '人物一'], body: [] },
        { id: 'c7',  title: '第七章', words: 0, status: '草稿',  edited: '08-11 15:27', related: ['人物一', '人物六'], body: [] },
        { id: 'c8',  title: '第八章', words: 0, status: '未开始', edited: '—',         related: ['人物二', '人物三'], body: [] }
      ]
    },
    {
      id: 'v3',
      title: '卷三',
      status: '未开始',
      chapters: [
        { id: 'c9',  title: '第九章', words: 0, status: '未开始', edited: '—', related: ['人物一', '人物二'], body: [] },
        { id: 'c10', title: '第十章', words: 0, status: '未开始', edited: '—', related: ['人物三', '人物六'], body: [] },
        { id: 'c11', title: '第十一章', words: 0, status: '未开始', edited: '—', related: ['人物五', '人物二'], body: [] },
        { id: 'c12', title: '第十二章', words: 0, status: '未开始', edited: '—', related: ['人物一', '人物二', '人物六'], body: [] }
      ]
    }
  ],

  /* ---------- 人物 ---------- */
  characters: [
    { id: 'p1', name: '人物一', role: '主角',     age: 32, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p2', label: '盟友',     type: 'main' },
        { with: 'p4', label: '旧识',     type: 'dark' },
        { with: 'p3', label: '亦敌亦友', type: 'main' },
        { with: 'p7', label: '线人',     type: 'sub' }
      ] },
    { id: 'p2', name: '人物二', role: '主角',     age: 29, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p1', label: '盟友', type: 'main' },
        { with: 'p5', label: '旧友', type: 'sub' },
        { with: 'p6', label: '隔阂', type: 'dark' }
      ] },
    { id: 'p3', name: '人物三', role: '重要配角', age: 41, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p1', label: '亦敌亦友', type: 'main' },
        { with: 'p6', label: '施压',     type: 'dark' },
        { with: 'p5', label: '同僚',     type: 'sub' },
        { with: 'p4', label: '旧识',     type: 'dark' }
      ] },
    { id: 'p4', name: '人物四', role: '配角',     age: 33, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p1', label: '旧识', type: 'dark' },
        { with: 'p8', label: '收养', type: 'main' },
        { with: 'p3', label: '旧识', type: 'dark' }
      ] },
    { id: 'p5', name: '人物五', role: '配角',     age: 35, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p2', label: '旧友', type: 'sub' },
        { with: 'p3', label: '同僚', type: 'sub' }
      ] },
    { id: 'p6', name: '人物六', role: '反派',     age: 58, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p3', label: '施压', type: 'dark' },
        { with: 'p2', label: '隔阂', type: 'dark' },
        { with: 'p7', label: '旧识', type: 'dark' }
      ] },
    { id: 'p7', name: '人物七', role: '配角',     age: 63, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p1', label: '线人', type: 'sub' },
        { with: 'p6', label: '旧识', type: 'dark' }
      ] },
    { id: 'p8', name: '人物八', role: '配角',     age: 12, identity: '', tagline: '', desc: '',
      relations: [
        { with: 'p4', label: '收养', type: 'main' }
      ] }
  ],

  /* ---------- 世界观 ---------- */
  world: [
    { id: 'w1', type: '地理', title: '条目一', summary: '', body: '', related: '' },
    { id: 'w2', type: '自然', title: '条目二', summary: '', body: '', related: '' },
    { id: 'w3', type: '组织', title: '条目三', summary: '', body: '', related: '' },
    { id: 'w4', type: '机构', title: '条目四', summary: '', body: '', related: '' },
    { id: 'w5', type: '机构', title: '条目五', summary: '', body: '', related: '' },
    { id: 'w6', type: '文化', title: '条目六', summary: '', body: '', related: '' }
  ],

  /* ---------- 设定（分区） ---------- */
  settingsGroups: [
    { name: '核心规则', items: [
      { term: '规则一', tag: '规则', def: '' },
      { term: '规则二', tag: '规则', def: '' }
    ] },
    { name: '历史大事', items: [
      { term: '事件一', tag: '史实', def: '' },
      { term: '事件二', tag: '史实', def: '' },
      { term: '事件三', tag: '史实', def: '' },
      { term: '事件四', tag: '史实', def: '' }
    ] }
  ],

  /* ---------- 剧情线 ---------- */
  plotlines: [
    { id: 'p1', name: '剧情线一', type: '主线', progress: 70, chapters: '', note: '' },
    { id: 'p2', name: '剧情线二', type: '支线', progress: 45, chapters: '', note: '' },
    { id: 'p3', name: '剧情线三', type: '支线', progress: 30, chapters: '', note: '' },
    { id: 'p4', name: '剧情线四', type: '暗线', progress: 20, chapters: '', note: '' },
    { id: 'p5', name: '剧情线五', type: '支线', progress: 15, chapters: '', note: '' }
  ],

  /* ---------- 时间线 ---------- */
  timeline: [
    { year: '1937-11-02', title: '事件一', type: '背景', desc: '' },
    { year: '1937-11-09', title: '事件二', type: '背景', desc: '' },
    { year: '1941-03-12', title: '事件三', type: '背景', desc: '' },
    { year: '1952-05-01', title: '事件四', type: '背景', desc: '' },
    { year: '1957-11-23', title: '事件五', type: '背景', desc: '' },
    { year: '1958-12-21', title: '事件六', type: '文化', desc: '' },
    { year: '1960-01-06', title: '事件七', type: '主线', desc: '' },
    { year: '1960-01-09', title: '事件八', type: '主线', desc: '' },
    { year: '1960-01-14', title: '事件九', type: '主线', desc: '' }
  ],

  /* ---------- 大纲树 ---------- */
  outline: [
    {
      id: 'o0', type: '楔子', title: '楔子', note: '',
      children: [
        { id: 'o0a', type: '节', title: '小节一', note: '' },
        { id: 'o0b', type: '节', title: '小节二', note: '' },
        { id: 'o0c', type: '节', title: '小节三', note: '' }
      ]
    },
    {
      id: 'o1', type: '卷', title: '卷一', note: '',
      children: [
        { id: 'o1a', type: '主线', title: '主线节点一', note: '' },
        { id: 'o1b', type: '支线', title: '支线节点一', note: '' }
      ]
    },
    {
      id: 'o2', type: '卷', title: '卷二', note: '',
      children: [
        { id: 'o2a', type: '主线', title: '主线节点二', note: '' },
        { id: 'o2b', type: '暗线', title: '暗线节点一', note: '' },
        { id: 'o2c', type: '钩子', title: '钩子节点', note: '' }
      ]
    },
    {
      id: 'o3', type: '卷', title: '卷三', note: '',
      children: [
        { id: 'o3a', type: '主线', title: '主线节点三', note: '' },
        { id: 'o3b', type: '收束', title: '收束节点', note: '' }
      ]
    }
  ],

  /* ---------- 场景 ---------- */
  scenes: [
    { id: 's1', title: '场景一', type: '过渡', place: '未指定', chapter: '第一章', chars: ['人物七', '人物一'], mood: '', words: 2000, desc: '' },
    { id: 's2', title: '场景二', type: '过渡', place: '未指定', chapter: '第五章', chars: ['p2'], mood: '', words: 1000, desc: '' },
    { id: 's3', title: '场景三', type: '过渡', place: '未指定', chapter: '第三章', chars: ['p1'], mood: '', words: 1500, desc: '' },
    { id: 's4', title: '场景四', type: '过渡', place: '未指定', chapter: '第四章', chars: ['p4', 'p8'], mood: '', words: 1200, desc: '' },
    { id: 's5', title: '场景五', type: '过渡', place: '未指定', chapter: '第五章', chars: ['p1', 'p2', 'p4'], mood: '', words: 2500, desc: '' },
    { id: 's6', title: '场景六', type: '过渡', place: '未指定', chapter: '第二章', chars: ['p5', 'p3'], mood: '', words: 800, desc: '' }
  ],

  /* ---------- 资料库 ---------- */
  library: [
    { group: '地名考据', items: [
      { term: '条目一', tag: '资料', def: '' },
      { term: '条目二', tag: '资料', def: '' },
      { term: '条目三', tag: '资料', def: '' },
      { term: '条目四', tag: '资料', def: '' }
    ] },
    { group: '机构沿革', items: [
      { term: '条目一', tag: '资料', def: '' },
      { term: '条目二', tag: '资料', def: '' }
    ] },
    { group: '物件档案', items: [
      { term: '条目一', tag: '资料', def: '' },
      { term: '条目二', tag: '资料', def: '' },
      { term: '条目三', tag: '资料', def: '' },
      { term: '条目四', tag: '资料', def: '' }
    ] },
    { group: '行业术语', items: [
      { term: '条目一', tag: '资料', def: '' },
      { term: '条目二', tag: '资料', def: '' },
      { term: '条目三', tag: '资料', def: '' }
    ] }
  ],

  /* ---------- 笔记 ---------- */
  notes: [
    { id: 'n1', title: '笔记一', tag: '伏笔追踪', date: '08-17', excerpt: '' },
    { id: 'n2', title: '笔记二', tag: '人物',     date: '08-16', excerpt: '' },
    { id: 'n3', title: '笔记三', tag: '考据',     date: '08-14', excerpt: '' },
    { id: 'n4', title: '笔记四', tag: '结构',     date: '08-12', excerpt: '' },
    { id: 'n5', title: '笔记五', tag: '灵感',     date: '08-10', excerpt: '' }
  ],

  /* ---------- 素材库 ---------- */
  materials: [
    { group: '意象图片', type: 'image', items: [
      { name: '素材一', tag: '图片', meta: 'jpg · 2048×1536', time: '08-09' },
      { name: '素材二', tag: '图片', meta: 'jpg · 扫描件', time: '08-07' },
      { name: '素材三', tag: '图片', meta: 'jpg · 局部特写', time: '08-05' }
    ] },
    { group: '文字摘录', type: 'text', items: [
      { name: '摘录一', tag: '摘录', meta: '摘录 · 笔记', time: '08-11' },
      { name: '摘录二', tag: '摘录', meta: '笔记 · 整理', time: '08-03' },
      { name: '摘录三', tag: '摘录', meta: '摘录 · 汇总', time: '07-28' }
    ] },
    { group: '声音采集', type: 'audio', items: [
      { name: '素材一', tag: '声音', meta: 'mp3 · 00:42', time: '08-01' },
      { name: '素材二', tag: '声音', meta: 'mp3 · 01:17', time: '07-30' }
    ] }
  ],

  /* ---------- 人物关系图 ---------- */
  relations: {
    nodes: [
      { id: 'p1', x: 100, y: 84 },
      { id: 'p2', x: 322, y: 84 },
      { id: 'p4', x: 150, y: 208 },
      { id: 'p8', x: 78,  y: 322 },
      { id: 'p3', x: 268, y: 208 },
      { id: 'p5', x: 352, y: 300 },
      { id: 'p7', x: 196, y: 340 },
      { id: 'p6', x: 60,  y: 220 }
    ],
    links: [
      { a: 'p1', b: 'p2', label: '盟友',     type: 'main' },
      { a: 'p1', b: 'p4', label: '旧识',     type: 'dark' },
      { a: 'p1', b: 'p3', label: '亦敌亦友', type: 'main' },
      { a: 'p1', b: 'p7', label: '线人',     type: 'sub' },
      { a: 'p2', b: 'p5', label: '旧友',     type: 'sub' },
      { a: 'p2', b: 'p6', label: '隔阂',     type: 'dark' },
      { a: 'p3', b: 'p6', label: '施压',     type: 'dark' },
      { a: 'p3', b: 'p5', label: '同僚',     type: 'sub' },
      { a: 'p4', b: 'p8', label: '收养',     type: 'main' },
      { a: 'p6', b: 'p7', label: '旧识',     type: 'dark' }
    ]
  }
}];

/* 当前打开的作品（工作台直接读写） */
let DATA = BOOKS[0];
