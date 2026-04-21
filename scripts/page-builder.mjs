#!/usr/bin/env node
/**
 * page-builder.mjs
 * 从 markdown + frontmatter 自动生成符合 SKILL.md Step 6 UI 规范的自包含 HTML 页面。
 *
 * 用法：
 *   node scripts/page-builder.mjs docs/posts/2026-04-21-lithium-q1-earnings-surge.md
 *   node scripts/page-builder.mjs docs/posts/*.md        # 批量
 *   node scripts/page-builder.mjs --all                  # 扫描 docs/posts/ + examples/
 *
 * 输出：export/YYYY-MM-DD/NN-<slug>.html
 *
 * 可视化识别管道（注册表模式，按顺序命中）：
 *   显式标签：<!-- viz:<type> --> ... 数据块，优先级最高
 *   启发式：按以下顺序检测，首个命中即渲染
 *     1.  stat-grid     markdown 表格（3 列，行数 ≥ 2）
 *     2.  compare-table "A vs B" 或两列对照表格
 *     3.  podium        "冠军/亚军/季军"、"前三"、"第一/二/三"
 *     4.  layered-chain "上游/中游/下游" 或 "一级/二级/三级" 分层结构
 *     5.  period-cards  "短期/中期/长期" 或 "Q1/Q2/Q3" 阶段
 *     6.  timeline-h    "YYYY年X月：..." 或 "X月X日：..." 时间序列
 *     7.  card-grid     ①②③ 粗体编号列表
 *     8.  flow          "A → B → C" 流程箭头
 *     9.  pros-cons     "正向…反向…" 或 "利…弊…"
 *     10. progress-bars "XX：70%" 或 "XX 占比 ..." 百分比列表
 *     11. delta-bar     "XX +15%、YY -8%" 涨跌列表
 *     12. chips         "三/四项抓手：A、B、C"
 *     13. kpi-card      段首 "XX 达 N 亿" 大数字
 *     14. callout       段首 "关键判断：..." 或 "核心观点：..."
 *     15. text          回落纯文本段落
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================
// 20 子类色彩主题（对齐 SKILL.md Step 6.2）
// ============================================================
const THEMES = {
  '1A': { hero: ['#0c1e4e', '#1e3a8a', '#3b82f6'], accent: '#1e40af', soft: '#dbeafe', cat: '货币政策宽松', tag: '1A' },
  '1B': { hero: ['#0c4a6e', '#0369a1', '#0ea5e9'], accent: '#0369a1', soft: '#e0f2fe', cat: '财政政策扩张', tag: '1B' },
  '2A': { hero: ['#7c2d12', '#ea580c', '#fb923c'], accent: '#c2410c', soft: '#ffedd5', cat: '新兴产业重磅政策', tag: '2A' },
  '2B': { hero: ['#14532d', '#166534', '#22c55e'], accent: '#15803d', soft: '#dcfce7', cat: '传统产业救市政策', tag: '2B' },
  '3A': { hero: ['#1e293b', '#334155', '#64748b'], accent: '#334155', soft: '#f1f5f9', cat: '行业强监管打压', tag: '3A' },
  '3B': { hero: ['#1e3a8a', '#2563eb', '#60a5fa'], accent: '#1d4ed8', soft: '#dbeafe', cat: '资本市场制度利好', tag: '3B' },
  '4A': { hero: ['#111827', '#374151', '#b91c1c'], accent: '#991b1b', soft: '#fee2e2', cat: '地缘风险升级', tag: '4A' },
  '4B': { hero: ['#0f172a', '#1e293b', '#f59e0b'], accent: '#b45309', soft: '#fef3c7', cat: '地缘风险缓和', tag: '4B' },
  '5A': { hero: ['#422006', '#713f12', '#eab308'], accent: '#a16207', soft: '#fef9c3', cat: '关税加征/制裁升级', tag: '5A' },
  '5B': { hero: ['#083344', '#0e7490', '#06b6d4'], accent: '#0e7490', soft: '#cffafe', cat: '贸易豁免/协定利好', tag: '5B' },
  '6A': { hero: ['#7f1d1d', '#b91c1c', '#eab308'], accent: '#991b1b', soft: '#fef3c7', cat: '国内重大会议定调', tag: '6A' },
  '6B': { hero: ['#1e3a8a', '#3730a3', '#6366f1'], accent: '#3730a3', soft: '#e0e7ff', cat: '美联储/海外央行会议', tag: '6B' },
  '7A': { hero: ['#18181b', '#27272a', '#84cc16'], accent: '#65a30d', soft: '#ecfccb', cat: 'AI/芯片/算力突破', tag: '7A' },
  '7B': { hero: ['#064e3b', '#059669', '#6ee7b7'], accent: '#047857', soft: '#d1fae5', cat: '新能源/生物医药突破', tag: '7B' },
  '8A': { hero: ['#0f172a', '#475569', '#f87171'], accent: '#b91c1c', soft: '#fee2e2', cat: '自然灾害/重大事故', tag: '8A' },
  '8B': { hero: ['#0f172a', '#475569', '#f87171'], accent: '#b91c1c', soft: '#fee2e2', cat: '公共卫生突发事件', tag: '8B' },
  '9A': { hero: ['#042f2e', '#0f766e', '#14b8a6'], accent: '#0f766e', soft: '#ccfbf1', cat: '美股暴跌传导', tag: '9A' },
  '9B': { hero: ['#0c1e4e', '#2563eb', '#93c5fd'], accent: '#1d4ed8', soft: '#dbeafe', cat: '人民币汇率大幅波动', tag: '9B' },
  '10A': { hero: ['#431407', '#9a3412', '#f97316'], accent: '#9a3412', soft: '#ffedd5', cat: '原油价格暴涨/暴跌', tag: '10A' },
  '10B': { hero: ['#0f766e', '#10b981', '#a7f3d0'], accent: '#047857', soft: '#d1fae5', cat: '工业金属/贵金属异动', tag: '10B' },
};

// ============================================================
// Frontmatter & Body 解析
// ============================================================
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]+)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  m[1].split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i === -1) return;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    val = val.replace(/^["']|["']$/g, '');
    fm[key] = val;
  });
  return { fm, body: m[2] };
}

function parseBody(body) {
  // 一个 section = 一个 **XXX**：... 直到下一个 **标题** 或 === 或 --- 为止
  const sections = [];
  const reSection = /(?:^|\n)\*\*([^*\n]+?)\*\*\s*[：:]\s*([\s\S]+?)(?=\n\s*\n?\*\*[^*\n]+?\*\*\s*[：:]|\n\s*###\s|\n\s*---\s*\n|\n\s*\*本文|$)/g;
  let match;
  while ((match = reSection.exec(body)) !== null) {
    sections.push({
      title: match[1].trim(),
      content: match[2].trim().replace(/\n\s*\n$/, ''),
    });
  }

  // Sources
  const sources = [];
  const srcBlock = body.match(/###\s*Sources?\s*\n([\s\S]+?)(?=\n---|\*本文|$)/i);
  if (srcBlock) {
    const reSrc = /-\s*\[([^\]]+)\]\(([^)]+)\)/g;
    let sm;
    while ((sm = reSrc.exec(srcBlock[1])) !== null) {
      sources.push({ title: sm[1], url: sm[2] });
    }
  }
  return { sections, sources };
}

// ============================================================
// 可视化启发式识别
// ============================================================
function isRiskSection(title) {
  return /风险|局限|警示|Risk/i.test(title);
}

// 识别 ①②③ 粗体编号卡片
function extractNumberedCards(content) {
  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
  const reItem = new RegExp(`[${CIRCLED}]\\s*\\*\\*([^*\\n]+?)\\*\\*\\s*[：:]\\s*([^${CIRCLED}]+)`, 'g');
  const cards = [];
  let m;
  while ((m = reItem.exec(content)) !== null) {
    cards.push({
      title: m[1].trim(),
      desc: m[2].trim().replace(/[；;。]+$/, '').replace(/^[；;]+/, ''),
    });
  }
  return cards;
}

// 识别 Lead text（① 之前的引导句）
function extractLead(content) {
  const idx = content.search(/[①②③④⑤⑥⑦⑧⑨⑩]/);
  if (idx === -1) return content;
  return content.slice(0, idx).replace(/[——\-–]+$/, '').trim();
}

// 识别"抓手/要点"后的列表
function extractChips(content) {
  // 匹配 "三项抓手：A、B、C" 或 "可观察三项抓手：A；B；C"
  const m = content.match(/(?:三|四|五|六|七)(?:项|大|个)(?:抓手|要点|维度|方面|信号|条件|机会|方向|条款|亮点)[：:]\s*([^。\n]+)/);
  if (!m) return null;
  const items = m[1].split(/[、；;,，]/).map(s => s.trim().replace(/^\*\*|\*\*$/g, '')).filter(Boolean);
  return items.length >= 2 ? items : null;
}

// 识别流程："A → B → C" 或 "A到B到C"
function extractFlow(content) {
  // 查找 "XX → YY → ZZ" 模式（允许中间 2-4 个步骤）
  const m = content.match(/([\w\d\u4e00-\u9fa5]{2,12})\s*[→⇒>]\s*([\w\d\u4e00-\u9fa5]{2,12})\s*[→⇒>]\s*([\w\d\u4e00-\u9fa5]{2,12})(?:\s*[→⇒>]\s*([\w\d\u4e00-\u9fa5]{2,12}))?/);
  if (!m) return null;
  return [m[1], m[2], m[3], m[4]].filter(Boolean);
}

// 识别 markdown 表格（stat grid 来源）
function extractTable(content) {
  const m = content.match(/\|([^\n|]+)\|([^\n|]+)\|([^\n|]*)\|?\s*\n\s*\|[\s\-:|]+\|\s*\n((?:\s*\|[^\n]+\|\s*\n?)+)/);
  if (!m) return null;
  const headers = [m[1], m[2], m[3]].map(s => s.trim()).filter(Boolean);
  const bodyLines = m[4].trim().split('\n');
  const rows = bodyLines.map(line => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return cells;
  });
  return { headers, rows };
}

// 提取最突出的数字 highlight（如 "17—20 亿"）— 保留接口占位，stat 当前由 markdown table 触发
function extractStats(content, limit = 4) {
  const units = '万|亿|％|%|GWh|MW|kg|吨|倍|颗|家|次|元|美元';
  const re = new RegExp(`(?:\\*\\*)?(\\d+(?:\\.\\d+)?(?:[—~至]\\d+(?:\\.\\d+)?)?[+\\-]?(?:${units})?)(?:\\*\\*)?`, 'g');
  const stats = [];
  let m;
  while ((m = re.exec(content)) !== null && stats.length < limit) {
    const raw = m[1];
    if (!/\d/.test(raw) || raw.length < 2) continue;
    stats.push(raw);
  }
  return stats;
}

// ============================================================
// 新增启发式组件识别
// ============================================================

// podium：冠军 / 亚军 / 季军 / 前三
function extractPodium(content) {
  const re = /(冠军|亚军|季军|第一名?|第二名?|第三名?)\s*[:：]?\s*\*?\*?([^\n，,。；;]+)/g;
  const items = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    items.push({ rank: m[1].replace(/名$/, ''), label: m[2].trim().replace(/\*\*/g, '') });
  }
  if (items.length < 3) return null;
  // 归一化顺序：第一/冠军 → 1, 第二/亚军 → 2, 第三/季军 → 3
  const order = { '冠军': 1, '第一': 1, '亚军': 2, '第二': 2, '季军': 3, '第三': 3 };
  const ranked = items.map(x => ({ ...x, n: order[x.rank] || 99 }))
    .sort((a, b) => a.n - b.n).slice(0, 3);
  return ranked.length === 3 ? ranked : null;
}

