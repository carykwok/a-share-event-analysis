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
 * 可视化启发式（兼顾规范美学与内容分层）：
 *   - Floor 段内含 markdown 表格 → 渲染为 stat-grid 大数字卡
 *   - Floor 段内含 ①②③ 粗体编号列表 → 渲染为 numbered card-grid
 *   - Floor 段末尾出现 "三/四项抓手：A、B、C" → 渲染为 chip-list
 *   - Floor 段内含 "A → B → C" 流程 → 渲染为 flow timeline
 *   - 其余回落为纯文本段落
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
// HTML 渲染
// ============================================================
function renderFloorBody(content) {
  // 1. Markdown table → stat-grid（优先级最高）
  const table = extractTable(content);
  if (table && table.rows.length >= 2) {
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

  // 2. ①②③ 粗体编号 → card-grid
  const cards = extractNumberedCards(content);
  if (cards.length >= 2) {
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

  // 3. 流程时间轴
  const flow = extractFlow(content);
  if (flow && flow.length >= 3) {
    const lead = content.split(/[→⇒>]/)[0].trim().replace(/[——\-–]+$/, '').trim();
    return `
      ${lead ? `<p class="floor-lead">${formatInline(lead)}</p>` : ''}
      <div class="flow">
        ${flow.map((step, i) => `
          <div class="flow-step">${escape(step)}</div>
          ${i < flow.length - 1 ? '<div class="flow-arrow">→</div>' : ''}`).join('')}
      </div>`;
  }

  // 4. 抓手/要点 → chip list（追加到段落末）
  const chips = extractChips(content);
  if (chips) {
    const beforeChips = content.replace(/(?:三|四|五|六|七)(?:项|大|个)(?:抓手|要点|维度|方面|信号|条件|机会|方向|条款|亮点)[：:][^。\n]+/, '').trim();
    return `
      ${beforeChips ? `<p class="floor-body">${formatInline(beforeChips)}</p>` : ''}
      <div class="chips">
        ${chips.map((s, i) => `<span class="chip"><span class="chip-num">${i + 1}</span>${escape(s)}</span>`).join('')}
      </div>`;
  }

  // 5. 回落纯文本
  return `<p class="floor-body">${formatInline(content)}</p>`;
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
