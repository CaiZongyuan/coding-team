# CLAUDE.md

This file is the single source of truth for AI agents working with this repository. Read it first.

> **之前分散在 AGENTS.md + 13 个 .codex/skills/*/SKILL.md 里的规则，现在全部收敛到这里。**
> .codex/skills/ 只保留操作模板（bash 命令、prompt 模板），不承载规则。

## Project Context

Coding Teams 是一个多 Agent 协作调度平台。MVP 阶段只支持 Claude Code 一个 provider，重点建立 daemon ↔ server 协议、task queue、message stream 和 Web UI 可观察界面。

参考架构：`docs/architecture.md`（基于 Multica 的成熟抽象，但不照搬其完整产品面）。

### Multica 参考实现

Multica（`/Users/mac/caii/agents/multica`）是一个成熟的多 Agent 协作调度平台，Coding Teams 从中提取核心设计模式但大幅简化。以下是 Multica 中与 Coding Teams 相关的关键文件，实现新功能时应先阅读对应文件理解设计意图：

| Coding Teams 要实现的 | Multica 参考文件 | 说明 |
|---|---|---|
| Daemon 任务执行循环 | `server/internal/daemon/daemon.go` | `Run()` 主循环、`pollLoop()` 轮询、`handleTask()` 执行 |
| Agent 后端接口 | `server/pkg/agent/agent.go` | `Backend` 接口定义（`Execute → Session`） |
| Claude Code 后端 | `server/pkg/agent/claude.go` | spawn claude CLI、解析 stream-json 协议 |
| 消息流式上报 | `server/internal/daemon/daemon.go` 的 `executeAndDrain()` | 500ms 批量 flush、idle watchdog |
| Daemon HTTP 客户端 | `server/internal/daemon/client.go` | claim/start/heartbeat/messages/result API 调用 |
| 类型定义 | `server/internal/daemon/types.go` | Task、Message、Result 等结构体 |
| CLI 入口 | `server/cmd/multica/cmd_daemon.go` | `daemon start` 命令 |

**Coding Teams 的简化原则**：
- Multica 用 Go 实现，Coding Teams 用 TypeScript + Bun
- Multica 支持 Claude/Codex/Gemini 多 provider，Coding Teams MVP 只支持 Claude Code
- Multica 有 WebSocket 实时推送、session resume、idle watchdog 等，MVP 阶段用 HTTP 轮询替代
- 核心设计模式（pull-based claim、stream-json 解析、消息批量上报）保持一致

## Architecture

TypeScript monorepo，Bun runtime：

- `backend/` — Hono API server + daemon 逻辑（当前唯一实现目录）
- `apps/web/` — TanStack Start Web UI（独立 git repo，暂不并入父仓库）
- `docs/` — PRD、API、UI 合同文档
- `tests/` — 测试用例文档（`tests/<feature>-test-cases.md`）
- `.codex/skills/` — 操作模板（bash/prompt 模板），不承载规则

当前 `backend/` 内部结构：

```
backend/
  src/
    app.ts              # Hono 路由与 dashboard
    index.ts            # 入口
    store.ts            # 内存 runtime store
    providers/
      claude.ts         # Claude Code detection
    daemon/
      register.ts       # daemon 注册逻辑
      register-cli.ts   # CLI 入口
  tests/
    claude-runtime.test.ts
    daemon-register.test.ts
```

## Hard Rules

违反任何一条 = 停止工作，报告问题，等待用户确认。

### 1. GitHub-first

只要 `gh auth status` 可用且仓库已连接 GitHub remote：

- **无 issue 不开工** — 任何实现改动必须关联 issue
- **交付通过 PR** — 不允许直接 push main
- 分支命名：`issue-<N>`
- PR 必须包含：中文摘要、测试命令与结果、`Closes #<N>`
- Issue 关闭前，body 里的 Acceptance Criteria 必须全部 `- [x]`

**验证**：`gh issue view $N` 检查 body 里的 `- [ ]` 是否全部变为 `- [x]`。有未勾选的 AC = 不允许关闭。

### 2. Docs as Contract（需求 → 测试 → 实现，严格这个顺序）

需求变更必须按以下顺序产出文件，**不可跳步，不可合并为一个 commit**：

1. `docs/prd/<feature>.md` / `docs/api/<feature>.md` / `docs/ui/<feature>.md`
2. `tests/<feature>-test-cases.md`
3. `backend/tests/*.test.ts`（Red commit）
4. `backend/src/**/*.ts`（Green commit）

**验证**：每个阶段独立 commit。git log 必须能看出先后顺序。

### 3. TDD（分两个 commit，由 pre-commit hook 强制）

核心规则（精简版，参考 Multica）：

1. **Red**：只写测试文件（`backend/tests/`），不改 `backend/src/`。提交。`bun test` 必须失败。
2. **Green**：只改实现文件（`backend/src/`），不改测试文件。提交。`bun test` 必须通过。
3. **Refactor**：可选。重命名/提取/简化，不改测试断言语义。`bun test` 仍通过。

**强制机制**：`.githooks/pre-commit` 检查：

```bash
# 如果 staged 文件同时包含 tests/ 和 src/，拒绝提交
if git diff --cached --name-only | grep -q '^backend/tests/' && \
   git diff --cached --name-only | grep -q '^backend/src/'; then
  echo "BLOCKED: tests/ 和 src/ 不能在同一个 commit 同时修改。"
  echo "TDD 要求：先 commit tests/（Red），再 commit src/（Green）。"
  exit 1