// layered-chain：上游 / 中游 / 下游 或 一级 / 二级 / 三级
function extractLayeredChain(content) {
  const layerKeys = ['上游', '中游', '下游'];
  const found = [];
  for (const key of layerKeys) {
    // 匹配 "**上游**：内容" 或 "上游：内容"
    const re = new RegExp(`\\*?\\*?${key}\\*?\\*?\\s*[:：]\\s*([^\\n]+?)(?=\\s*\\*?\\*?(?:上游|中游|下游)\\*?\\*?\\s*[:：]|$)`);
    const m = content.match(re);
    if (m) found.push({ key, desc: m[1].trim().replace(/[；;。]+$/, '') });
  }
  return found.length === 3 ? found : null;
}

// period-cards：短期 / 中期 / 长期 or Q1/Q2/Q3
function extractPeriodCards(content) {
  // 优先匹配 "短期：...；中期：...；长期：..."
  const stages = ['短期', '中期', '长期'];
  const found = [];
  for (const key of stages) {
    const re = new RegExp(`${key}\\s*[:：]\\s*([^；;。\\n]+)`);
    const m = content.match(re);
    if (m) found.push({ key, desc: m[1].trim() });
  }
  if (found.length === 3) return found;
  // 回落：Q1/Q2/Q3
  const qtr = [];
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
    const re = new RegExp(`${q}\\s*[:：]\\s*([^；;。\\n]+)`);
    const m = content.match(re);
    if (m) qtr.push({ key: q, desc: m[1].trim() });
  }
  return qtr.length >= 3 ? qtr : null;
}

// timeline-h：横向时间事件
function extractTimelineH(content) {
  const re = /(\d{4}年\d{1,2}月(?:\d{1,2}日)?|\d{1,2}月\d{1,2}日)\s*[:：]\s*([^\n；;]+)/g;
  const items = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    items.push({ date: m[1], desc: m[2].trim().replace(/[，,。]+$/, '') });
  }
  return items.length >= 2 ? items : null;
}

// pros-cons：正向 / 反向 or 利好 / 利空
function extractProsCons(content) {
  const posRe = /(?:正向|利好|支撑因素|积极因素)\s*[:：]\s*([^\n]+?)(?=\s*(?:反向|利空|压制因素|风险因素|消极因素)|$)/;
  const negRe = /(?:反向|利空|压制因素|风险因素|消极因素)\s*[:：]\s*([^\n]+)/;
  const pos = content.match(posRe);
  const neg = content.match(negRe);
  if (!pos || !neg) return null;
  const splitItems = s => s.split(/[；;、]/).map(x => x.trim()).filter(Boolean);
  return {
    pros: splitItems(pos[1].trim()),
    cons: splitItems(neg[1].trim()),
  };
}

// progress-bars：XX 70% 或 XX：70%
function extractProgress(content) {
  const re = /\*?\*?([^\n*\d，,：:；;%％]{2,14})\*?\*?\s*[：:]?\s*(\d{1,3}(?:\.\d+)?)\s*[%％]/g;
  const items = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const pct = parseFloat(m[2]);
    if (pct > 100) continue;
    items.push({ label: m[1].trim(), pct });
  }
  return items.length >= 2 && items.length <= 6 ? items : null;
}

// delta-bar：XX +15%、YY -8% 涨跌幅列表
function extractDeltaBars(content) {
  const re = /([^\s\d，,、；;：:%％+\-]{2,12})\s*([+\-]\s*\d{1,3}(?:\.\d+)?)\s*[%％]/g;
  const items = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const pct = parseFloat(m[2].replace(/\s/g, ''));
    items.push({ label: m[1].trim().replace(/\*\*/g, ''), pct });
  }
  return items.length >= 3 && items.length <= 8 ? items : null;
}

// compare-table：A vs B 二栏对照
function extractCompare(content) {
  // markdown 两列表 + 表头含 "对比/对照/vs"
  const m = content.match(/\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*\n\s*\|[\s\-:|]+\|\s*\n((?:\s*\|[^\n]+\|\s*\n?)+)/);
  if (!m) return null;
  // 只接受两列的场景
  const firstRow = m[3].split('\n')[0];
  const colCount = firstRow.split('|').filter(s => s.trim()).length;
  if (colCount !== 2) return null;
  const headers = [m[1].trim(), m[2].trim()];
  const rows = m[3].trim().split('\n').map(line => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return cells;
  });
  return { headers, rows };
}

// kpi-card：段首突出大数字（"XX 达 XX 亿" 开头）
function extractKpi(content) {
  const m = content.match(/^([^\n：:，,]{2,18})\s*(达|至|为|升至|突破|创|录得|录)\s*(\d+(?:\.\d+)?(?:[—~至\-]\d+(?:\.\d+)?)?)\s*(亿|万亿|万|％|%|GWh|MW|吨|倍|美元|元|家|次)/);
  if (!m) return null;
  return {
    label: m[1].trim(),
    value: m[3] + m[4],
    trailing: content.slice(m[0].length).replace(/^[，,。；;\s]+/, ''),
  };
}

// callout：关键判断 / 核心观点 提示框
function extractCallout(content) {
  const m = content.match(/^\s*\*?\*?(关键判断|核心观点|机构共识|主流观点|简要结论)\*?\*?\s*[：:]\s*([^\n]+)/);
  if (!m) return null;
  return {
    label: m[1],
    text: m[2].trim(),
    trailing: content.slice(m[0].length).replace(/^[\s，,；;]+/, ''),
  };
}

// highlight-num：孤立超大单一数字（夺冠成绩 / 单项记录）
function extractHighlight(content) {
  // 必须带显式 viz:highlight-num 标签，避免误杀，但也支持短句 "XX 成绩：1:05:12" 模式
  const m = content.match(/^\s*\*?\*?([^\n：:，,*]{2,18})\*?\*?\s*[：:]\s*\*?\*?(\d+[:：]\d+(?::\d+)?|\d+(?:\.\d+)?\s*(?:秒|分钟|小时|公里|米|分|名|次|个|项))\*?\*?/);
  if (!m) return null;
  return {
    label: m[1].trim(),
    value: m[2].trim(),
    trailing: content.slice(m[0].length).replace(/^[\s，,；;。]+/, ''),
  };
}

// hierarchy-tree：一级/二级分支
function extractHierarchy(content) {
  // 一级：X → 子项A、子项B；一级：Y → 子项C、子项D
  const re = /(?:^|\n)(?:\*?\*?一级|大类|主类)\*?\*?\s*[:：]\s*([^→\n]+?)(?:→|\s+)([^；;\n]+?)(?=\n|；|;|$)/g;
  const branches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const kids = m[2].split(/[、，,]/).map(s => s.trim()).filter(Boolean);
    branches.push({ parent: m[1].trim(), kids });
  }
  return branches.length >= 2 ? branches : null;
}

// matrix-2x2：四象限，显式触发 <!-- viz:matrix-2x2 -->，数据格式："象限1：XX；象限2：YY；..."
function extractMatrix(content) {
  const quads = ['象限1', '象限2', '象限3', '象限4'];
  const found = [];
  for (const q of quads) {
    const re = new RegExp(`${q}\\s*[:：]\\s*([^；;。\\n]+)`);
    const m = content.match(re);
    if (m) found.push({ key: q, desc: m[1].trim() });
  }
  return found.length === 4 ? found : null;
}

// vs-panel：A vs B 双栏详情（非 table），格式："**A方**：...；**B方**：..."
function extractVsPanel(content) {
  const m = content.match(/\*\*([^*\n]{2,18})\*\*\s*[：:]\s*([^\n]+?)(?=\s*\*\*([^*\n]{2,18})\*\*\s*[：:]\s*([^\n]+))/);
  // 回落更简易的抓取
  const re = /\*\*([^*\n]{2,18})\*\*\s*[：:]\s*([^\n]+?)(?=(?:\s*\*\*[^*\n]{2,18}\*\*\s*[：:])|$)/g;
  const pairs = [];
  let x;
  while ((x = re.exec(content)) !== null) {
    pairs.push({ side: x[1].trim(), desc: x[2].trim().replace(/[；;。]+$/, '') });
  }
  // 仅在"vs/对比/PK"关键词出现时触发，避免与其他解析冲突
  if (pairs.length !== 2) return null;
  if (!/\bvs\b|对比|PK|对照|对垒/i.test(content)) return null;
  return pairs;
}

// timeline-v：垂直时间轴，需要 3+ 带日期条目
function extractTimelineV(content) {
  // 复用 timeline-h 的识别，差别在渲染
  return extractTimelineH(content);
}

// tag-cloud：6+ 标签云，显式触发
function extractTagCloud(content) {
  // 格式："标签云：A、B、C、D、E、F" 或 "关键词：..."
  const m = content.match(/(?:标签|关键词|热词|概念)\s*[:：]\s*([^\n。]+)/);
  if (!m) return null;
  const tags = m[1].split(/[、，,；;]/).map(s => s.trim()).filter(Boolean);
  return tags.length >= 5 ? tags : null;
}

// pie-chart / donut：饼图 / 环形图（共用，由 name 区分）
// 格式（仅显式触发）："A 40%；B 30%；C 20%；D 10%"
function extractPie(content) {
  const re = /([^\n\d，,、；;：:%％]{2,14})\s*(\d{1,3}(?:\.\d+)?)\s*[%％]/g;
  const items = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    items.push({ label: m[1].trim().replace(/\*\*/g, ''), pct: parseFloat(m[2]) });
  }
  const sum = items.reduce((a, b) => a + b.pct, 0);
  if (items.length < 2 || items.length > 8) return null;
  if (sum < 80 || sum > 120) return null;
  return items;
}

