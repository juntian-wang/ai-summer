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
| 前端 | `index.html` | 单文件，纯 HTML+CSS+JS，984 行 |
| 后端 | `server/server.js` | Node.js + Express，状态机+编排器 |
| LLM | DeepSeek API | `deepseek-v4-flash`，base URL `https://api.deepseek.com` |
| 数据 | `data/*.json` | topics(20题)/debaters(**16人**，含新增熊浩/庞颖/储殷/胡渐彪/程璐)/audience_300(300人池)/audience(30人经典)/referee/mentors(4人) |
| 部署 | `npm start` | → localhost:3000 |

### 前端关键设计
- 双数据模式：优先后端 API（`/api/session/start` + `/next`），失败降级内置 mock
- playLoop：异步循环，支持暂停/恢复/跳过
- 打字机效果：setInterval 50ms/字，pause/resume 正确处理
- 情绪引擎：10 维特征提取，每个观众独立敏感度
- 观众席：5列×6行 grid，实时 emoji，悬停显示身份
- 跑票曲线：SVG 折线图；开杠面板：Round 标签 + 发光边框 + 计时条

### 后端 API
- `POST /api/session/start` → `{ code, data: { sessionId }, message }`，接受 `{ pro, con, topicIndex, customTopic }`
- `GET /api/session/:id/next` → `{ code, data: { type, content, speakerName, side, flowProgress, degraded } }`
- `GET /api/session/:id/state` → 含本场 30 人观众列表
- `GET /api/health` → 健康检查

### 观众系统
- 300 人池（`audience_300.json`），每人 1000+ 字 bio，59 种职业 × 20 城市
- 每场 Fisher-Yates 洗牌抽 30 人
- 投票 Prompt 含完整 bio + 价值观，降级回退 `audience.json`

### Loop Engineering
- 开发按 Task Loop：每步自检 → 失败重试 3 次 → 降级
- 播放按 playLoop：fetch → render → typewriter → wait → next

---

## 已知坑位

1. 后端 `GET /` 返回 JSON 而非 index.html → 改成了 `GET /api/health`
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

### 本项目部署计划（待执行）

- 端口：`localhost:3000`（项目默认）→ Nginx 反代到新域名
- 域名：可以考虑 `ai.jonlab.cn` 或 `summer.jonlab.cn`
- 流程：Git push → 服务器 git pull → npm install → npm start → Nginx 追加反代 → certbot --expand