## Hard Rules（不可违反）

1) **Harness 先行**：任何开发/改动都必须绑定 `harness-tasks.json` 的任务，并持续追加 `harness-progress.txt`（禁止绕开 Harness 直接改完就宣布完成）  
2) **GitHub-first（默认）**：只要 `gh auth status` 可用且仓库已连接 GitHub，就必须**有 issue + 有 PR**；不允许“无 issue 直接改代码”  
3) **需求与契约优先**：任何需求变更先改 `docs/prd|api|ui/*`，再改 `tests/`，最后改实现  
4) **默认 TDD**：覆盖 happy/edge/error/state；Red 阶段只写测试，不动实现  
5) **协作文本默认中文**：issue/PR/评论/进度更新默认中文叙述；代码、命令、关键技术词（TDD/PRD/API/CI/worktree 等）保留英文  
6) **commit message 默认详细中文**：只要用户要求“生成 commit message”，默认必须输出**结构详细化的简体中文版本**，而不是只给一行摘要；至少包含 `type: subject` 标题，以及变更说明列表；必要时补充影响范围、测试验证、注意事项  
7) **交付物可版本化**：文档写到 `docs/`，用例写到 `tests/`，实现随代码提交（不要把长日志常驻在对话里）  
8) **安全防线**：禁止提交密钥/令牌；启用 `.githooks/*` + `.github/workflows/*` 作为硬拦截与兜底  
9) **破坏性操作需授权**：`rm -rf`、`git reset --hard`、`--force` 必须先说明影响范围并征求同意

## Repo Setup（只需一次）

- 安装 git hooks：`git config core.hooksPath .githooks`
- 赋可执行权限：`chmod +x .githooks/* 2>/dev/null || true`

## GitHub-first（默认协作方式）

### 开工前检查

- `gh auth status`：确认 GitHub CLI 已登录  
- `git remote -v`：确认仓库已连接 GitHub remote

### 从 PRD 到 issue（默认中文模板）

当 `docs/prd/<feature>.md` 已存在但没有对应 issue 时：
- 用 `gh-create-issue` 从 PRD 生成 issue（必要时 epic + 子 issue）
- **标题/正文默认中文**，但 Acceptance Criteria、API 字段、代码片段、命令行、labels 用英文/原样

### 从 issue 到实现（必须可回溯）

- 每个交付切片对应一个 issue  
- 分支建议：`issue-<N>`  
- PR 必须包含：Summary（中文）、Testing（命令 + 结果）、`Closes #<N>`  
- 实现过程持续同步：
  - `gh issue comment <N> --body "<中文进度 + 下一步 + 测试结果>"`
  - 同步写入 `harness-progress.txt`（记录关键决策、文件路径、issue/PR 编号）

### commit message 默认规范

当用户要求“生成 commit message”时，默认输出**结构详细化的简体中文版本**，除非用户明确要求英文、Conventional Commits 极简版，或仓库另有更强约束。

推荐格式：

```text
<type>: <简体中文标题>

- 变更一：说明做了什么、涉及什么模块
- 变更二：说明为什么这样改、解决了什么问题
- 测试/验证：说明跑了哪些命令，结果如何
```

补充要求：

- `subject` 使用简体中文，直述结果，不写空泛标题
- `body` 默认给出 3 行左右的结构化说明，优先写“改了什么 / 为什么改 / 如何验证”
- 技术词、命令、路径、模块名可保留英文或原样
- 如果当前改动是“初始化仓库 / 脚手架接入 / 文档补充”，也要给出完整中文结构化版本，不只给单行

## Harness（本地可恢复执行层）

### 初始化 / 状态

- 初始化（若缺少状态文件）：`python3 .agents/skills/harness/bin/harness.py --root . init`
- 查看状态：`python3 .agents/skills/harness/bin/harness.py --root . status`

### 约定的开工流程（每个 session 都做）

1. 读 `harness-progress.txt`（末尾）+ `harness-tasks.json`（全量）  
2. `python3 .agents/skills/harness/bin/harness.py --root . status` 找到 next task  
3. `python3 .agents/skills/harness/bin/harness.py --root . claim --worker-id <id>` 认领  
4. 按任务的 `validation.command` 做客观验证；通过后 `complete`，失败则 `fail` 并记录 error  

> 如果发现 `in_progress`：先按 `.agents/skills/harness/SKILL.md` 的恢复协议处理，避免“半截 work”污染后续交付。

## Docs as Contract（文件即合同）

需求与契约：
- PRD：`docs/prd/{feature}.md`
- API：`docs/api/{feature}.md`
- UI：`docs/ui/{feature}.md`（可选：`docs/ui/{feature}.prototype.html`）

测试与计划：
- 用例文档：`tests/{feature}-test-cases.md`
- Dev Plan（可选）：`docs/dev/{feature}-dev-plan.md`

## Multi-agent + worktree（可选但强烈推荐）

### 角色分工（本模板默认 5 角色）

- `po`：只改 `docs/prd|api|ui/*`
- `qa`：只产出测试用例与测试（Red）
- `implementer`：只按契约/测试做最小实现（Green/Refactor）
- `reviewer`：只 review，列问题清单（不直接改代码）
- `verifier`：只跑验证并给出放行/阻塞结论

详细配置见：`.agents/skills/multi-agent/SKILL.md`

### 并行开发约定

- 一条 issue / 一个 `git worktree` / 一个 agent 会话
- 多 agent 并行时共享同一个 `HARNESS_STATE_ROOT`（但不要在同一 working tree 并发执行）

Worktree 实战见：`.agents/skills/worktree/SKILL.md`

## Skills 快速索引

| Skill | 用途 | 触发方式 |
|-------|------|----------|
| `product-requirements` | 需求澄清 → PRD/API/UI | `/product-requirements` |
| `test-cases` | PRD → 测试用例文档 | `/test-cases` |
| `tdd` | 严格 TDD（Red/Green/Refactor） | `/tdd` |
| `harness` | 长任务/多 session 进度管理 | `/harness` |
| `multi-agent` | 多角色并行协作 | `/multi-agent` |
| `worktree` | git worktree 并行开发 | `/worktree` |
| `gh-create-issue` | 从 PRD 创建 GitHub issue | `/gh-create-issue` |
| `gh-issue-implement` | 从 issue 到实现 | `/gh-issue-implement` |
| `gh-pr-review` | PR review 与合并 | `/gh-pr-review` |