// bar-chart：条形图，格式："A +12%；B +8%；C -3%" 或 "A：120；B：80"
function extractBar(content) {
  // 同 delta-bar，但通过 viz:bar-chart 显式选用；此处复用 delta detect
  return extractDeltaBars(content);
}

// sparkline：趋势线，格式 "10, 12, 15, 14, 18" 纯数字序列
function extractSparkline(content) {
  const m = content.match(/(?:趋势|走势|近.+日|近.+周|数据)\s*[:：]\s*([\d.,\s]+)/);
  if (!m) return null;
  const nums = m[1].split(/[,，\s]+/).map(s => parseFloat(s)).filter(n => !isNaN(n));
  return nums.length >= 4 ? nums : null;
}

// heatmap：热力图，格式需表格 "| 板块 | W1 | W2 | W3 |"
function extractHeatmap(content) {
  const m = content.match(/\|([^\n|]+)\|([^\n|]+)\|([^\n|]+)\|([^\n|]+)\|?\s*\n\s*\|[\s\-:|]+\|\s*\n((?:\s*\|[^\n]+\|\s*\n?)+)/);
  if (!m) return null;
  const headers = [m[1], m[2], m[3], m[4]].map(s => s.trim());
  const rows = m[5].trim().split('\n').map(line => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return cells;
  });
  // 检查数据列是否多为百分比/数字
  const dataCells = rows.flatMap(r => r.slice(1));
  const numRatio = dataCells.filter(c => /[+\-]?\d/.test(c)).length / Math.max(dataCells.length, 1);
  if (numRatio < 0.6) return null;
  return { headers, rows };
}

