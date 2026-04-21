# a-share-event-analysis

一个 Claude Code / Claude Agent Skill，用于将**热点新闻/政策/事件**解读为结构化的 A 股行情解析文章。

## 能力

- **10 大类 × 20 子类模板库**：货币财政、产业政策、监管、地缘、贸易、重大会议、科技突破、黑天鹅、海外联动、大宗商品。
- **联网取数**：默认通过 WebSearch 自行补齐事件、市场反应、撰写时间三要素，无需用户提供素材。
- **权威信息源分级**：新华社 / 人民日报 / 三大证券报 / 部委官网为一级权威，财新 / 第一财经为二级，财经门户为三级，自媒体禁用。
- **结构化输出**：主标题（≤15字）+ 副标题（20–35字）+ 按模板字数与段落规格的正文 + 风险提示 + Sources。

## 安装

将整个目录放入 Claude Code 用户级 skills 目录：

```
~/.claude/skills/a-share-event-analysis/
├── SKILL.md              ← 自包含单文件，所有平台共用
├── README.md
├── examples/             ← 3 篇产出样例
└── export/               ← 生成的页面代码
```

## 跨平台使用

**`SKILL.md` 为自包含单文件**（含完整工作流 + 四条合规红线 + 20 子类模板正文），任何平台直接加载本文件即可：

| 平台 | 调用方式 |
|---|---|
| Claude Code | 将本目录放入 `~/.claude/skills/` 自动识别 |
| Codex / Copilot CLI / Cursor / 其他 | 在提示词中指向 `SKILL.md` 路径即可 |

## 触发

在对话中提及事件，例如：

- "帮我写一篇行情解析"
- "这个新闻对 A 股怎么看"
- "XX 政策出台了"
- 直接粘贴政策/新闻摘要

Claude 会自动：分类 → 联网搜索 → 按对应模板生成稿件。

## 分类速查

| # | 大类 | 子类 A | 子类 B |
|---|------|--------|--------|
| 1 | 货币财政政策 | 货币政策宽松 | 财政政策扩张 |
| 2 | 产业政策催化 | 新兴产业重磅政策 | 传统产业救市政策 |
| 3 | 监管整顿类 | 行业强监管打压 | 资本市场制度利好 |
| 4 | 地缘政治类 | 地缘风险升级 | 地缘风险缓和 |
| 5 | 国际贸易摩擦 | 关税加征/制裁升级 | 贸易豁免/协定利好 |
| 6 | 重大政治会议 | 国内重大会议定调 | 美联储/海外央行会议 |
| 7 | 科技重大突破 | AI/芯片/算力突破 | 新能源/生物医药突破 |
| 8 | 突发黑天鹅 | 自然灾害/重大事故 | 公共卫生突发事件 |
| 9 | 海外市场联动 | 美股暴跌传导 | 人民币汇率大幅波动 |
| 10 | 大宗商品异动 | 原油价格暴涨/暴跌 | 工业金属/贵金属异动 |

## 合规红线（对客端强制）

本 skill 已内嵌对客合规红线，所有 20 个模板的 Prompt 均已按下列原则改造：

**三条绝对禁止**：
1. 不写具体股票名称+代码（如"中国卫星(600118)"这类组合不出现）
2. 不做行情绝对性走势判断（禁用"必然/一定/见底/反转/突破"等词）
3. 不给投资操作建议（禁用"买入/建仓/超配/低配/规避/建议配置"等词）

**可以表述**：
- 行业/板块机会提示："相关行业板块可关注"、"值得留意的产业环节"
- 缓和性趋势表述：统一使用 **"可能 / 或 / 有望 / 预计 / 或将 / 料 / 大概率"**
- 风险提示：客观描述风险因素，不带断言

**输出约束**：
- 逻辑链清晰，禁止空泛罗列
- 严格区分"政策受益 vs 业绩受益"、"情绪反弹 vs 趋势反转"、"炒作 vs 产业趋势"
- 量化表述到行业敏感度层面（"某行业利润影响约 X%"），不推导到"因此 X 公司股价涨 Y%"
- 黑天鹅类保持人文关怀
- 地缘/监管类保持政治中立
- 文末附 Sources 区便于复核
- 文末固定附免责声明

## 双交付物（Step 3 + Step 6）

每次调用 skill 会同步产出两份内容，形成对客端完整闭环：

| 产物 | 路径 | 用途 |
|---|---|---|
| Markdown 源稿 | `docs/posts/YYYY-MM-DD-<slug>.md` | 带 frontmatter 的版本化源稿，供归档/检索/二次加工 |
| HTML 页面代码 | `export/YYYY-MM-DD/NN-<slug>.html` | 20–30KB 自包含单文件，可直接复制到页面平台 |

HTML 页面的 UI 规范参考 Anthropic [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) skill，**强制 7 楼层结构 + 20 子类色彩主题 + 避免 AI 套路化美学**（详见 SKILL.md Step 6）。

### 一键生成页面：scripts/page-builder.mjs

