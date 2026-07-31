# 项目笔记 — AI 的夏天

> 一个模仿《奇葩说》的 AI 辩论节目。两个 AI 阵容各派一辩/二辩/三辩，300 个有独立人设的 AI 观众实时投票跑票（每场随机抽 30 人），导师赛后点评。全自动 Loop 驱动。

## ⚠️ 进入项目后第一件事

**读 `项目总览.md`。** 那是全局看板——进度、谁在做什么、能不能开始、Phase 启动条件。读完之后在进度表上把自己的状态改成 🔄。

任务完成后：改状态 → 在工作日志追一条记录。

> 项目总览.md 是唯一的状态源，MEMORY.md 不存进度/分配/日志（避免两份维护不一致）。

---

## 架构速查

| 层 | 文件 | 说明 |
|-----|------|------|
| 前端 | `index.html` | 单文件，纯 HTML+CSS+JS，~2800 行 |
| 后端 | `server/server.js` | Node.js + Express，状态机+编排器 |
| 后端核心 | `server/agentEngine.js` | Prompt构建 + LLM调用 + 重试降级 + 输出自检 |
| 后端投票 | `server/viewerEngine.js` | 30人分批并行投票 + 跑票统计 + 感想生成 |
| 后端状态机 | `server/flowDefinition.js` | **54步FLOW**（含8轮mid投票）|
| 后端Session | `server/sessionStore.js` | 数据加载 + Session CRUD + 300人随机抽选 |
| LLM | DeepSeek API | `deepseek-v4-flash`，base URL `https://api.deepseek.com` |
| 数据 | `data/*.json` | topics(20题)/debaters(**16人**)/audience_300(300人池)/audience(30人经典)/referee/mentors(4人) |
| 部署 | `npm start` | → localhost:3000 |

### 前端关键设计
- 双数据模式：优先后端 API（`/api/session/start` + `/next`），失败降级内置 mock
- playLoop：异步循环，支持暂停/恢复/跳过
- 打字机效果：setInterval 50ms/字，pause/resume 正确处理
- **情绪引擎 v2**：10个维度 → 20+种表情（含组合表情），中性状态独立处理
- **观众同步**：前端加载 `audience_300.json`，从 `/state` 过滤到本场30人
- **感想悬停**：鼠标移到观众 emoji 上显示其最新投票感想（`latestReactions`）
- 观众席：5列×6行 grid，实时 emoji，悬停显示身份
- 跑票曲线：SVG 折线图；开杠面板：Round 标签 + 发光边框 + 计时条

### 后端 API
- `POST /api/session/start` → `{ code, data: { sessionId }, message }`，接受 `{ pro, con, topicIndex, customTopic }`
- `GET /api/session/:id/next` → `{ code, data: { type, content, speakerName, side, flowProgress, degraded } }`
  - vote 类型额外返回 `details[]`（含 `reaction` 字段）、`latestReactions`
- `GET /api/session/:id/state` → 含本场 30 人观众列表 + `latestReactions`
- `GET /api/health` → 健康检查

### 辩论流程（54步FLOW）
- **10轮投票**：init(初投) + 8轮mid(每段发言后) + final(终投)
- 每轮投票30人分批并行调LLM，每人写投票理由+100字感想
- 感想存 `session.latestReactions`，前端悬停显示

### Prompt 上下文
- **辩手发言**：看到之前**所有人的完整发言**（队友+对手+主持人），不再截断
- **主持人**：看到全部 memory，完整内容
- **结辩**：看到非投票发言全文
- **导师点评**：完整辩论内容
- **开杠**：对方上一轮完整发言

### 观众系统
- 300 人池（`audience_300.json`），每人 1000+ 字 bio，59 种职业 × 20 城市
- 每场 Fisher-Yates 洗牌抽 30 人
- 投票 Prompt 含完整 bio + 价值观，降级回退 `audience.json`

### Loop Engineering
- 开发按 Task Loop：每步自检 → 失败重试 3 次 → 降级
- 播放按 playLoop：fetch → render → typewriter → wait → next

---

## 前端待办事项

### 主持人过渡模板化（待接入）
`server/hostTemplates.js` 已写好但尚未接入 FLOW。需要前端配合修改：
- **当前**：每段发言之间没有主持人过渡，直接跳下一个辩手
- **目标**：在 FLOW 中每个 speech/closing 之前插入一个 `host_template` 步骤，前端收到此类型时渲染为过渡文本（不调LLM，瞬间返回）
- 模板库涵盖 7 类场景：介绍发言 / 过渡 / 引导投票 / 开杠开始/结束 / 结辩引导 / 终投

### 主持人开场 Prompt 优化
`data/referee.json` 已重写：
- `speaking_rules` 从导演台本风格（"说一句轻松的话或抖个包袱"）改为直接输出风格（"引导投票时说'请各位观众投票'"）
- 新增 `example_speeches` 字段（11条完整开场示例）
- `agentEngine.js` 的 `buildHostPrompt` 已支持读取并注入 `example_speeches`

