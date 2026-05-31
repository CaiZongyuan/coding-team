---
name: review-pr
description: 审查 PR：代码分析、修复问题、合并。输入 PR 编号做单 PR 审查，或 issue:N 做 Epic 批量审查。
argument-hint: <pr-number> or issue:<epic-number>
---

# PR 审查

全面的 PR 审查流程：代码分析、CI 验证、问题修复、合并执行。支持单 PR 和 Epic 批量两种模式。

## 触发条件

- "review PR #123"
- "review issue:45"（Epic 批量）
- "merge PR"
- "code review"

## 默认约定

- **语言**：review 结论 / PR 评论默认中文；代码、命令保留英文
- **角色分离**：Reviewer（只审不改）→ Fixer（只修复）→ QA（只验证）

## 模式检测

1. 输入 `issue:N` → Epic 批量审查
2. 输入数字 → 单 PR 审查
3. 无输入 → 列出 open PR 让用户选择

## Epic 批量审查

1. 获取 Epic issue 详情和子 issue 列表
2. 查找每个子 issue 关联的 PR
3. 按 dependency 顺序逐个审查
4. 全部完成后在 Epic issue 发表总结评论

## 单 PR 审查流程

### Phase 1：获取上下文

```bash
gh pr view $PR_NUMBER --json title,body,author,baseRefName,headRefName,url
gh pr diff $PR_NUMBER
gh pr checks $PR_NUMBER --json name,status,conclusion
```

检查 PR body 中的 `Closes #N`，获取关联 issue 的上下文。

### Phase 2：代码审查

审查维度：
- **正确性**：逻辑错误、边界处理、空值处理
- **规范**：项目模式、命名、结构
- **性能**：低效算法、不必要操作
- **测试**：覆盖缺口、缺失用例
- **安全**：输入校验、权限检查

分类：
- **[Critical]**：必须修复（bug、安全问题）
- **[Suggestion]**：建议改进
- **[Approved]**：无问题

### Phase 3：CI 分析

CI 失败时：
```bash
gh run view $RUN_ID --log-failed
```
分类失败类型：测试失败 / lint 错误 / 构建错误

### Phase 4：修复循环

有 [Critical] 或 CI 失败时：
1. 修复每个问题
2. `git add -A && git commit -m "fix: ..." && git push`
3. 等待 CI：`gh pr checks $PR_NUMBER --watch`
4. 最多 3 轮修复

### Phase 5：审查结论

```bash
gh pr review $PR_NUMBER --approve --body "$(cat <<'EOF'
## Code Review 总结

### 变更
- [1-3 条关键变更]

### 发现
- [问题或 "未发现问题"]

### CI 状态
- ✅ All checks passing

### 结论
同意合并。

EOF
)"
```

### Phase 6：合并

仅在用户要求合并时执行：
```bash
gh pr merge $PR_NUMBER --squash --delete-branch
```

冲突时停止，通知用户手动 rebase。

## 错误处理

- CI 持续失败（3 轮后）：总结阻塞原因，在 PR 评论，不合并
- PR 有冲突：通知用户，停止
- PR 已合并/关闭：报告状态，退出
