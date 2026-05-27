# UI Specification: Coding Teams MVP

**Version**: 1.0
**Date**: 2026-05-27
**Source PRD**: `docs/prd/coding-teams.md`
**Issue**: https://github.com/CaiZongyuan/coding-team/issues/1

## Product Direction

The MVP UI is a simple local operations console. It should help the user submit a goal, see which agents/runtimes are available, inspect task status, and watch agent output in real time. It is not a marketing page, project management suite, or permissions product.

The interface should be quiet, dense, and operational. Prioritize scanability, predictable navigation, and clear execution state over decorative layout.

## Pages / Routes

- **/**: Dashboard with goal input, agent/runtime status summary, recent tasks, and active output preview.
- **/agents**: Agent list and lightweight configuration.
- **/runtimes**: Daemon and runtime discovery status.
- **/tasks**: Task queue list with filters.
- **/tasks/:taskId**: Task detail with prompt, status, real-time message stream, result, and error.
- **/settings**: Single-workspace context and daemon setup notes.

## Page Details

### /

- **Primary Actions**:
  - Submit a new goal.
  - Open the active task detail.
  - Navigate to agents, runtimes, or task queue.
- **Visible Data**:
  - Goal input textarea.
  - Submit button with loading state.
  - Online runtime count.
  - Available agent count.
  - Running task count.
  - Recent task list.
  - Latest real-time output from the active task.
- **UI States**:
  - `loading`: skeleton rows for status panels and recent tasks.
  - `empty`: no tasks yet; goal input remains primary.
  - `error`: inline API error near affected panel.
  - `success`: submitted goal appears immediately as root task.
- **Form Validation**:
  - Goal text is required.
  - Empty or whitespace-only goal shows: `请输入要交给 Coding Teams 的目标。`
- **Accessibility**:
  - Goal input receives focus on first load.
  - Submit button has accessible loading text.
  - Status badges must not rely on color alone.

### /agents

- **Primary Actions**:
  - Create agent.
  - Edit agent name, provider, runtime binding, instructions, and max concurrency.
- **Visible Data**:
  - Agent name.
  - Provider.
  - Bound runtime.
  - Status: idle, working, blocked, error, offline.
  - Current task count.
- **UI States**:
  - `loading`: table skeleton.
  - `empty`: no agents configured.
  - `error`: failed to load or save agent.
  - `success`: updated row reflects saved config.
- **Form Validation**:
  - Name is required.
  - Provider is required.
  - Runtime must match provider if selected.
  - Max concurrency must be a positive integer.
- **Accessibility**:
  - Agent edit form uses labels for all fields.
  - Provider/runtime selectors are keyboard navigable.

### /runtimes

- **Primary Actions**:
  - Refresh runtime list.
  - Open daemon setup notes in settings.
- **Visible Data**:
  - Daemon hostname.
  - Daemon status and last seen time.
  - Runtime provider, command/version, capabilities, and status.
  - Detection state: ready, needs_config, or missing.
- **UI States**:
  - `loading`: table skeleton.
  - `empty`: daemon has not registered.
  - `error`: failed to load runtimes.
  - `success`: online/offline state visible.
- **Accessibility**:
  - Runtime capability chips have text labels.
  - Last seen values include readable timestamps.

### /tasks

- **Primary Actions**:
  - Filter by status.
  - Filter by agent or runtime.
  - Open task detail.
  - Cancel eligible task.
- **Visible Data**:
  - Task title.
  - Status.
  - Priority.
  - Assigned agent/runtime.
  - Attempt number.
  - Created/started/completed timestamps.
- **UI States**:
  - `loading`: table skeleton.
  - `empty`: no tasks match filters.
  - `error`: failed to load tasks or cancel task.
  - `success`: status updates via WebSocket.
- **Accessibility**:
  - Filters are standard select controls.
  - Row action buttons have accessible labels.

### /tasks/:taskId