### 投票节奏改为每对一轮
- FLOW 42步（原46步），6轮投票（1初投+4mid+1终投）
- 每对辩手（正+反）发言完投一次，而非每人投一次
- 省了120次LLM调用：8轮mid→4轮mid

---

## 已知坑位
2. 自定义辩题不生效（topicIndex=-1 随机） → 加了 `customTopic` 参数
3. JS 语法 typo（`HOST,null,null]`、多余 `)`、正则缺 `[`）→ 已修复
4. `/next` 请求超时 → 加了 120s AbortController
5. 编辑 `.html` 后必须检查 `{}` 括号平衡（2026-07-23 绿屏事故教训）

---

## 数据变更记录

- **2026-07-28 更名**：AI 奇葩说 → AI 的夏天
- **2026-07-28 导师调整**：李诞从辩手→导师，导师 4 人（薛兆丰+刘擎+蔡康永+李诞）
- **2026-07-28 模型切换**：`deepseek-chat` → `deepseek-v4-flash`，base URL 去 `/v1`
- **2026-07-28 300 人观众池**：`audience_300.json`，平均 1637 字/人
- **2026-07-28 debaters.json 修正**：6 人 `best_position` 改为单一辩位
- **2026-07-28 mentors.json 金句扩充**：每人 50 条
- **2026-07-30 情绪引擎 v2**：10→20+种表情（含组合表情），修复中性映射，前端加载 `audience_300.json` 并同步后端选中的30人
- **2026-07-30 完整上下文传递**：移除所有 memory 截断（substring），辩手/主持人/结辩现在能看到全场所有发言
- **2026-07-30 每轮投票+感想**：FLOW 扩展至54步（增8轮mid投票），每轮投票30人各写100字感想，`latestReactions` 传前端悬停显示
- **2026-07-30 主持人数据重写**：`data/referee.json` 的 `speaking_rules` 从导演台本风格改为直接输出的人话，新增 `example_speeches`（11条示例）
- **2026-07-30 hostTemplates 模板库**：`server/hostTemplates.js` — 过渡引导词模板（介绍发言/过渡/开杠/引导投票等7类，每类3-8条），零LLM调用，**待接入FLOW**
- **2026-07-30 投票改为每对一轮**：FLOW 46→42步，8轮mid投票→4轮（每对辩手发言后一次投票），总投票10→6轮，省120次LLM调用

---

## 分工约定

- **我的职责**：人物资料收集（Task A / B / E）
- **不归我做**：Task C（后端）、Task D（前端）

---

## 部署配置（阿里云新加坡）

| 项目 | 值 |
|------|-----|
| 服务器 IP | `47.236.92.136` |
| 系统 | Ubuntu 24.04 |
| 地域 | 阿里云新加坡（香港当时售罄） |
| 价格 | ¥28/月 2核1G |
| 线路 | 通用型 + BGP 优化 |

### 已有站点

| 域名 | 根目录 |
|------|--------|
| jonlab.cn + www.jonlab.cn | `/var/www/jonlab/` |
| history.jonlab.cn | `/var/www/history/` |

### 部署规则

1. **不要修改已有 Nginx 配置**（`/etc/nginx/sites-available/default`），只追加新的 server block
2. **不要单独跑第二个 Nginx / Apache / Docker 占用 80/443**，所有站点统一通过宿主机 Nginx 反代或直接 serve
3. **SSL 证书**：用 `/etc/letsencrypt/live/jonlab.cn/` 下的已有证书，用 `certbot --expand` 添加新域名，不需要重新申请
4. **HSTS**：已有的 `includeSubDomains` 会自动覆盖子域名，无需额外配置
5. **如果需要 Docker**：容器端口映射到 8080/8443 等非标准端口，再由宿主机 Nginx 反代到 `localhost:8080`

### 部署状态（2026-07-31 更新 ✅）

| 项目 | 值 |
|------|-----|
| 访问地址 | **https://ai-summer.jonlab.cn** |
| GitHub 仓库 | `https://github.com/juntian-wang/ai-summer.git` |
| 服务器目录 | `/var/www/ai-summer/` |
| 进程管理 | PM2（服务名 `ai-summer`）|
| 开机自启 | ✅ 已配置 |
| Nginx 配置 | `/etc/nginx/sites-available/ai-summer`（反代 localhost:3000）|
| SSL | 已通过 `certbot --expand` 添加到现有证书 |
| DNS | `ai-summer` A 记录 → `47.236.92.136` |
| **当前代码** | commit `61dca48`（48步FLOW v1.1，2026-07-31 部署）|
| **部署方式** | ⚠️ 本地 git 直连 GitHub 不通（沙箱拦截），用 **bundle 中转**（本地打包→scp服务器→服务器push）|