```bash
# 单篇
node scripts/page-builder.mjs docs/posts/2026-04-21-lithium-q1-earnings-surge.md

# 批量（扫描 docs/posts/ + examples/）
node scripts/page-builder.mjs --all
```

**脚本能力**：解析 YAML frontmatter → 按 `category` 自动匹配 20 子类色彩主题 → 按 Hero + N 楼层 + Footer 结构渲染 HTML → 自动编号存入 `export/YYYY-MM-DD/NN-<slug>.html`。输出含 gradient mesh、噪点纹理、非对称卡片、staggered 入场动画、自定义 Fraunces/JetBrains Mono 字体，严格规避 Inter/Roboto 与白底紫渐变等 AI 套路。

### 楼层可视化组件库（29 件套 · 6 族分类）

`scripts/page-builder.mjs` 内置 `VIZ_REGISTRY` 分发机制，每个楼层按「显式标签 → 启发式匹配 → 文本兜底」三层优先级自动匹配组件：

| 族 | 组件数 | 代表组件 | 典型场景 |
|---|---|---|---|
| A · 数据展示 | 5 | `stat-grid` · `kpi-card` · `highlight-num` · `delta-bar` · `compare-table` | 财报三大指标、业绩同比 |
| B · 关系结构 | 5 | `card-grid` · `layered-chain` · `hierarchy-tree` · `matrix-2x2` · `vs-panel` | 产业链上中下游、多空对决 |
| C · 时序流程 | 5 | `flow` · `timeline-h` · `timeline-v` · `period-cards` · `podium` | 政策传导链、事件时序、短中长期展望 |
| D · 信号标签 | 5 | `chips` · `pros-cons` · `progress-bars` · `callout` · `tag-cloud` | 受益标的胶囊、正反观点、关键判断 |
| E · 图表（SVG 内联） | 5 | `pie-chart` · `donut` · `bar-chart` · `sparkline` · `heatmap` | 市占率饼图、板块涨跌柱、热力图 |
| F · 特殊 | 4 | `quote-block` · `scenario` · `venn` · `map-tag` | 研报引用、三档情景、地域分布 |

外加 `risk-list` 固定用于 Floor 5，红底边条样式。完整组件规范见 [SKILL.md 6.3](./SKILL.md#63-楼层可视化组件库29-个按金融对客场景-6-族分类)。

**组件画廊样例**（可直接 fork 研究启发式触发写法）：

- [01 组件画廊 · 数据与结构族](./docs/gallery/01-viz-gallery-data-relation.md) — stat-grid / layered-chain / timeline-h / period-cards / flow
- [02 组件画廊 · 图表与信号族](./docs/gallery/02-viz-gallery-chart-signal.md) — bar-chart / donut / pros-cons / scenario / callout

## 产出示范

`examples/` 与 `docs/posts/` 目录收录若干实战产出样例，用于对齐颗粒度与字数：

- [01 荣耀机器人半马夺冠且包揽前六](./examples/01-honor-robot-marathon.md) — 7A 科技重大突破（具身智能延伸）
- [02 苹果 iPhone 17 大规模量产](./examples/02-iphone17-mass-production.md) — 7A 科技重大突破（消费电子延伸）
- [03 商业航天拉升](./examples/03-commercial-aerospace-rally.md) — 2A 新兴产业重磅政策（主题催化延伸）
- [04 东方证券换股吸收合并上海证券](./docs/posts/2026-04-20-orient-shanghai-merger.md) — 3B 资本市场制度利好（并购重组延伸）
- [05 锂电 Q1 业绩暴增](./docs/posts/2026-04-21-lithium-q1-earnings-surge.md) — 10B 工业/贵金属异动（新能源材料延伸）
- [06 SpaceX 递表，航天链对标升温](./docs/posts/2026-04-21-spacex-ipo-prospectus.md) — 7A 科技重大突破（全球商业航天资本化 A 股对标）· **新组件库实测样例**

### 新组件库实测效果（以 06 SpaceX 样例为例）

5 个楼层 × 5 个不同组件，三种触发路径一次命中：

| 楼层 | 组件 | 触发方式 |
|---|---|---|
| Floor 1 招股书关键指标 | **stat-grid** | 启发式（Markdown 表格自动识别） |
| Floor 2 产业链对标 | **layered-chain** | 启发式（"上游：xxx 中游：xxx 下游：xxx"句式） |
| Floor 3 A 股板块反应 | **bar-chart**（SVG 柱状） | 显式 `<!-- viz:bar-chart -->` 标签 |
| Floor 4 后市情景推演 | **scenario**（乐观/中性/悲观自动排序） | 启发式（三情景关键词） |
| Floor 5 风险提示 | **risk-list** | 固定（5 项编号列表） |

产物体量 36.1 KB，5 sections，合规自检全部通过。预览命令：

```bash
open export/2026-04-21/04-spacex-ipo-prospectus.html
```

所有样例遵循四条合规红线，可作为对客端落地参考。

## 免责声明

本 skill 仅用于生成结构化解读文本，不构成任何投资建议。模板来源于公开的内容创作框架，实际投资需自行判断。