- **Primary Actions**:
  - Cancel running or queued task.
  - Copy task result.
  - Return to task list.
- **Visible Data**:
  - Task title and description/prompt.
  - Current status.
  - Assigned agent and runtime.
  - Attempt chain if retry child tasks exist.
  - Real-time message stream.
  - Final result.
  - Error and failure reason when failed.
- **Real-Time Output Requirements**:
  - The message stream is the primary content area.
  - New messages append without shifting surrounding layout unexpectedly.
  - Message types render distinctly:
    - `text`: normal agent output.
    - `thinking`: subdued internal progress style.
    - `tool_use`: compact command/tool call block.
    - `tool_result`: compact result block.
    - `status`: small timeline state update.
    - `error`: high-contrast error row.
  - Messages are sorted by `seq`.
  - On WebSocket reconnect, client fetches `GET /api/tasks/:id/messages?afterSeq=<lastSeq>`.
- **UI States**:
  - `loading`: task header and stream skeleton.
  - `empty`: no messages yet; show waiting state inside stream area.
  - `error`: failed task shows error text and timestamp.
  - `success`: completed task shows result section after stream.
- **Accessibility**:
  - Message stream uses an `aria-live="polite"` region for new status/output.
  - Cancel task button is disabled for completed, failed, or cancelled tasks.
  - Long tool outputs preserve readable wrapping and scrolling.

### /settings

- **Primary Actions**:
  - Edit workspace context.
  - View daemon start command/config notes.
- **Visible Data**:
  - Workspace name.
  - Workspace context textarea.
  - Server URL used by daemon.
  - MVP notice: no user auth in this release; intended for local/dev use.
- **UI States**:
  - `loading`: form skeleton.
  - `error`: failed to save settings.
  - `success`: saved confirmation.

## Components

- **GoalComposer**: textarea, submit button, loading/error state.
- **StatusBadge**: status text plus icon/color for agent, runtime, and task states.
- **RuntimeTable**: daemon/runtime rows with provider and last seen fields.
- **AgentTable**: agent configuration and status rows.
- **TaskTable**: sortable/filterable task list.
- **TaskMessageStream**: ordered real-time output panel with reconnect recovery.
- **TaskMessageRow**: message renderer for text, thinking, tool_use, tool_result, status, and error.
- **TaskHeader**: task title, status, agent/runtime, timestamps, and actions.
- **EmptyState**: compact operational empty state, not marketing content.

## Copywriting

- Primary language: Chinese UI copy.
- Technical terms may remain English: agent, runtime, daemon, task, provider, WebSocket, E2E.
- Buttons:
  - Submit goal: `提交目标`
  - Cancel task: `取消任务`
  - Refresh: `刷新`
  - Copy result: `复制结果`
- Empty states:
  - No tasks: `还没有任务，先提交一个目标。`
  - No runtimes: `还没有 daemon 上报 runtime。`
  - No messages: `等待 agent 输出...`
- Errors:
  - Goal required: `请输入要交给 Coding Teams 的目标。`
  - Load failed: `加载失败，请稍后重试。`
  - Cancel failed: `取消任务失败，请查看任务状态。`

## Layout Notes

- Use a persistent top navigation or compact sidebar with Dashboard, Agents, Runtimes, Tasks, and Settings.
- Use tables for repeated operational data.
- Avoid landing-page hero sections.
- Avoid nested cards and decorative backgrounds.
- Keep controls compact enough for repeated use.
- The Task Detail message stream should be vertically spacious and easy to scan.

## E2E Acceptance Coverage

- Dashboard submits a goal and shows the created root task.
- Runtimes page displays daemon-registered runtime.
- Tasks page updates task status after API state changes.
- Task Detail displays appended `task.progress` messages in order.
- Task Detail recovers messages after simulated WebSocket disconnect by fetching messages after the last sequence.
- Failed task displays failure state and error text.
