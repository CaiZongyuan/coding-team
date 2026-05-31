---
name: tdd
description: 执行严格的 TDD（测试驱动开发）循环。输入验收标准和测试命令，按 Red/Green/Refactor 循环实现。
argument-hint: [acceptance-criterion]
---

# TDD

严格的 Red/Green/Refactor 循环，配合 pre-commit hook 强制测试和实现文件分离。

## 必要输入

开始前确认：
- `acceptance_criteria`：描述预期行为
- `test_command`：验证命令（如 `cd backend && bun test`）
- `test_directory`：测试目录（默认 `backend/tests/`）

缺少时只问缺失字段。

## 硬性规则

1. **Red 阶段**只改 `test_directory` 下的文件
2. **Green 阶段**只改实现文件，不动测试
3. 每阶段结束必须运行 `test_command`
4. 环境问题（缺依赖、配置错误）→ 立即停止报告
5. Green diff 保持最小和聚焦
6. Refactor 不改变测试断言语义
7. 默认创建 `TDD:` 前缀的 checkpoint commit

## 预检

1. `git status --short` 检查仓库状态
2. 如果有无关 staged changes → 停止（checkpoint commit 无法隔离）
3. 定位最小实现区域
4. 确认目标测试文件

## 工作流

### 1. Red

只在 `test_directory` 下写测试。

1. 添加最小测试覆盖缺失行为
2. 不碰实现文件
3. 运行 `test_command`
4. 确认失败是因为功能缺失，不是环境问题
5. 记录失败原因

如果测试意外通过，加强测试直到它因正确原因失败。

### 2. Green

只改实现文件。

1. 不动测试文件
2. 实现最小代码使测试通过
3. 运行 `test_command`
4. 确认全部通过

### 3. Refactor

仅在能提升清晰度时执行。

允许：重命名、去重、提取小函数、简化控制流
禁止：改测试断言语义、大范围重写、混入新行为

### 4. Checkpoint

1. Stage 本次循环的文件
2. `git commit -m "TDD: <验收标准简述>"`
3. 验证 `git log -1 --pretty=%s` 以 `TDD:` 开头

如果用户要求不提交或环境不允许 → 跳过 commit，给出变更摘要 + 测试证据。

## 验证

完成前检查：
1. `test_command` 通过
2. 最新 commit 以 `TDD:` 开头（如执行了 commit）
3. `git diff HEAD~1 --name-only` 包含测试文件和实现文件

任何检查失败 → 报告具体失败项，不声称完成。

## 输出格式

1. 使用的输入：验收标准、测试命令、测试目录
2. Red 摘要：改了哪些测试文件、失败原因
3. Green 摘要：改了哪些实现文件、通过证据
4. Refactor 摘要：做了什么清理，或明确跳过
5. Checkpoint：commit hash 和 subject
6. 验证结果

保持简洁，但必须包含 Red 的具体失败原因。
