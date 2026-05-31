---
name: create-issue
description: 从需求生成 GitHub issue。PRD、验收标准、测试用例全部写在 issue body 中，不再产出本地文档文件。支持 Simple 和 Epic 两种模式。
argument-hint: [feature-name or description]
---

# 创建 Issue

把需求直接变成结构化 GitHub issue。Issue body 即 PRD + 测试用例，不再产出本地文档文件。

## 默认约定

- **语言**：标题/正文默认中文；代码、命令、技术词保留英文
- **Issue 即合同**：issue body 包含完整的 PRD、验收标准、测试用例（TC-ID），后续实现以此为唯一依据
- **不猜需求**：信息不足时每轮只问 2-3 个问题

## 工作流

### Phase 1：复杂度评估

**Simple 信号**：单一 feature/bug fix、1-3 个模块、验收标准清晰、1 个 session 可交付
**Epic 信号**：多端联动、分阶段上线、4+ 模块、需多角色并行

满足 2 条以上 Epic 信号 → Epic 模式；否则 Simple。

### Phase 2A：创建 Simple Issue

1. **收集最小输入**（每轮 2-3 个问题）：
   - 目标/背景
   - 范围（In/Out of scope）
   - 验收标准

2. **生成测试用例**（内嵌在 issue body 中）：

   根据验收标准，在 issue body 中直接列出测试用例，格式：

   ```markdown
   ## 测试用例

   ### TC-F-001: [功能测试标题]
   - 前置条件：...
   - 测试步骤：...
   - 预期结果：...

   ### TC-E-001: [边界测试标题]
   ...

   ### TC-ERR-001: [错误处理测试标题]
   ...
   ```

   TC-ID 前缀规则：TC-F（功能）、TC-E（边界）、TC-ERR（错误处理）、TC-ST（状态转换）

3. **Issue Body 模板**（完整版）：

   ```markdown
   ## 背景

   [问题描述与影响面]

   ## 目标 / 方案

   [高层方案]

   ## 验收标准

   - [ ] [可测试标准 1]
   - [ ] [可测试标准 2]

   ## 测试用例

   | TC-ID | 描述 | 优先级 |
   |-------|------|--------|
   | TC-F-001 | ... | High |
   | TC-F-002 | ... | High |
   | TC-E-001 | ... | Medium |
   | TC-ERR-001 | ... | Medium |

   详细测试用例见下方。

   ### TC-F-001: [标题]
   - 前置条件：...
   - 测试步骤：...
   - 预期结果：...

   [... 更多 TC ...]

   ## 技术说明

   - 风险：...
   - 依赖：...
   - 参考文档：[如有本地 docs/ 文档可引用路径]

   ## 验证方式

   - Test: `cd backend && bun test`
   - Type check: `cd backend && bunx tsc --noEmit`
   ```

4. **创建 Issue**：

   ```bash
   gh issue create \
     --title "[Feature] <中文简述>" \
     --body "<markdown body>" \
     --label "type:feature,priority:p1"
   ```

5. 返回 issue URL，提示用 `/implement-issue <number>` 开始实现。

### Phase 2B：创建 Epic + 子 Issues

1. **拆解**：按验收标准/endpoint/用户路径拆成可独立交付的子任务
2. **创建 Epic Issue**：

   ```bash
   EPIC_NUMBER=$(
     gh issue create \
       --title "[Epic] $TITLE" \
       --body "<epic body>" \
       --label "epic,priority:p1" \
       --json number -q .number
   )
   ```

3. **创建子 Issues**：每个子 issue 同样包含完整的验收标准 + TC-ID
4. **回填 Epic 的 Sub-Issues checklist**

### Labels

```bash
gh label create "priority:p1" --description "High priority" --color "d93f0b" || true
gh label create "type:feature" --description "New feature" --color "0e8a16" || true
```

## 验证

- issue 有清晰的验收标准（checkbox）
- 测试用例覆盖所有验收标准
- TC-ID 唯一且遵循命名规范
- scope 边界明确

## 错误处理

- `gh` 命令失败：贴出 stderr 并停止
- 需求不清：回到提问（每轮 2-3 个问题）
- epic 创建失败：降级为 Simple issue