fi
```

**豁免**：初始化/脚手架 commit（无已有测试框架时）可以跳过，但 commit message 必须以 `init:` 开头。

### 4. 测试覆盖（test-cases 文档 = 契约，必须全部有对应 `it()`）

`tests/<feature>-test-cases.md` 里声明的每个 TC-ID，必须在 `backend/tests/` 的某个 `.test.ts` 文件里有对应的测试。

Coverage Matrix 的状态只有三种：

| 状态 | 含义 | 要求 |
|------|------|------|
| `Complete` | TC-ID 有对应 `it()` 且测试通过 | 必须 |
| `Partial` | TC-ID 有对应 `it()` 但测试失败 | 必须修复 |
| `Missing` | TC-ID 没有对应 `it()` | 不允许标注 Complete |

**禁止自评造假**：如果 Coverage Matrix 标注 `Complete` 但实际没有对应的 `it()`，等同于违反 Hard Rule。

**验证**：`backend/scripts/check-test-coverage.sh` 比对 TC-ID 与实际测试。CI 跑这个脚本。

### 5. 安全防线

- 禁止提交密钥、令牌、`.env` 文件
- `rm -rf`、`git reset --hard`、`git push --force` 必须先说明影响范围并征求同意
- `.githooks/*` + `.github/workflows/*` 作为硬拦截与兜底

### 6. 协作文本默认中文

- issue/PR/评论/harness-progress 默认中文叙述
- 代码注释使用中文（帮助学习理解），变量名/函数名保留英文
- commit message 的 subject 保留英文 conventional 前缀（`feat:`/`test:`/`fix:` 等），body 使用中文描述变更内容和设计意图
- 技术词（TDD/PRD/API/CI/worktree 等）保留英文

## Commands

```bash
# 开发
cd backend && bun run dev                # 启动 backend dev server
cd backend && bun run daemon:register    # 手动触发 daemon 注册

# 测试
cd backend && bun test                   # 跑全部测试
cd backend && bun test --watch           # watch 模式

# 类型检查
cd backend && bunx tsc --noEmit          # TypeScript 类型检查

# 完整验证（PR/完成前必须跑）
cd backend && bun test && bunx tsc --noEmit

# Harness
python3 .codex/skills/harness/bin/harness.py --root . status
python3 .codex/skills/harness/bin/harness.py --root . claim --worker-id <id>
python3 .codex/skills/harness/bin/harness.py --root . complete <task-id>
```

### 验证命令说明

`bun test` 只验证"测试通过"。完整验证 = `bun test && bunx tsc --noEmit`。Harness 的 `validation.command` 应使用完整验证命令，不要只用 `bun test`。

## Where to Write Tests

测试跟代码走，不跟 app 走（参考 Multica）：

| 测试什么 | 测试文件在哪 | 环境 |
|---------|-------------|------|
| 纯逻辑（detector、store、payload 构建） | `backend/tests/providers/`、`backend/tests/store/` | 无 DOM，纯函数 |
| API 路由（register、runtimes、validation） | `backend/tests/routes/` | Hono `app.request()` |
| daemon 客户端（注册、fetch、CLI） | `backend/tests/daemon/` | mock fetch/detector |
| dashboard 页面（HTML 渲染） | `backend/tests/routes/` | Hono `app.request()` |

**规则**：不要在同一个 `describe` 里混测不同层的逻辑。API 路由测试不测 detector 内部；detector 测试不测 HTTP 状态码。

## Testing Conventions

### Mocking

- Provider detection：注入 mock command runner（`detectClaudeCodeRuntime(mockRunner)`）
- Daemon 客户端：注入 mock fetch（`registerClaudeRuntime({ fetchImpl: mockFetch })`）
- Store：每个测试用独立的 `createMemoryStore()`，不共享状态
- **不要 mock 被测单元内部**（不要 mock 自己的 store 来测自己的 route）

### 测试命名

每个 `describe`/`it` 要能让读者不看测试体就知道测什么。推荐格式：

```ts
describe('TC-F-003: upsert existing Claude runtime', () => {
  it('replaces version on re-registration with same daemon hostname', async () => { ... })
  it('preserves stable runtime ID for the same daemon/provider pair', async () => { ... })
})
```

把 TC-ID 放在 `describe` 里，方便 `check-test-coverage.sh` 提取和比对。

### API Contract Testing

当前 API validation 是内联逻辑（`if (!hostname)`）。演进方向：

- 每个 API endpoint 的 request/response 用 zod/valibot 定义 schema
- Schema 文件放在 `backend/src/schemas/`
- 每个 schema 至少一个 malformed input 测试（缺失字段、错误类型、null 数组）
- Daemon ↔ Server 通信天然跨版本，必须防御性解析

## Harness（本地可恢复执行层）

### 开工流程（每个 session）

1. 读 `harness-progress.txt`（末尾）+ `harness-tasks.json`（全量）
2. `python3 .codex/skills/harness/bin/harness.py --root . status` 找 next task
3. `python3 .codex/skills/harness/bin/harness.py --root . claim --worker-id <id>` 认领
4. 按 `validation.command` 验证；通过后 `complete`，失败则 `fail` 并记录 error
5. 关键决策同步到 `harness-progress.txt` + `gh issue comment`

### in_progress 恢复

发现 `in_progress` task = 上一个 session 中断。处理：

1. `git diff --stat` + `git log --oneline -5` 查看未提交/已提交的改动
2. 读 task 的 `checkpoints` 确定最后完成的步骤
3. 跑 `validation.command`：通过 → `complete`；失败 → `git reset --hard <started_at_commit>` 并 `fail`

## Docs as Contract（文件即合同）

| 文件 | 用途 | 何时产出 |
|------|------|---------|
| `docs/prd/<feature>.md` | 产品需求 | issue 创建前或同步 |
| `docs/api/<feature>.md` | API 契约 | 实现前 |
| `docs/ui/<feature>.md` | UI 规范 | 实现前（可选） |
| `tests/<feature>-test-cases.md` | 测试用例文档 | TDD Red 之前 |
| `backend/tests/*.test.ts` | 自动化测试 | TDD Red |
| `backend/src/**/*.ts` | 实现 | TDD Green |

**关键**：`tests/<feature>-test-cases.md` 是 QA 契约。它的每一个 TC-ID 都必须有对应的自动化测试。没有"标注 Complete 但实际没测"这种情况。

## Multi-agent + Worktree

### 角色分工（多 agent 时生效）

| 角色 | 职责 | 允许改的文件 |
|------|------|-------------|
| `po` | 需求、PRD、API 契约 | `docs/prd\|api\|ui/*` |
| `qa` | 测试用例文档 + 测试代码 | `tests/*-test-cases.md`、`backend/tests/` |
| `implementer` | 最小实现 | `backend/src/` |
| `reviewer` | 审查，列问题清单 | 不改代码，只写评论 |
| `verifier` | 跑验证，给放行/阻塞结论 | 不改代码，只跑命令 |

**单 agent 时**：同一 agent 扮演多个角色时，仍然按角色**分阶段**执行。不要在同一个 commit 里同时扮演 qa 和 implementer——pre-commit hook 会阻止你。

### 并行开发约定

- 一条 issue / 一个 `git worktree` / 一个 agent 会话
- 多 agent 并行时共享同一个 `HARNESS_STATE_ROOT`（但不要在同一 working tree 并发执行）

## API Design Principles

参考 `docs/api/coding-teams.md` 和 `docs/architecture.md`：

- Server 是事实来源，daemon 不保存长期业务状态
- 任务执行采用 daemon 主动 claim（拉取），不是 server 推送
- Runtime upsert by `(daemon_id, provider)` 组合键
- 验证错误返回 `{ error: { code: "VALIDATION_ERROR", message, details } }`
- daemon ↔ server 通信未来会跨版本，现在就要养成防御性解析的习惯

## Commit Conventions

- Conventional format：`feat(scope):`、`fix(scope):`、`refactor(scope):`、`docs`、`test(scope):`、`chore(scope):`
- TDD Red commit 以 `test:` 开头
- TDD Green commit 以 `feat:` 或 `fix:` 开头
- commit subject 保留英文 conventional 前缀，body 使用中文描述变更内容
- 代码注释使用中文（帮助学习理解），变量名/函数名保持英文

## .codex/skills/ Reference

`.codex/skills/` 下只存放**操作模板**（bash 命令、prompt 模板、参考文档）。规则全部收敛在本文件。

| 目录 | 用途 |
|------|------|
| `harness/` | harness.py CLI + 进度管理模板 |
| `tdd/` | TDD 操作流程模板（规则的强制力在 CLAUDE.md + pre-commit hook） |
| `test-cases/` | 测试用例文档生成模板 |
| `product-requirements/` | PRD/API/UI 文档生成模板 |
| `gh-create-issue/` | 从 PRD 创建 issue 的 bash 模板 |
| `gh-issue-implement/` | issue → 分支 → PR 的流水线模板 |
| `gh-pr-review/` | PR review 与合并的流水线模板 |

## Repo Setup

```bash
# 安装 git hooks（pre-commit 检查 tests/ 和 src/ 不同时修改）
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

# 安装 backend 依赖
cd backend && bun install

# 验证环境
cd backend && bun test && bunx tsc --noEmit
```
