---
name: implement-issue
description: 实现 GitHub issue。从 issue body 读取需求、验收标准和 TC-ID，按 TDD 流程开发，创建 PR。issue 即合同，不再读取本地 PRD/测试文档文件。
argument-hint: <issue-number>
---

# 实现 Issue

从 GitHub issue 读取完整的 PRD + 验收标准 + TC-ID，按 TDD 流程实现，最终创建 PR。

## 触发条件

- "实现 issue #123"
- "implement issue 123"
- "开发 #45"

## 工作流

### Phase 0：准备

1. **确认 gh 可用**：`gh auth status`
2. **语言约定**：issue/PR/评论默认中文；代码、命令、技术词保留英文

### Phase 1：分析 Issue

1. **获取 Issue 详情**：
   ```bash
   gh issue view $ISSUE_NUMBER --json title,body,labels,comments
   ```

2. **从 Issue Body 解析**：
   - 背景和目标
   - 验收标准（checkbox 列表）
   - TC-ID 和测试用例
   - 技术说明和依赖

3. **探索代码库**：
   - 定位受影响的文件和组件
   - 理解现有模式和架构
   - 确认测试目录结构

4. **规划任务**：
   - 按验收标准拆分为具体实现步骤
   - 识别需要修改/创建的文件
   - 确认测试覆盖要求

### Phase 2：澄清（如需要）

通过对话向用户澄清：
- 需求模糊或不完整
- 多种实现方案需要选择
- 范围边界不清晰

### Phase 3：开发（TDD）

按照 TDD 严格流程（参考 `/tdd` skill）：

1. **Red commit**：
   - 只写测试文件（`backend/tests/`）
   - 每个 TC-ID 对应一个 `describe('TC-F-001: ...', () => { it(...) })`
   - `bun test` 必须失败
   - 提交：`test(<scope>): <中文描述>`

2. **Green commit**：
   - 只改实现文件（`backend/src/`）
   - 最小实现使测试通过
   - `bun test && bunx tsc --noEmit` 必须通过
   - 提交：`feat(<scope>): <中文描述>`

3. **Refactor**（可选）：
   - 重命名/提取/简化
   - 不改测试断言语义
   - `bun test` 仍通过

### Phase 4：进度更新

每个验收标准完成后：
```bash
gh issue comment $ISSUE_NUMBER --body "$(cat <<'EOF'
✅ 进度更新

- 已完成：<验收标准>
- 变更摘要：<1-3 条>
- 验证：`cd backend && bun test && bunx tsc --noEmit`（PASS）

EOF
)"
```

### Phase 5：创建 PR

1. **确认完成**：
   - 所有验收标准满足
   - 所有 TC-ID 有对应 `it()` 且测试通过
   - 类型检查通过

2. **创建分支**：
   ```bash
   git checkout -b issue-$ISSUE_NUMBER
   ```

3. **提交并推送**：
   ```bash
   git push -u origin issue-$ISSUE_NUMBER
   ```

4. **创建 PR**：
   ```bash
   gh pr create \
     --title "feat: <简述> #$ISSUE_NUMBER" \
     --body "$(cat <<'EOF'
   ## 摘要

   实现 #$ISSUE_NUMBER。

   ## 变更

   - [关键变更 1]
   - [关键变更 2]

   ## 测试

   - `cd backend && bun test && bunx tsc --noEmit`
   - 结果：PASS

   Closes #$ISSUE_NUMBER
   EOF
   )"
   ```

### Phase 6：错误处理

- Issue 获取失败：检查 issue 编号和仓库权限
- 开发阻塞：在 issue 中评论说明阻塞原因
- PR 创建失败：检查合并冲突、分支状态

## 关键原则

- **Issue 是唯一需求来源**：不从本地文件读取需求
- **TDD 严格分离**：测试和实现不在同一个 commit
- **TC-ID 可追踪**：每个 TC-ID 都有对应的 `describe` + `it`
- **持续同步**：进度更新到 issue comment
