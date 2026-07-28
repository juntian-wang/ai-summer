# 任务 C — 后端核心搭建 ✅ 完成

## 交付概览

| 指标 | 数值 |
|------|------|
| 交付状态 | ✅ **完成** |
| 测试通过率 | **105/105 (100%)** |
| 代码行数 | **~1350 行** |
| 模块数 | **5 个** |
| API 端点 | **5 个**（含健康检查） |

## 后端文件清单

| 文件 | 行数 | 功能 |
|------|------|------|
| `server/server.js` | 268 | Express主入口 + 4个API路由 + 主循环调度 |
| `server/flowDefinition.js` | 106 | 26步FLOW数组 + 辅助函数 |
| `server/sessionStore.js` | 237 | 数据加载 + Session CRUD + 30分钟超时清理 |
| `server/agentEngine.js` | 396 | LLM调用 + 全部Prompt构建 + 4次重试降级 + 输出自检 |
| `server/viewerEngine.js` | 335 | 30人分6批并行投票 + 补票 + 跑票统计 |
| `server/ARCHITECTURE.md` | — | 系统架构设计文档 |

## Loop Engineering 核心实现

- **28步FLOW**：从主持开场→初投→6人车轮战→开杠→结辩→终投→导师点评
- **4次重试降级**：3次完整Prompt → 第4次简化Prompt → 占位文本
- **每步输出自检**：非空、字数范围、无角色标记、无拒绝回答、身份正确
- **跑票检查**：跑票=0自动触发加赛开杠+重新终投

## API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/session/start` | 创建辩论Session |
| GET | `/api/session/:id/state` | 获取当前状态 |
| GET | `/api/session/:id/next` | 执行下一步 |
| GET | `/api/session/:id/full` | 获取完整台本 |

## 启动方式

```bash
cd /Users/Andy/Desktop/AI的夏天
npm start
# 打开 http://localhost:3000
```