// quote-block：官方表态引用
function extractQuote(content) {
  const m = content.match(/["""]([^"""]{8,120})["""]\s*[—–-]*\s*([^\n]{2,30})?/);
  if (!m) return null;
  return { text: m[1].trim(), source: (m[2] || '').trim() };
}

// scenario：三情景（乐观/中性/悲观）
function extractScenario(content) {
  const keys = ['乐观', '中性', '悲观', '基准', '看多', '看空'];
  const found = {};
  for (const key of keys) {
    const re = new RegExp(`${key}\\s*(?:情景|场景|情形|假设)?\\s*[:：]\\s*([^；;。\\n]+)`);
    const m = content.match(re);
    if (m) found[key] = m[1].trim();
  }
  const vals = Object.entries(found).map(([k, v]) => ({ key: k, desc: v }));
  return vals.length === 3 ? vals : null;
}

// venn：三圈交集（政策 × 产业 × 资金）
function extractVenn(content) {
  // 严格显式触发，格式："圈A：XX；圈B：YY；圈C：ZZ；交集：WW"
  const sets = {};
  for (const k of ['圈A', '圈B', '圈C', '交集']) {
    const re = new RegExp(`${k}\\s*[:：]\\s*([^；;。\\n]+)`);
    const m = content.match(re);
    if (m) sets[k] = m[1].trim();
  }
  if (!sets.圈A || !sets.圈B || !sets.圈C) return null;
  return sets;
}

// map-tag：地域分布
function extractMapTag(content) {
  const regions = ['长三角', '珠三角', '京津冀', '成渝', '粤港澳', '中部', '西部', '东北', '海外', '华南', '华北', '华东'];
  const found = [];
  for (const r of regions) {
    const re = new RegExp(`\\*?\\*?${r}\\*?\\*?\\s*[:：]\\s*([^；;。\\n]+)`);
    const m = content.match(re);
    if (m) found.push({ region: r, desc: m[1].trim() });
  }
  return found.length >= 3 ? found : null;
}

// ============================================================
// 显式 viz 标签解析
// ============================================================
function parseExplicitViz(content) {
  const m = content.match(/<!--\s*viz:([a-z\-]+)\s*-->/);
  if (!m) return null;
  return m[1];
}

// ============================================================
// HTML 渲染 · 注册表模式
// ============================================================
const VIZ_REGISTRY = [
  // A · 数据展示族
  { name: 'stat-grid',     detect: extractTable,         render: renderStatGrid,     minRows: 2 },
  { name: 'compare-table', detect: extractCompare,       render: renderCompareTable },
  { name: 'kpi-card',      detect: extractKpi,           render: renderKpiCard },
  { name: 'highlight-num', detect: extractHighlight,     render: renderHighlight,    explicitOnly: true },
  { name: 'delta-bar',     detect: extractDeltaBars,     render: renderDeltaBars },
  // B · 关系/结构族
  { name: 'card-grid',     detect: extractNumberedCards, render: renderCardGrid,     minLen: 2 },
  { name: 'layered-chain', detect: extractLayeredChain,  render: renderLayeredChain },
  { name: 'hierarchy-tree',detect: extractHierarchy,     render: renderHierarchy,    explicitOnly: true },
  { name: 'matrix-2x2',    detect: extractMatrix,        render: renderMatrix,       explicitOnly: true },
  { name: 'vs-panel',      detect: extractVsPanel,       render: renderVsPanel },
  // C · 时序/流程族
  { name: 'flow',          detect: extractFlow,          render: renderFlow },
  { name: 'timeline-h',    detect: extractTimelineH,     render: renderTimelineH },
  { name: 'timeline-v',    detect: extractTimelineV,     render: renderTimelineV,    explicitOnly: true },
  { name: 'period-cards',  detect: extractPeriodCards,   render: renderPeriodCards },
  { name: 'podium',        detect: extractPodium,        render: renderPodium },
  // D · 信号/标签族
  { name: 'chips',         detect: extractChips,         render: renderChips },
  { name: 'pros-cons',     detect: extractProsCons,      render: renderProsCons },
  { name: 'progress-bars', detect: extractProgress,      render: renderProgress },
  { name: 'callout',       detect: extractCallout,       render: renderCallout },
  { name: 'tag-cloud',     detect: extractTagCloud,      render: renderTagCloud,     explicitOnly: true },
  // E · 图表族（SVG，全部显式触发）
  { name: 'pie-chart',     detect: extractPie,           render: renderPieChart,     explicitOnly: true },
  { name: 'donut',         detect: extractPie,           render: renderDonut,        explicitOnly: true },
  { name: 'bar-chart',     detect: extractBar,           render: renderBarChart,     explicitOnly: true },
  { name: 'sparkline',     detect: extractSparkline,     render: renderSparkline,    explicitOnly: true },
  { name: 'heatmap',       detect: extractHeatmap,       render: renderHeatmap,      explicitOnly: true },
  // F · 特殊族
  { name: 'quote-block',   detect: extractQuote,         render: renderQuote,        explicitOnly: true },
  { name: 'scenario',      detect: extractScenario,      render: renderScenario },
  { name: 'venn',          detect: extractVenn,          render: renderVenn,         explicitOnly: true },
  { name: 'map-tag',       detect: extractMapTag,        render: renderMapTag,       explicitOnly: true },
];

function renderFloorBody(content) {
  // 优先：显式标签 <!-- viz:xxx -->
  const explicit = parseExplicitViz(content);
  if (explicit) {
    const comp = VIZ_REGISTRY.find(c => c.name === explicit);
    if (comp) {
      const cleanContent = content.replace(/<!--\s*viz:[a-z\-]+\s*-->\s*/, '');
      const data = comp.detect(cleanContent);
      if (data && !(comp.minRows && data.rows && data.rows.length < comp.minRows)
              && !(comp.minLen && Array.isArray(data) && data.length < comp.minLen)) {
        return comp.render(cleanContent, data);
      }
    }
  }

  // 启发式：遍历注册表，首个命中即用（跳过 explicitOnly）
  for (const comp of VIZ_REGISTRY) {
    if (comp.explicitOnly) continue;
    const data = comp.detect(content);
    if (!data) continue;
    if (comp.minRows && data.rows && data.rows.length < comp.minRows) continue;
    if (comp.minLen && Array.isArray(data) && data.length < comp.minLen) continue;
    return comp.render(content, data);
  }

  // 回落纯文本
  return `<p class="floor-body">${formatInline(content)}</p>`;
}

// ============================================================
// 组件渲染函数
// ============================================================
function renderStatGrid(content, table) {
  const preTable = content.split(/\|/)[0].trim();
  return `
    ${preTable ? `<p class="floor-lead">${formatInline(preTable)}</p>` : ''}
    <div class="stat-grid">
      ${table.rows.map(r => `
        <div class="stat">
          <div class="stat-value">${escape(r[1] || '')}</div>
          <div class="stat-label">${escape(r[0] || '')}</div>
          ${r[2] ? `<div class="stat-delta">${escape(r[2])}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

function renderCompareTable(content, data) {
  const preTable = content.split(/\|/)[0].trim();
  return `
    ${preTable ? `<p class="floor-lead">${formatInline(preTable)}</p>` : ''}
    <div class="compare-table">
      <div class="compare-head">
        <div class="compare-head-cell compare-a">${escape(data.headers[0])}</div>
        <div class="compare-divider">vs</div>
        <div class="compare-head-cell compare-b">${escape(data.headers[1])}</div>
      </div>
      ${data.rows.map(r => `
        <div class="compare-row">
          <div class="compare-cell">${formatInline(r[0] || '')}</div>
          <div class="compare-cell">${formatInline(r[1] || '')}</div>
        </div>`).join('')}
    </div>`;
}

function renderPodium(content, items) {
  // 从内容中剥离 podium 文本（保留其他上下文）
  const order = [items[1], items[0], items[2]]; // 银/金/铜 排列
  return `
    <div class="podium">
      ${order.map((x, idx) => `
        <div class="podium-step podium-${idx === 1 ? 'gold' : (idx === 0 ? 'silver' : 'bronze')}">
          <div class="podium-rank">${escape(x.rank)}</div>
          <div class="podium-label">${formatInline(x.label)}</div>
        </div>`).join('')}
    </div>`;
}

function renderLayeredChain(content, layers) {
  return `
    <div class="layered-chain">
      ${layers.map((l, i) => `
        <div class="chain-layer chain-layer-${i + 1}">
          <div class="chain-key">${escape(l.key)}</div>
          <div class="chain-desc">${formatInline(l.desc)}</div>
        </div>`).join('')}
    </div>`;
}

function renderPeriodCards(content, periods) {
  return `
    <div class="period-cards">
      ${periods.map((p, i) => `
        <div class="period-card">
          <div class="period-key">${escape(p.key)}</div>
          <div class="period-desc">${formatInline(p.desc)}</div>
        </div>`).join('')}
    </div>`;
}

function renderTimelineH(content, items) {
  return `
    <div class="timeline-h">
      ${items.map((x, i) => `
        <div class="tl-node">
          <div class="tl-dot"></div>
          <div class="tl-date">${escape(x.date)}</div>
          <div class="tl-desc">${formatInline(x.desc)}</div>
        </div>`).join('')}
    </div>`;
}

function renderCardGrid(content, cards) {
  const lead = extractLead(content);
  const tail = afterNumberedContent(content);
  return `
    ${lead ? `<p class="floor-lead">${formatInline(lead)}</p>` : ''}
    <div class="card-grid">
      ${cards.map((c, i) => `
        <div class="mini-card">
          <span class="mini-card-num">${i + 1}</span>
          <div class="mini-card-body">
            <p class="mini-card-title">${formatInline(c.title)}</p>
            <p class="mini-card-desc">${formatInline(c.desc)}</p>
          </div>
        </div>`).join('')}
    </div>
    ${tail ? `<p class="floor-tail">${formatInline(tail)}</p>` : ''}`;
}

function renderFlow(content, flow) {
  const lead = content.split(/[→⇒>]/)[0].trim().replace(/[——\-–]+$/, '').trim();
  return `
    ${lead ? `<p class="floor-lead">${formatInline(lead)}</p>` : ''}
    <div class="flow">
      ${flow.map((step, i) => `
        <div class="flow-step">${escape(step)}</div>
        ${i < flow.length - 1 ? '<div class="flow-arrow">→</div>' : ''}`).join('')}
    </div>`;
}

function renderProsCons(content, pc) {
  return `
    <div class="pros-cons">
      <div class="pc-col pc-pros">
        <div class="pc-title">正向因素</div>
        <ul>${pc.pros.map(s => `<li>${formatInline(s)}</li>`).join('')}</ul>
      </div>
      <div class="pc-col pc-cons">
        <div class="pc-title">反向因素</div>
        <ul>${pc.cons.map(s => `<li>${formatInline(s)}</li>`).join('')}</ul>
      </div>
    </div>`;
}

function renderProgress(content, items) {
  const max = Math.max(...items.map(x => x.pct), 100);
  return `
    <div class="progress-bars">
      ${items.map(x => `
        <div class="pb-row">
          <div class="pb-label">${escape(x.label)}</div>
          <div class="pb-track"><div class="pb-fill" style="width:${(x.pct / max * 100).toFixed(1)}%"></div></div>
          <div class="pb-pct">${x.pct}%</div>
        </div>`).join('')}
    </div>`;
}

function renderDeltaBars(content, items) {
  const max = Math.max(...items.map(x => Math.abs(x.pct)));
  return `
    <div class="delta-bars">
      ${items.map(x => {
        const pos = x.pct >= 0;
        const w = (Math.abs(x.pct) / max * 50).toFixed(1);
        return `
        <div class="db-row">
          <div class="db-label">${escape(x.label)}</div>
          <div class="db-track">
            <div class="db-axis"></div>
            <div class="db-fill db-${pos ? 'pos' : 'neg'}" style="width:${w}%; ${pos ? 'left:50%' : `right:50%`}"></div>
          </div>
          <div class="db-pct db-${pos ? 'pos' : 'neg'}">${pos ? '+' : ''}${x.pct}%</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderChips(content, chips) {
  const beforeChips = content.replace(/(?:三|四|五|六|七)(?:项|大|个)(?:抓手|要点|维度|方面|信号|条件|机会|方向|条款|亮点)[：:][^。\n]+/, '').trim();
  return `
    ${beforeChips ? `<p class="floor-body">${formatInline(beforeChips)}</p>` : ''}
    <div class="chips">
      ${chips.map((s, i) => `<span class="chip"><span class="chip-num">${i + 1}</span>${escape(s)}</span>`).join('')}
    </div>`;
}

function renderKpiCard(content, k) {
  // 从 trailing 推断方向：+X% 为上 / -X% 为下
  const dirMatch = (k.trailing || '').match(/([+\-])\s*(\d{1,3}(?:\.\d+)?)\s*[%％]/);
  let arrow = '', deltaClass = '', deltaText = '';
  if (dirMatch) {
    const up = dirMatch[1] === '+';
    arrow = up ? '↑' : '↓';
    deltaClass = up ? 'kpi-up' : 'kpi-down';
    deltaText = `${dirMatch[1]}${dirMatch[2]}%`;
  }
  return `
    <div class="kpi-card">
      <div class="kpi-body">
        <div class="kpi-label">${escape(k.label)}</div>
        <div class="kpi-value">${escape(k.value)}</div>
        ${arrow ? `<div class="kpi-delta ${deltaClass}"><span class="kpi-arrow">${arrow}</span>${deltaText}</div>` : ''}
      </div>
    </div>
    ${k.trailing ? `<p class="floor-body" style="margin-top:14px">${formatInline(k.trailing)}</p>` : ''}`;
}

// ============================================================
// 新增 15 组件渲染函数
// ============================================================

// A · highlight-num：孤立超大单一数字
function renderHighlight(content, h) {
  return `
    <div class="highlight-num">
      <div class="highlight-value">${escape(h.value)}</div>
      <div class="highlight-label">${escape(h.label)}</div>
    </div>
    ${h.trailing ? `<p class="floor-body" style="margin-top:14px">${formatInline(h.trailing)}</p>` : ''}`;
}

// B · hierarchy-tree：层级树
function renderHierarchy(content, branches) {
  return `
    <div class="hierarchy">
      ${branches.map(b => `
        <div class="hier-branch">
          <div class="hier-parent">${escape(b.parent)}</div>
          <div class="hier-kids">
            ${b.kids.map(k => `<span class="hier-kid">${escape(k)}</span>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

// B · matrix-2x2：四象限
function renderMatrix(content, quads) {
  return `
    <div class="matrix-2x2">
      ${quads.map((q, i) => `
        <div class="matrix-cell matrix-q${i + 1}">
          <div class="matrix-key">${escape(q.key)}</div>
          <div class="matrix-desc">${formatInline(q.desc)}</div>
        </div>`).join('')}
    </div>`;
}

// B · vs-panel：双栏详情对照
function renderVsPanel(content, pairs) {
  return `
    <div class="vs-panel">
      <div class="vs-side vs-a">
        <div class="vs-side-title">${escape(pairs[0].side)}</div>
        <div class="vs-side-desc">${formatInline(pairs[0].desc)}</div>
      </div>
      <div class="vs-divider">vs</div>
      <div class="vs-side vs-b">
        <div class="vs-side-title">${escape(pairs[1].side)}</div>
        <div class="vs-side-desc">${formatInline(pairs[1].desc)}</div>
      </div>
    </div>`;
}

// C · timeline-v：垂直时间轴
function renderTimelineV(content, items) {
  return `
    <div class="timeline-v">
      ${items.map((x, i) => `
        <div class="tv-node">
          <div class="tv-side">
            <div class="tv-dot"></div>
            ${i < items.length - 1 ? '<div class="tv-line"></div>' : ''}
          </div>
          <div class="tv-body">
            <div class="tv-date">${escape(x.date)}</div>
            <div class="tv-desc">${formatInline(x.desc)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

// D · tag-cloud：标签云
function renderTagCloud(content, tags) {
  // 根据索引给不同大小以形成视觉节奏
  const sizes = ['tc-lg', 'tc-md', 'tc-sm', 'tc-md', 'tc-lg', 'tc-sm', 'tc-md'];
  return `
    <div class="tag-cloud">
      ${tags.map((t, i) => `<span class="tc-tag ${sizes[i % sizes.length]}">${escape(t)}</span>`).join('')}
    </div>`;
}

// E · pie-chart：SVG 饼图
function renderPieChart(content, items) {
  const total = items.reduce((a, b) => a + b.pct, 0);
  const palette = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  let start = 0;
  const slices = items.map((it, i) => {
    const angle = (it.pct / total) * 360;
    const end = start + angle;
    const largeArc = angle > 180 ? 1 : 0;
    const r = 90;
    const cx = 100, cy = 100;
    const sx = cx + r * Math.cos(Math.PI * (start - 90) / 180);
    const sy = cy + r * Math.sin(Math.PI * (start - 90) / 180);
    const ex = cx + r * Math.cos(Math.PI * (end - 90) / 180);
    const ey = cy + r * Math.sin(Math.PI * (end - 90) / 180);
    const d = `M${cx},${cy} L${sx.toFixed(2)},${sy.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${ex.toFixed(2)},${ey.toFixed(2)} Z`;
    start = end;
    return `<path d="${d}" fill="${palette[i % palette.length]}" stroke="#fff" stroke-width="1.5"/>`;
  }).join('');
  const legend = items.map((it, i) => `
    <div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${palette[i % palette.length]}"></span>
      <span class="chart-legend-label">${escape(it.label)}</span>
      <span class="chart-legend-pct">${it.pct}%</span>
    </div>`).join('');
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 200 200" class="chart-svg">${slices}</svg>
      <div class="chart-legend">${legend}</div>
    </div>`;
}

// E · donut：环形图
function renderDonut(content, items) {
  const total = items.reduce((a, b) => a + b.pct, 0);
  const palette = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  const r = 75, cx = 100, cy = 100, circ = 2 * Math.PI * r;
  let acc = 0;
  const arcs = items.map((it, i) => {
    const frac = it.pct / total;
    const dash = frac * circ;
    const offset = -acc;
    acc += dash;
    return `<circle r="${r}" cx="${cx}" cy="${cy}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="22" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join('');
  const legend = items.map((it, i) => `
    <div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${palette[i % palette.length]}"></span>
      <span class="chart-legend-label">${escape(it.label)}</span>
      <span class="chart-legend-pct">${it.pct}%</span>
    </div>`).join('');
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 200 200" class="chart-svg">
        ${arcs}
        <text x="100" y="95" text-anchor="middle" font-family="var(--font-display)" font-size="14" fill="#64748b">总计</text>
        <text x="100" y="115" text-anchor="middle" font-family="var(--font-mono)" font-size="20" font-weight="700" fill="var(--accent)">${total.toFixed(0)}%</text>
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>`;
}

// E · bar-chart：条形图（SVG 水平条）
function renderBarChart(content, items) {
  const max = Math.max(...items.map(x => Math.abs(x.pct)));
  const barW = 280, barH = 22, gap = 10;
  const totalH = items.length * (barH + gap);
  const bars = items.map((it, i) => {
    const pos = it.pct >= 0;
    const w = (Math.abs(it.pct) / max * (barW / 2 - 10)).toFixed(1);
    const x = pos ? barW / 2 : barW / 2 - w;
    const y = i * (barH + gap);
    const color = pos ? '#10b981' : '#ef4444';
    return `
      <text x="${barW / 2 - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" fill="#64748b" font-family="var(--font-cn)">${escape(it.label)}</text>
      <rect x="${x}" y="${y}" width="${w}" height="${barH}" fill="${color}" rx="3"/>
      <text x="${pos ? (parseFloat(x) + parseFloat(w) + 4) : (parseFloat(x) - 4)}" y="${y + barH / 2 + 4}" text-anchor="${pos ? 'start' : 'end'}" font-size="11" font-weight="600" fill="${color}" font-family="var(--font-mono)">${it.pct >= 0 ? '+' : ''}${it.pct}%</text>`;
  }).join('');
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${barW} ${totalH}" class="chart-svg chart-bar">
        <line x1="${barW/2}" y1="0" x2="${barW/2}" y2="${totalH}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3"/>
        ${bars}
      </svg>
    </div>`;
}

// E · sparkline：迷你趋势线
function renderSparkline(content, nums) {
  const min = Math.min(...nums), max = Math.max(...nums);
  const w = 300, h = 60;
  const step = w / (nums.length - 1);
  const pts = nums.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - (v - min) / (max - min || 1) * (h - 10) - 5).toFixed(1);
    return `${x},${y}`;
  });
  const path = `M${pts.join(' L')}`;
  const areaPath = `${path} L${w},${h} L0,${h} Z`;
  return `
    <div class="sparkline-wrap">
      <svg viewBox="0 0 ${w} ${h}" class="sparkline-svg" preserveAspectRatio="none">
        <path d="${areaPath}" fill="var(--accent-bg)" opacity="0.6"/>
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${pts[pts.length-1].split(',')[0]}" cy="${pts[pts.length-1].split(',')[1]}" r="4" fill="var(--accent)"/>
      </svg>
      <div class="sparkline-meta">
        <span class="sparkline-min">最低 ${min}</span>
        <span class="sparkline-max">最高 ${max}</span>
        <span class="sparkline-last">当前 ${nums[nums.length - 1]}</span>
      </div>
    </div>`;
}

// E · heatmap：热力图
function renderHeatmap(content, data) {
  // 第一列为行标签，其余为数值格
  const allVals = data.rows.flatMap(r => r.slice(1)).map(c => {
    const n = parseFloat((c || '').replace('%', '').replace(/[+\-]/, ''));
    return isNaN(n) ? 0 : n;
  });
  const max = Math.max(...allVals, 1);
  const heatColor = v => {
    const n = parseFloat((v || '').replace('%', '').replace(/[+\-]/, '')) || 0;
    const intensity = Math.min(n / max, 1);
    const isNeg = /^-/.test(v || '');
    if (isNeg) return `rgba(239, 68, 68, ${intensity * 0.75 + 0.1})`;
    return `rgba(16, 185, 129, ${intensity * 0.75 + 0.1})`;
  };
  return `
    <div class="heatmap">
      <div class="hm-row hm-header">
        ${data.headers.map((h, i) => `<div class="hm-cell ${i === 0 ? 'hm-row-label' : ''}">${escape(h)}</div>`).join('')}
      </div>
      ${data.rows.map(r => `
        <div class="hm-row">
          ${r.map((c, i) => i === 0
            ? `<div class="hm-cell hm-row-label">${escape(c)}</div>`
            : `<div class="hm-cell hm-data" style="background:${heatColor(c)}">${escape(c)}</div>`
          ).join('')}
        </div>`).join('')}
    </div>`;
}

// F · quote-block：官方引用
function renderQuote(content, q) {
  return `
    <blockquote class="quote-block">
      <div class="quote-mark">&ldquo;</div>
      <div class="quote-text">${formatInline(q.text)}</div>
      ${q.source ? `<div class="quote-source">— ${escape(q.source)}</div>` : ''}
    </blockquote>`;
}

// F · scenario：三情景
function renderScenario(content, items) {
  const order = { '乐观': 1, '看多': 1, '中性': 2, '基准': 2, '悲观': 3, '看空': 3 };
  const classMap = { 1: 'sc-bull', 2: 'sc-base', 3: 'sc-bear' };
  const sorted = items.map(x => ({ ...x, rank: order[x.key] || 99 })).sort((a, b) => a.rank - b.rank);
  return `
    <div class="scenario">
      ${sorted.map(s => `
        <div class="sc-cell ${classMap[s.rank] || ''}">
          <div class="sc-key">${escape(s.key)}</div>
          <div class="sc-desc">${formatInline(s.desc)}</div>
        </div>`).join('')}
    </div>`;
}

// F · venn：三圈交集
function renderVenn(content, sets) {
  return `
    <div class="venn">
      <svg viewBox="0 0 280 220" class="venn-svg">
        <circle cx="100" cy="90" r="70" fill="rgba(37,99,235,0.35)" stroke="#2563eb" stroke-width="1.5"/>
        <circle cx="180" cy="90" r="70" fill="rgba(245,158,11,0.35)" stroke="#f59e0b" stroke-width="1.5"/>
        <circle cx="140" cy="150" r="70" fill="rgba(16,185,129,0.35)" stroke="#10b981" stroke-width="1.5"/>
      </svg>
      <div class="venn-labels">
        <div class="venn-set"><span class="venn-dot" style="background:#2563eb"></span>${escape(sets.圈A)}</div>
        <div class="venn-set"><span class="venn-dot" style="background:#f59e0b"></span>${escape(sets.圈B)}</div>
        <div class="venn-set"><span class="venn-dot" style="background:#10b981"></span>${escape(sets.圈C)}</div>
        ${sets.交集 ? `<div class="venn-center">核心交集：${escape(sets.交集)}</div>` : ''}
      </div>
    </div>`;
}

// F · map-tag：地域分布
function renderMapTag(content, regions) {
  return `
    <div class="map-tag">
      ${regions.map(r => `
        <div class="mt-item">
          <div class="mt-pin">📍</div>
          <div class="mt-body">
            <div class="mt-region">${escape(r.region)}</div>
            <div class="mt-desc">${formatInline(r.desc)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderCallout(content, co) {
  return `
    <div class="callout">
      <div class="callout-tag">${escape(co.label)}</div>
      <div class="callout-text">${formatInline(co.text)}</div>
    </div>
    ${co.trailing ? `<p class="floor-body" style="margin-top:12px">${formatInline(co.trailing)}</p>` : ''}`;
}

function afterNumberedContent(content) {
  // 提取 ⑤ 或最后一个 ① 后再接 "以上仅为..." 这类尾注
  const m = content.match(/(?:以上[^\n]+|综上[^\n]+|不涉及[^\n]+|具体以[^\n]+)/);
  return m ? m[0].trim() : '';
}

function renderRiskFloor(section, idx, color) {
  const items = parseRiskItems(section.content);
  return `
  <section class="floor floor-risk" style="animation-delay: ${0.15 + idx * 0.1}s;">
    <div class="floor-head">
      <span class="floor-num floor-num-risk">${idx + 1}</span>
      <h2 class="floor-title">${escape(section.title)}</h2>
      <span class="floor-tag floor-tag-risk">需留意</span>
    </div>
    <ul class="risk-list">
      ${items.map((item, i) => `
      <li class="risk-item"><span class="risk-item-num">${i + 1}</span>${formatInline(item)}</li>`).join('')}
    </ul>
  </section>`;
}

function parseRiskItems(content) {
  return content
    .replace(/\s+/g, ' ')
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]\s*/g, '\n')
    .replace(/\s*[;；]\s*/g, '\n')
    .split('\n').map(s => s.trim()).filter(Boolean);
}

function renderHTML({ fm, sections, sources }) {
  const catCode = (fm.category || '').split('-')[0].trim() || '1A';
  const theme = THEMES[catCode] || THEMES['1A'];
  const riskSection = sections.find(s => isRiskSection(s.title));
  const bodySections = sections.filter(s => !isRiskSection(s.title));
  const floors = bodySections.slice(0, 5);
  const floorTags = ['方案速览', '主体拆解', '传导观察', '节奏/周期', '信号梳理'];

  const title = fm.title || '未命名解读';
  const subtitle = fm.subtitle || '';
  const eventDate = fm.event_date || fm.publish_date || '';
  const publishDate = fm.publish_date || '';
  const wordCount = fm.word_count || '';

  const floorsHTML = floors.map((s, i) => `
  <section class="floor floor-${i + 1}" style="animation-delay: ${0.15 + i * 0.1}s;">
    <div class="floor-head">
      <span class="floor-num">${i + 1}</span>
      <h2 class="floor-title">${escape(s.title)}</h2>
      <span class="floor-tag">${floorTags[i] || ''}</span>
    </div>
    ${renderFloorBody(s.content)}
  </section>`).join('');

  const riskHTML = riskSection
    ? renderRiskFloor(riskSection, floors.length, theme.accent)
    : '';

  const sourcesHTML = sources.length ? `
    <p class="sources-title">信息来源</p>
    <ul class="sources-list">
      ${sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${escape(s.title)}</a></li>`).join('')}
    </ul>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=JetBrains+Mono:wght@500;700&display=swap');
  :root {
    --text: #0f172a;
    --muted: #64748b;
    --border: #e2e8f0;
    --bg: #f8fafc;
    --card: #ffffff;
    --hero-1: ${theme.hero[0]};
    --hero-2: ${theme.hero[1]};
    --hero-3: ${theme.hero[2]};
    --accent: ${theme.accent};
    --accent-bg: ${theme.soft};
    --risk: #dc2626;
    --risk-bg: #fef2f2;
    --font-cn: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif;
    --font-display: "Fraunces", "Source Han Serif SC", "Noto Serif SC", Georgia, serif;
    --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  body {
    margin: 0; padding: 0;
    font-family: var(--font-cn);
    background:
      radial-gradient(at 85% 10%, ${hexA(theme.accent, 0.08)} 0%, transparent 50%),
      radial-gradient(at 15% 90%, ${hexA(theme.hero[2], 0.08)} 0%, transparent 50%),
      var(--bg);
    color: var(--text);
    line-height: 1.75;
    font-size: 16px;
    letter-spacing: 0.01em;
  }
  .page { max-width: 760px; margin: 0 auto; padding: 28px 18px 56px; }

  /* ============ Hero ============ */
  .hero {
    background:
      radial-gradient(circle at 85% 15%, rgba(255,255,255,0.18) 0%, transparent 55%),
      linear-gradient(135deg, var(--hero-1) 0%, var(--hero-2) 55%, var(--hero-3) 100%);
    color: #fff;
    border-radius: 20px;
    padding: 34px 28px 30px 28px;
    margin-bottom: 18px;
    box-shadow: 0 14px 40px ${hexA(theme.hero[1], 0.35)};
    position: relative;
    overflow: hidden;
    animation: rise 0.6s ease-out 0.05s both;
  }
  .hero::before {
    content: "";
    position: absolute; inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'><filter id='n'><feTurbulence baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.07 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    mix-blend-mode: overlay; opacity: 0.55; pointer-events: none;
  }
  .hero > * { position: relative; z-index: 1; }
  .hero-badge {
    display: inline-block;
    background: rgba(255,255,255,0.22);
    backdrop-filter: blur(6px);
    color: #fff;
    font-size: 11.5px;
    font-family: var(--font-mono);
    padding: 5px 13px;
    border-radius: 999px;
    margin-bottom: 18px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .hero-title {
    font-family: var(--font-display);
    font-size: 30px; font-weight: 600;
    line-height: 1.3;
    margin: 0 0 12px;
    letter-spacing: -0.01em;
  }
  .hero-subtitle {
    font-size: 15.5px;
    color: rgba(255,255,255,0.92);
    font-weight: 400;
    margin: 0 0 18px;
    line-height: 1.7;
    max-width: 90%;
  }
  .hero-meta {
    display: flex; gap: 18px;
    font-size: 11.5px;
    font-family: var(--font-mono);
    color: rgba(255,255,255,0.72);
    flex-wrap: wrap;
    padding-top: 14px;
    border-top: 1px dashed rgba(255,255,255,0.22);
  }

  /* ============ Floor ============ */
  .floor {
    background: var(--card);
    border-radius: 16px;
    padding: 22px 24px 20px;
    margin-bottom: 14px;
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.04);
    border: 1px solid var(--border);
    opacity: 0;
    animation: rise 0.55s ease-out both;
    position: relative;
  }
  .floor:nth-child(even) { transform: translateX(6px); }
  .floor:nth-child(odd)  { transform: translateX(-3px); }
  .floor-head {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px dashed var(--border);
  }
  .floor-num {
    width: 30px; height: 30px;
    border-radius: 9px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    font-family: var(--font-mono);
    color: #fff;
    background: var(--accent);
    box-shadow: 0 2px 6px ${hexA(theme.accent, 0.25)};
  }
  .floor-num-risk { background: var(--risk); box-shadow: 0 2px 6px rgba(220,38,38,0.25); }
  .floor-title {
    font-family: var(--font-display);
    font-size: 18px; font-weight: 600;
    color: var(--text);
    margin: 0;
    flex: 1;
  }
  .floor-tag {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 5px;
    font-weight: 500;
    font-family: var(--font-mono);
    background: var(--accent-bg);
    color: var(--accent);
  }
  .floor-tag-risk { background: var(--risk-bg); color: var(--risk); }
  .floor-lead {
    font-size: 14.5px;
    color: var(--muted);
    line-height: 1.75;
    margin: 0 0 14px;
  }
  .floor-body, .floor-tail {
    font-size: 15px;
    color: #334155;
    line-height: 1.85;
    margin: 0;
    text-align: justify;
  }
  .floor-tail { margin-top: 12px; font-size: 12.5px; color: var(--muted); font-style: italic; }
  .floor-body strong, .floor-lead strong {
    color: var(--accent);
    font-weight: 600;
  }

  /* ============ Stat Grid · 大数字 ============ */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin: 6px 0 4px;
  }
  .stat {
    background: linear-gradient(135deg, var(--accent-bg) 0%, ${hexA(theme.accent, 0.06)} 100%);
    border-radius: 12px;
    padding: 14px 12px;
    text-align: center;
    border-left: 3px solid var(--accent);
  }
  .stat-value {
    font-family: var(--font-mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.2;
    letter-spacing: -0.01em;
  }
  .stat-label {
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 6px;
    font-weight: 500;
  }
  .stat-delta {
    font-size: 11.5px;
    color: #059669;
    font-family: var(--font-mono);
    margin-top: 4px;
    font-weight: 600;
  }

  /* ============ Card Grid · ①②③ 编号卡 ============ */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px;
    margin: 4px 0;
  }
  .mini-card {
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    background: var(--accent-bg);
    border-radius: 10px;
    border-left: 3px solid var(--accent);
  }
  .mini-card-num {
    flex-shrink: 0;
    background: var(--accent);
    color: #fff;
    width: 22px; height: 22px;
    border-radius: 6px;
    font-size: 12px; font-weight: 700;
    font-family: var(--font-mono);
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
  }
  .mini-card-body { flex: 1; }
  .mini-card-title {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--accent);
    margin: 0 0 4px;
  }
  .mini-card-desc {
    font-size: 13px;
    color: #334155;
    line-height: 1.7;
    margin: 0;
  }

  /* ============ Flow · 时间轴 ============ */
  .flow {
    display: flex; align-items: center;
    gap: 6px;
    background: var(--accent-bg);
    padding: 14px;
    border-radius: 12px;
    margin: 6px 0 4px;
    flex-wrap: wrap;
  }
  .flow-step {
    flex: 1; min-width: 80px;
    text-align: center;
    padding: 10px 8px;
    background: var(--card);
    border-radius: 8px;
    border: 1px solid ${hexA(theme.accent, 0.2)};
    font-size: 12.5px;
    font-weight: 600;
    color: var(--accent);
    font-family: var(--font-display);
  }
  .flow-arrow {
    color: var(--accent);
    font-weight: 700;
    font-size: 16px;
  }

  /* ============ Chips · 抓手列表 ============ */
  .chips {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin: 6px 0 4px;
  }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--accent-bg);
    color: var(--accent);
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid ${hexA(theme.accent, 0.2)};
  }
  .chip-num {
    background: var(--accent);
    color: #fff;
    width: 18px; height: 18px;
    border-radius: 50%;
    font-size: 10.5px;
    font-weight: 700;
    font-family: var(--font-mono);
    display: inline-flex;
    align-items: center; justify-content: center;
  }

  /* ============ Risk · 风险列表 ============ */
  .risk-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 9px; }
  .risk-item {
    display: flex; gap: 12px;
    padding: 11px 14px;
    background: var(--risk-bg);
    border-radius: 10px;
    border-left: 3px solid var(--risk);
    font-size: 14px;
    color: #7f1d1d;
    line-height: 1.7;
  }
  .risk-item-num {
    flex-shrink: 0;
    background: var(--risk);
    color: #fff;
    width: 22px; height: 22px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--font-mono);
    display: flex; align-items: center; justify-content: center;
  }

  /* ============ KPI Card · 带箭头方向 ============ */
  .kpi-card {
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--accent-bg) 0%, ${hexA(theme.accent, 0.1)} 100%);
    padding: 22px 20px; border-radius: 14px;
    border-left: 4px solid var(--accent);
  }
  .kpi-body { text-align: center; }
  .kpi-label { font-size: 12.5px; color: var(--muted); margin-bottom: 6px; letter-spacing: 0.05em; }
  .kpi-value {
    font-family: var(--font-mono);
    font-size: 28px; font-weight: 700;
    color: var(--accent); line-height: 1.15;
  }
  .kpi-delta {
    display: inline-flex; align-items: center; gap: 3px;
    margin-top: 8px;
    font-family: var(--font-mono);
    font-size: 13px; font-weight: 700;
    padding: 3px 10px; border-radius: 999px;
  }
  .kpi-up { color: #059669; background: rgba(16,185,129,0.12); }
  .kpi-down { color: #dc2626; background: rgba(239,68,68,0.12); }
  .kpi-arrow { font-size: 14px; }

  /* ============ Highlight Num · 超大单一数字 ============ */
  .highlight-num {
    text-align: center; padding: 26px 12px;
    background: linear-gradient(135deg, var(--hero-1) 0%, var(--hero-2) 100%);
    border-radius: 16px; color: #fff;
    box-shadow: 0 6px 20px ${hexA(theme.hero[1], 0.25)};
  }
  .highlight-value {
    font-family: var(--font-display);
    font-size: 48px; font-weight: 700;
    letter-spacing: -0.02em; line-height: 1;
  }
  .highlight-label {
    margin-top: 10px;
    font-size: 13px; opacity: 0.85;
    font-family: var(--font-mono); letter-spacing: 0.08em;
  }

  /* ============ Compare Table · 二栏对比 ============ */
  .compare-table {
    border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
    background: var(--card);
  }
  .compare-head {
    display: grid; grid-template-columns: 1fr auto 1fr;
    background: linear-gradient(90deg, ${hexA(theme.accent, 0.12)}, ${hexA(theme.hero[2], 0.12)});
    padding: 10px 0;
  }
  .compare-head-cell {
    text-align: center; font-weight: 700; padding: 6px 12px;
    font-family: var(--font-display); font-size: 14px; color: var(--accent);
  }
  .compare-divider {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--muted); padding: 8px 4px;
    border-left: 1px dashed var(--border); border-right: 1px dashed var(--border);
    align-self: center;
  }
  .compare-row {
    display: grid; grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--border);
  }
  .compare-cell {
    padding: 10px 14px; font-size: 13.5px; color: #334155;
    line-height: 1.7;
  }
  .compare-cell + .compare-cell { border-left: 1px dashed var(--border); }

  /* ============ VS Panel · 双栏详情 ============ */
  .vs-panel {
    display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px;
    align-items: stretch;
  }
  .vs-side {
    padding: 16px 18px; border-radius: 12px;
    background: var(--card); border: 1px solid var(--border);
  }
  .vs-a { border-left: 4px solid var(--accent); }
  .vs-b { border-left: 4px solid ${theme.hero[2]}; }
  .vs-side-title {
    font-weight: 700; font-size: 14px;
    margin-bottom: 8px; color: var(--accent);
    font-family: var(--font-display);
  }
  .vs-b .vs-side-title { color: ${theme.hero[2]}; }
  .vs-side-desc { font-size: 13px; color: #334155; line-height: 1.75; }
  .vs-divider {
    align-self: center; padding: 8px 10px;
    background: var(--accent); color: #fff;
    border-radius: 50%;
    font-family: var(--font-mono); font-size: 11px; font-weight: 700;
    width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  }

  /* ============ Layered Chain · 产业链上中下游 ============ */
  .layered-chain { display: grid; gap: 8px; }
  .chain-layer {
    display: grid; grid-template-columns: 60px 1fr;
    background: var(--accent-bg);
    border-radius: 10px;
    overflow: hidden;
    border-left: 3px solid var(--accent);
  }
  .chain-layer-1 { border-left-color: ${theme.hero[0]}; }
  .chain-layer-2 { border-left-color: ${theme.hero[1]}; }
  .chain-layer-3 { border-left-color: ${theme.hero[2]}; }
  .chain-key {
    background: var(--accent);
    color: #fff; font-weight: 700;
    padding: 10px 4px; text-align: center;
    font-family: var(--font-display); font-size: 13px;
    display: flex; align-items: center; justify-content: center;
  }
  .chain-layer-1 .chain-key { background: ${theme.hero[0]}; }
  .chain-layer-2 .chain-key { background: ${theme.hero[1]}; }
  .chain-layer-3 .chain-key { background: ${theme.hero[2]}; }
  .chain-desc {
    padding: 10px 14px; font-size: 13px; color: #334155; line-height: 1.7;
  }

  /* ============ Hierarchy Tree · 层级树 ============ */
  .hierarchy { display: grid; gap: 12px; }
  .hier-branch {
    padding: 12px 14px;
    background: var(--accent-bg); border-radius: 10px;
    border-left: 3px solid var(--accent);
  }
  .hier-parent {
    font-family: var(--font-display);
    font-weight: 700; font-size: 14px;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .hier-kids { display: flex; flex-wrap: wrap; gap: 6px; }
  .hier-kid {
    background: var(--card);
    padding: 4px 10px; border-radius: 6px;
    font-size: 12px; color: #334155;
    border: 1px solid ${hexA(theme.accent, 0.25)};
  }

  /* ============ Matrix 2x2 · 四象限 ============ */
  .matrix-2x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    position: relative;
  }
  .matrix-cell {
    padding: 16px 14px; border-radius: 10px;
    min-height: 90px; display: flex; flex-direction: column; gap: 6px;
  }
  .matrix-q1 { background: rgba(16,185,129,0.12); border-left: 3px solid #10b981; }
  .matrix-q2 { background: rgba(245,158,11,0.12); border-left: 3px solid #f59e0b; }
  .matrix-q3 { background: rgba(239,68,68,0.12); border-left: 3px solid #ef4444; }
  .matrix-q4 { background: rgba(59,130,246,0.12); border-left: 3px solid #3b82f6; }
  .matrix-key {
    font-family: var(--font-mono);
    font-size: 11px; font-weight: 700;
    color: var(--muted); letter-spacing: 0.1em;
  }
  .matrix-desc { font-size: 13px; color: #334155; line-height: 1.65; }

  /* ============ Timeline H · 水平时间轴 ============ */
  .timeline-h {
    display: flex; overflow-x: auto;
    padding: 16px 4px 12px; gap: 0;
    position: relative;
  }
  .timeline-h::before {
    content: ""; position: absolute;
    left: 20px; right: 20px; top: 28px;
    height: 2px;
    background: ${hexA(theme.accent, 0.3)};
    z-index: 0;
  }
  .tl-node {
    flex: 1; min-width: 130px;
    text-align: center; position: relative; z-index: 1;
  }
  .tl-dot {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--accent);
    margin: 0 auto 10px;
    box-shadow: 0 0 0 4px var(--card), 0 2px 6px ${hexA(theme.accent, 0.4)};
  }
  .tl-date {
    font-family: var(--font-mono); font-size: 11.5px;
    font-weight: 700; color: var(--accent);
    margin-bottom: 6px;
  }
  .tl-desc { font-size: 12px; color: #334155; line-height: 1.65; padding: 0 4px; }

  /* ============ Timeline V · 垂直时间轴 ============ */
  .timeline-v { padding: 6px 2px 0; }
  .tv-node { display: grid; grid-template-columns: 30px 1fr; gap: 12px; }
  .tv-side { position: relative; display: flex; flex-direction: column; align-items: center; }
  .tv-dot {
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--accent); margin-top: 4px;
    box-shadow: 0 0 0 3px var(--card), 0 2px 6px ${hexA(theme.accent, 0.3)};
    flex-shrink: 0;
  }
  .tv-line {
    width: 2px; flex: 1; margin-top: 4px;
    background: ${hexA(theme.accent, 0.3)};
    min-height: 20px;
  }
  .tv-body { padding-bottom: 18px; padding-top: 2px; }
  .tv-date {
    font-family: var(--font-mono); font-size: 12px;
    font-weight: 700; color: var(--accent); margin-bottom: 4px;
  }
  .tv-desc { font-size: 13.5px; color: #334155; line-height: 1.7; }

  /* ============ Period Cards · 短中长期 ============ */
  .period-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .period-card {
    padding: 14px 12px; border-radius: 12px;
    background: var(--accent-bg);
    border-top: 3px solid var(--accent);
    text-align: center;
  }
  .period-card:nth-child(1) { border-top-color: ${theme.hero[0]}; background: ${hexA(theme.hero[0], 0.08)}; }
  .period-card:nth-child(2) { border-top-color: ${theme.hero[1]}; background: ${hexA(theme.hero[1], 0.08)}; }
  .period-card:nth-child(3) { border-top-color: ${theme.hero[2]}; background: ${hexA(theme.hero[2], 0.1)}; }
  .period-key {
    font-family: var(--font-display);
    font-size: 14.5px; font-weight: 700;
    color: var(--accent); margin-bottom: 8px;
  }
  .period-desc { font-size: 12.5px; color: #334155; line-height: 1.7; }

  /* ============ Podium · 领奖台 ============ */
  .podium {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 8px; align-items: end;
  }
  .podium-step {
    border-radius: 12px 12px 4px 4px;
    padding: 14px 10px; text-align: center; color: #fff;
  }
  .podium-gold   { background: linear-gradient(135deg, #fbbf24, #f59e0b); min-height: 120px; }
  .podium-silver { background: linear-gradient(135deg, #cbd5e1, #94a3b8); min-height: 100px; }
  .podium-bronze { background: linear-gradient(135deg, #fcd34d, #d97706); min-height: 80px; }
  .podium-rank {
    font-family: var(--font-display); font-weight: 700;
    font-size: 18px; margin-bottom: 6px;
  }
  .podium-label { font-size: 12.5px; line-height: 1.5; }

  /* ============ Pros Cons · 正反对照 ============ */
  .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pc-col { padding: 14px 14px 12px; border-radius: 12px; }
  .pc-pros { background: rgba(16,185,129,0.08); border-left: 3px solid #10b981; }
  .pc-cons { background: rgba(239,68,68,0.08); border-left: 3px solid #ef4444; }
  .pc-title {
    font-family: var(--font-display); font-weight: 700;
    font-size: 13.5px; margin-bottom: 8px;
  }
  .pc-pros .pc-title { color: #059669; }
  .pc-cons .pc-title { color: #dc2626; }
  .pc-col ul { margin: 0; padding-left: 18px; }
  .pc-col li { font-size: 13px; color: #334155; line-height: 1.7; margin-bottom: 4px; }

  /* ============ Progress Bars · 进度条 ============ */
  .progress-bars { display: grid; gap: 10px; }
  .pb-row {
    display: grid; grid-template-columns: 100px 1fr 50px;
    align-items: center; gap: 10px;
  }
  .pb-label { font-size: 12.5px; color: #334155; font-weight: 600; }
  .pb-track {
    height: 10px; background: #e2e8f0; border-radius: 999px; overflow: hidden;
  }
  .pb-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), ${hexA(theme.hero[2], 0.8)});
    border-radius: 999px;
    transition: width 0.6s ease-out;
  }
  .pb-pct {
    font-family: var(--font-mono); font-size: 12px;
    font-weight: 700; color: var(--accent); text-align: right;
  }

  /* ============ Delta Bars · 涨跌幅横条 ============ */
  .delta-bars { display: grid; gap: 6px; }
  .db-row {
    display: grid; grid-template-columns: 80px 1fr 60px;
    align-items: center; gap: 10px;
  }
  .db-label { font-size: 12.5px; color: #334155; }
  .db-track {
    position: relative; height: 18px; background: ${hexA(theme.accent, 0.05)}; border-radius: 4px;
  }
  .db-axis {
    position: absolute; left: 50%; top: 0; bottom: 0;
    width: 1px; background: var(--muted); opacity: 0.4;
  }
  .db-fill {
    position: absolute; top: 2px; bottom: 2px;
    border-radius: 3px;
  }
  .db-pos { background: linear-gradient(90deg, rgba(16,185,129,0.5), #10b981); }
  .db-neg { background: linear-gradient(90deg, #ef4444, rgba(239,68,68,0.5)); }
  .db-pct {
    font-family: var(--font-mono); font-size: 12px;
    font-weight: 700; text-align: right;
  }
  .db-pct.db-pos { color: #059669; }
  .db-pct.db-neg { color: #dc2626; }

  /* ============ Callout · 关键判断框 ============ */
  .callout {
    display: grid; grid-template-columns: auto 1fr; gap: 12px;
    padding: 14px 16px;
    background: linear-gradient(90deg, ${hexA(theme.accent, 0.1)}, transparent);
    border-left: 4px solid var(--accent);
    border-radius: 10px;
    align-items: start;
  }
  .callout-tag {
    font-family: var(--font-mono);
    font-size: 10.5px; font-weight: 700;
    color: #fff; background: var(--accent);
    padding: 3px 10px; border-radius: 4px;
    letter-spacing: 0.05em; white-space: nowrap;
  }
  .callout-text {
    font-size: 14px; font-weight: 500;
    color: var(--text); line-height: 1.75;
  }

  /* ============ Tag Cloud · 标签云 ============ */
  .tag-cloud {
    display: flex; flex-wrap: wrap; gap: 6px 8px;
    padding: 8px 4px; align-items: center;
  }
  .tc-tag {
    padding: 5px 12px; border-radius: 999px;
    background: var(--accent-bg);
    color: var(--accent);
    border: 1px solid ${hexA(theme.accent, 0.25)};
    font-weight: 500;
  }
  .tc-sm { font-size: 11.5px; opacity: 0.75; }
  .tc-md { font-size: 13px; }
  .tc-lg { font-size: 15px; font-weight: 700; background: var(--accent); color: #fff; }

  /* ============ Chart · 饼图/环形/条形 ============ */
  .chart-wrap {
    display: grid; grid-template-columns: 200px 1fr; gap: 16px;
    align-items: center; padding: 8px 0;
  }
  .chart-svg { width: 200px; height: auto; }
  .chart-bar { width: 100%; }
  .chart-legend { display: grid; gap: 6px; }
  .chart-legend-item {
    display: grid; grid-template-columns: auto 1fr auto; gap: 10px;
    align-items: center; font-size: 13px;
  }
  .chart-legend-dot {
    width: 12px; height: 12px; border-radius: 3px;
    display: inline-block;
  }
  .chart-legend-label { color: #334155; }
  .chart-legend-pct {
    font-family: var(--font-mono); font-weight: 700; color: var(--accent);
  }

  /* ============ Sparkline · 迷你趋势 ============ */
  .sparkline-wrap {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: 12px 16px;
  }
  .sparkline-svg { width: 100%; height: 60px; }
  .sparkline-meta {
    display: flex; justify-content: space-between; gap: 10px;
    margin-top: 8px; padding-top: 8px;
    border-top: 1px dashed var(--border);
    font-family: var(--font-mono); font-size: 11px;
  }
  .sparkline-min { color: #dc2626; }
  .sparkline-max { color: #059669; }
  .sparkline-last { color: var(--accent); font-weight: 700; }

  /* ============ Heatmap · 热力图 ============ */
  .heatmap {
    display: grid; gap: 2px; background: var(--card);
    padding: 4px; border-radius: 10px;
    border: 1px solid var(--border);
  }
  .hm-row { display: grid; grid-template-columns: 1fr repeat(auto-fit, minmax(40px, 1fr)); gap: 2px; }
  .hm-header { font-weight: 700; color: var(--muted); font-size: 11px; }
  .hm-cell {
    padding: 8px 6px; text-align: center;
    font-size: 11.5px;
    border-radius: 4px;
    font-family: var(--font-mono);
  }
  .hm-row-label {
    text-align: left; font-weight: 600; color: #334155;
    font-family: var(--font-cn);
  }
  .hm-data { color: #064e3b; font-weight: 600; }

  /* ============ Quote Block · 官方引用 ============ */
  .quote-block {
    margin: 0; padding: 18px 20px 18px 44px;
    background: ${hexA(theme.accent, 0.06)};
    border-radius: 12px; position: relative;
    border-left: 3px solid var(--accent);
  }
  .quote-mark {
    position: absolute; left: 12px; top: 6px;
    font-family: var(--font-display);
    font-size: 44px; color: var(--accent);
    opacity: 0.5; line-height: 1;
  }
  .quote-text {
    font-family: var(--font-display);
    font-size: 15px; font-style: italic;
    color: var(--text); line-height: 1.75;
  }
  .quote-source {
    margin-top: 8px;
    font-family: var(--font-mono); font-size: 11.5px;
    color: var(--muted);
  }

  /* ============ Scenario · 三情景 ============ */
  .scenario { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .sc-cell {
    padding: 14px 12px; border-radius: 12px;
    border-top: 3px solid;
  }
  .sc-bull { background: rgba(16,185,129,0.08); border-top-color: #10b981; }
  .sc-base { background: rgba(59,130,246,0.08); border-top-color: #3b82f6; }
  .sc-bear { background: rgba(239,68,68,0.08); border-top-color: #ef4444; }
  .sc-key {
    font-family: var(--font-display);
    font-size: 14px; font-weight: 700;
    margin-bottom: 6px;
  }
  .sc-bull .sc-key { color: #059669; }
  .sc-base .sc-key { color: #2563eb; }
  .sc-bear .sc-key { color: #dc2626; }
  .sc-desc { font-size: 12.5px; color: #334155; line-height: 1.7; }

  /* ============ Venn · 三圈交集 ============ */
  .venn {
    display: grid; grid-template-columns: 280px 1fr; gap: 14px;
    align-items: center;
  }
  .venn-svg { width: 280px; }
  .venn-labels { display: grid; gap: 8px; }
  .venn-set {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: #334155;
  }
  .venn-dot {
    width: 14px; height: 14px; border-radius: 50%;
    display: inline-block; flex-shrink: 0;
  }
  .venn-center {
    margin-top: 6px; padding: 8px 12px;
    background: var(--accent-bg);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    font-size: 12.5px; color: var(--accent);
    font-weight: 600;
  }

  /* ============ Map Tag · 地域分布 ============ */
  .map-tag { display: grid; gap: 8px; }
  .mt-item {
    display: grid; grid-template-columns: 34px 1fr; gap: 10px;
    padding: 10px 14px;
    background: var(--accent-bg);
    border-radius: 10px;
    border-left: 3px solid var(--accent);
    align-items: center;
  }
  .mt-pin { font-size: 22px; }
  .mt-region {
    font-family: var(--font-display); font-weight: 700;
    color: var(--accent); font-size: 13.5px;
    margin-bottom: 2px;
  }
  .mt-desc { font-size: 12.5px; color: #334155; line-height: 1.65; }

  /* ============ Footer ============ */
  .footer {
    background: var(--card);
    border-radius: 16px;
    padding: 22px 24px;
    margin-top: 16px;
    border: 1px solid var(--border);
    animation: rise 0.55s ease-out 0.7s both;
    opacity: 0;
  }
  .sources-title {
    font-family: var(--font-display);
    font-size: 14.5px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 12px;
    display: flex; align-items: center; gap: 8px;
  }
  .sources-title::before {
    content: "";
    width: 4px; height: 16px;
    background: var(--accent);
    border-radius: 2px;
  }
  .sources-list { list-style: none; padding: 0; margin: 0; }
  .sources-list li {
    padding: 7px 0;
    font-size: 13px;
    border-bottom: 1px dashed var(--border);
  }
  .sources-list li:last-child { border-bottom: none; }
  .sources-list a { color: var(--accent); text-decoration: none; }
  .sources-list a:hover { text-decoration: underline; }
  .disclaimer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    font-family: var(--font-mono);
    color: #94a3b8;
    text-align: center;
    line-height: 1.7;
    letter-spacing: 0.03em;
  }

  /* 移动端 */
  @media (max-width: 640px) {
    .page { padding: 18px 12px 40px; }
    .hero { padding: 26px 20px; }
    .hero-title { font-size: 25px; }
    .hero-subtitle { font-size: 14.5px; }
    .floor { padding: 18px 18px 14px; }
    .floor:nth-child(even), .floor:nth-child(odd) { transform: none; }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .card-grid { grid-template-columns: 1fr; }
    .flow { flex-direction: column; }
    .flow-arrow { transform: rotate(90deg); }
    .compare-head { grid-template-columns: 1fr auto 1fr; }
    .vs-panel { grid-template-columns: 1fr; gap: 8px; }
    .vs-divider { margin: 0 auto; }
    .period-cards, .scenario, .pros-cons { grid-template-columns: 1fr; }
    .matrix-2x2 { grid-template-columns: 1fr; }
    .chart-wrap { grid-template-columns: 1fr; }
    .chart-svg { margin: 0 auto; }
    .venn { grid-template-columns: 1fr; }
    .venn-svg { margin: 0 auto; }
    .podium-step { min-height: auto !important; padding: 10px 8px; }
    .pb-row { grid-template-columns: 80px 1fr 44px; }
    body { font-size: 15.5px; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <span class="hero-badge">${theme.tag} · ${escape(theme.cat)}</span>
    <h1 class="hero-title">${escape(title)}</h1>
    ${subtitle ? `<p class="hero-subtitle">${escape(subtitle)}</p>` : ''}
    <div class="hero-meta">
      ${eventDate ? `<span>事件 · ${eventDate}</span>` : ''}
      ${publishDate ? `<span>撰写 · ${publishDate}</span>` : ''}
      ${wordCount ? `<span>${wordCount} 字</span>` : ''}
    </div>
  </header>
${floorsHTML}
${riskHTML}
  <footer class="footer">
    ${sourcesHTML}
    <p class="disclaimer">本文仅为信息梳理与行业观察，不构成任何投资建议，市场有风险，决策需谨慎。</p>
  </footer>
</div>
</body>
</html>`;
}

// ============================================================
// 辅助函数
// ============================================================
function escape(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

function formatInline(s) {
  let html = escape(s);
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, ' ');
  return html;
}

function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function computeOutPath(mdPath, fm) {
  const date = fm.publish_date || fm.event_date || new Date().toISOString().slice(0, 10);
  const base = path.basename(mdPath, '.md');
  const slug = base
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/^\d{1,3}-/, '');
  const outDir = path.join(ROOT, 'export', date);
  fs.mkdirSync(outDir, { recursive: true });
  const existing = fs.readdirSync(outDir)
    .filter(f => f.endsWith('.html') && !f.includes(slug));
  const idx = String(existing.length + 1).padStart(2, '0');
  return path.join(outDir, `${idx}-${slug}.html`);
}

function build(mdPath) {
  const abs = path.resolve(mdPath);
  const raw = fs.readFileSync(abs, 'utf-8');
  const { fm, body } = parseFrontmatter(raw);
  const parsed = parseBody(body);

  if (!parsed.sections.length) {
    console.error(`✗ ${path.basename(mdPath)}: 未识别到 **标题**：段落结构，跳过`);
    return null;
  }

  const html = renderHTML({ fm, ...parsed });
  const outPath = computeOutPath(abs, fm);
  fs.writeFileSync(outPath, html, 'utf-8');

  const rel = path.relative(ROOT, outPath);
  const bytes = Buffer.byteLength(html, 'utf-8');
  console.log(`✓ ${path.basename(mdPath)} → ${rel}  (${(bytes/1024).toFixed(1)} KB, ${parsed.sections.length} sections)`);
  return outPath;
}

function main() {
  const argv = process.argv.slice(2);
  let files = [];
  if (argv.includes('--all') || argv.length === 0) {
    for (const d of [path.join(ROOT, 'docs/posts'), path.join(ROOT, 'examples')]) {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (f.endsWith('.md') && !f.toUpperCase().includes('README')) {
          files.push(path.join(d, f));
        }
      }
    }
  } else {
    files = argv.filter(a => !a.startsWith('--'));
  }

  if (!files.length) {
    console.error('Usage: node scripts/page-builder.mjs <file.md> [...]');
    console.error('   or: node scripts/page-builder.mjs --all');
    process.exit(1);
  }

  console.log(`\n构建 ${files.length} 篇 markdown → HTML ...\n`);
  let ok = 0, fail = 0;
  for (const f of files) {
    const r = build(f);
    if (r) ok++; else fail++;
  }
  console.log(`\n闭环 · 成功 ${ok} 篇，失败 ${fail} 篇\n`);
}

main();
