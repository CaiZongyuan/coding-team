# Coding Teams

Coding Teams 是一个本地优先的多 Agent 协作平台。它的目标是把本机可用的 Coding Agent CLI 接入统一的调度层，由 Manager Agent 拆解目标、分配任务、追踪执行，并把 agent 输出展示给用户。

当前 MVP 前期只支持 Claude Code provider。

## 当前能力

- 后端基于 Hono + Bun。
- 支持检测本机 Claude Code：`claude --version`。
- 支持 daemon one-shot 注册 Claude runtime 到 backend。
- 支持 `POST /api/daemon/register` 注册 daemon/runtime。
- 支持 `GET /api/runtimes` 查询 runtime。
- backend 首页提供一个最小 Runtime Dashboard，会从 `/api/runtimes` 拉取 runtime 数据。
- 自动化测试使用 mock detector / mock fetch，不调用真实 Claude 模型。

## 目录结构

```text
coding-teams/
├── backend/                         # Hono API 与当前最小 dashboard
│   ├── src/
│   │   ├── app.ts                   # Hono app、API routes、Runtime Dashboard
│   │   ├── daemon/
│   │   │   ├── register.ts          # Claude runtime one-shot 注册逻辑
│   │   │   └── register-cli.ts      # `bun run daemon:register` 入口
│   │   ├── providers/
│   │   │   └── claude.ts            # Claude Code detection
│   │   └── store.ts                 # 当前 in-memory daemon/runtime store
│   └── tests/                       # Bun tests
├── docs/
│   ├── prd/coding-teams.md          # 产品需求合同
│   ├── api/coding-teams.md          # API 合同
│   └── ui/coding-teams.md           # UI 合同
├── tests/
│   └── coding-teams-claude-test-cases.md
├── harness-tasks.json               # Harness 任务状态
└── harness-progress.txt             # Harness 进度日志
```

说明：`apps/web/` 当前是本地未纳入父仓库的 TanStack Start 脚手架目录，并且内部带独立 `.git`。正式前端接入会单独处理它的归属，当前根 `.gitignore` 会先忽略该目录，避免误提交嵌套仓库。

## 环境要求

- Bun
- GitHub CLI：`gh`
- Claude Code CLI：`claude`

检查 Claude Code：

```bash
claude --version
```

当前已验证的本机输出示例：

```text
2.0.57 (Claude Code)
```

## 快速开始

启动 backend：

```bash
cd backend
bun install
bun run dev
```

默认服务地址：

```text
http://localhost:3000
```

另开一个终端，注册本机 Claude runtime：

```bash
cd backend
bun run daemon:register
```

查看 runtime API：

```bash
curl -sS http://localhost:3000/api/runtimes
```

打开最小 Runtime Dashboard：

```text
http://localhost:3000
```

注意：当前 store 是 in-memory，重启 backend 后 runtime 注册数据会清空。

## 测试

运行 backend 测试：

```bash
cd backend
bun test
```

运行 TypeScript typecheck：

```bash
cd backend
bunx tsc --noEmit
```

当前测试覆盖：

- Claude Code detection ready/missing。
- daemon registration API。
- runtime list API。
- daemon one-shot registration payload。
- daemon registration client 的 mock fetch。
- Runtime Dashboard HTML 是否连接 `/api/runtimes`。

测试策略：

- 自动化测试不调用真实 Claude 模型。
- 自动化测试不依赖 Claude 登录态。
- 真实 Claude 仅用于 `claude --version` 级 smoke。

## 开发流程

本仓库使用 GitHub-first + Harness：

1. 需求先落到 issue。
2. 每个开发切片绑定 `harness-tasks.json` 中的 task。
3. 进度同步写入 `harness-progress.txt`，并评论到 GitHub issue。
4. 默认使用 TDD：先写测试，再写实现。
5. PR review 通过后及时 merge，确认 linked issue 已关闭。

常用 Harness 命令：

```bash
python3 .codex/skills/harness/bin/harness.py --root . status
python3 .codex/skills/harness/bin/harness.py --root . add --title "..." --validation "..."
python3 .codex/skills/harness/bin/harness.py --root . claim --worker-id "<worker-id>"
python3 .codex/skills/harness/bin/harness.py --root . complete <task-id>
```

## 当前限制

- 只支持 Claude Code provider。
- 还没有 task queue / claim / runner。
- 还没有执行真实 Claude Code 任务。
- 还没有 WebSocket 实时输出。
- 还没有正式接入 `apps/web` TanStack 前端。
- 当前 runtime 数据只存在内存中。

## 后续路线

- 实现 task queue、claim、start、message、result 状态流。
- 实现 Claude Code runner，并用 fake runner 做自动化测试。
- 增加 task message stream 和实时输出观察。
- 正式处理 `apps/web/` 的仓库归属并接入后端 API。
- 将 in-memory store 迁移到 PostgreSQL + Drizzle。
