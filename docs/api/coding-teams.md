# API Specification: Coding Teams MVP

**Version**: 1.0
**Date**: 2026-05-27
**Source PRD**: `docs/prd/coding-teams.md`
**Issue**: https://github.com/CaiZongyuan/coding-team/issues/1

## Overview

- **Auth**: None for MVP. The product is local-first/dev-only and does not include user auth or permissions.
- **Base URL**: `/api`
- **Transport**: HTTP JSON for commands and queries; WebSocket for real-time task and runtime events.
- **Error Format**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error",
    "details": {}
  }
}
```

## Conventions

- **Idempotency**: Daemon registration and heartbeat endpoints are idempotent by daemon identity. Message append requests must be idempotent by `(task_id, seq)`.
- **Pagination**: MVP list endpoints use `limit` and `offset`; future versions may add cursor pagination.
- **Rate Limit**: None for MVP local development.
- **Timestamps**: ISO 8601 strings with timezone.
- **IDs**: UUID strings.

## Endpoints

### GET /workspaces/current

- **Purpose**: Return the single current workspace for MVP.
- **Permission**: Public local MVP.
- **Response**
  - 200:

```json
{
  "workspace": {
    "id": "uuid",
    "name": "Local Workspace",
    "slug": "local",
    "context": ""
  }
}
```

### GET /agents

- **Purpose**: List configured agents.
- **Permission**: Public local MVP.
- **Query params**: `status`, `provider`, `limit`, `offset`.
- **Response**
  - 200:

```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "Frontend Engineer",
      "description": "Works on React UI tasks",
      "provider": "codex",
      "runtimeId": "uuid",
      "status": "idle",
      "maxConcurrentTasks": 1
    }
  ]
}
```

### POST /agents

- **Purpose**: Create a lightweight agent configuration.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "name": "Reviewer",
  "description": "Reviews code changes",
  "provider": "codex",
  "runtimeId": "uuid",
  "instructions": "Review for bugs and missing tests.",
  "maxConcurrentTasks": 1
}
```

- **Response**
  - 201: created agent.
  - 400: invalid provider/runtime pairing.

### PATCH /agents/:id

- **Purpose**: Update agent name, instructions, runtime binding, or concurrency.
- **Permission**: Public local MVP.
- **Path params**: `id`.
- **Request body**: Partial agent fields.
- **Response**
  - 200: updated agent.
  - 404: agent not found.

### GET /runtimes

- **Purpose**: List detected runtimes and daemon status.
- **Permission**: Public local MVP.
- **Query params**: `status`, `provider`, `daemonId`, `limit`, `offset`.
- **Response**
  - 200:

```json
{
  "runtimes": [
    {
      "id": "uuid",
      "daemonId": "uuid",
      "name": "codex on macbook",
      "provider": "codex",
      "runtimeMode": "local",
      "status": "online",
      "capabilities": {
        "languages": ["typescript"],
        "features": ["filesystem", "tests"]
      },
      "lastSeenAt": "2026-05-27T13:00:00Z"
    }
  ]
}
```

### POST /goals

- **Purpose**: Submit a high-level goal and trigger Manager task planning.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "goal": "Add task detail page with real-time output",
  "workspaceId": "uuid",
  "preferredAgentId": "uuid",
  "constraints": {
    "targetDir": "apps/web"
  }
}
```

- **Response**
  - 201:

```json
{
  "rootTask": {
    "id": "uuid",
    "title": "Add task detail page with real-time output",
    "status": "queued"
  },
  "subtasks": [
    {
      "id": "uuid",
      "title": "Implement task message API",
      "status": "queued",
      "priority": 10
    }
  ]
}
```

- **Edge Cases**
  - No online runtimes: create root task in `waiting` with visible reason.
  - Manager cannot produce valid plan: root task becomes `failed` with error.

### GET /tasks

- **Purpose**: List tasks for dashboard and task queue views.
- **Permission**: Public local MVP.
- **Query params**: `status`, `rootTaskId`, `agentId`, `runtimeId`, `limit`, `offset`.
- **Response**
  - 200:

```json
{
  "tasks": [
    {
      "id": "uuid",
      "rootTaskId": "uuid",
      "parentTaskId": null,
      "agentId": "uuid",
      "runtimeId": "uuid",
      "title": "Implement task queue",
      "description": "Build claim/start/result lifecycle.",
      "status": "running",
      "priority": 10,
      "attempt": 1,
      "createdAt": "2026-05-27T13:00:00Z",
      "startedAt": "2026-05-27T13:01:00Z"
    }
  ]
}
```

### GET /tasks/:id

- **Purpose**: Return task detail for the Task Detail page.
- **Permission**: Public local MVP.
- **Path params**: `id`.
- **Response**
  - 200: task object with agent, runtime, result, and error summary.
  - 404: task not found.

### GET /tasks/:id/messages

- **Purpose**: Fetch ordered persisted task messages for initial render and reconnect recovery.
- **Permission**: Public local MVP.
- **Path params**: `id`.
- **Query params**: `afterSeq`, `limit`.
- **Response**
  - 200:

```json
{
  "messages": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "seq": 1,
      "type": "text",
      "content": "Starting implementation...",
      "createdAt": "2026-05-27T13:01:05Z"
    }
  ]
}
```

### POST /tasks/:id/cancel

- **Purpose**: Request cancellation of a queued, dispatched, or running task.
- **Permission**: Public local MVP.
- **Path params**: `id`.
- **Response**
  - 202: cancellation accepted.
  - 409: task already completed or failed.

### POST /daemon/register

- **Purpose**: Register or update a daemon and its discovered runtimes.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "daemon": {
    "hostname": "macbook-pro",
    "deviceInfo": "darwin-arm64",
    "version": "0.1.0"
  },
  "runtimes": [
    {
      "provider": "codex",
      "name": "codex on macbook-pro",
      "command": "codex",
      "version": "1.0.0",
      "status": "online",
      "capabilities": {
        "languages": ["typescript"],
        "features": ["filesystem", "shell"]
      }
    }
  ]
}
```

- **Response**
  - 200:

```json
{
  "daemonId": "uuid",
  "runtimes": [
    {
      "id": "uuid",
      "provider": "codex",
      "status": "online"
    }
  ]
}
```

### POST /daemon/heartbeat

- **Purpose**: Refresh daemon and runtime liveness.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "daemonId": "uuid",
  "runtimeStatuses": [
    {
      "runtimeId": "uuid",
      "status": "online"
    }
  ]
}
```

- **Response**
  - 204: heartbeat accepted.

### POST /daemon/tasks/claim

- **Purpose**: Atomically claim the next eligible task for a daemon/runtime.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "daemonId": "uuid",
  "runtimeId": "uuid",
  "provider": "codex",
  "capabilities": {
    "languages": ["typescript"]
  }
}
```

- **Response**
  - 200 with task when available.
  - 204 when no eligible task exists.

```json
{
  "task": {
    "id": "uuid",
    "title": "Implement API route",
    "description": "Create Hono route for task messages.",
    "agentId": "uuid",
    "runtimeId": "uuid",
    "context": {}
  }
}
```

### POST /daemon/tasks/:id/start

- **Purpose**: Mark a claimed task as running.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "daemonId": "uuid",
  "runtimeId": "uuid",
  "startedAt": "2026-05-27T13:01:00Z"
}
```

- **Response**
  - 200: updated task status.
  - 409: task is not claimable by this daemon/runtime.

### POST /daemon/tasks/:id/heartbeat

- **Purpose**: Keep a running task lease fresh.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "daemonId": "uuid",
  "runtimeId": "uuid"
}
```

- **Response**
  - 204: heartbeat accepted.

### POST /daemon/tasks/:id/messages

- **Purpose**: Append ordered execution messages and broadcast them to Web UI.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "messages": [
    {
      "seq": 1,
      "type": "text",
      "content": "Starting implementation..."
    },
    {
      "seq": 2,
      "type": "tool_use",
      "tool": "shell",
      "input": {
        "cmd": "bun test"
      }
    }
  ]
}
```

- **Response**
  - 201:

```json
{
  "inserted": 2,
  "lastSeq": 2
}
```

- **Edge Cases**
  - Duplicate `seq`: ignore existing message if identical; return conflict if payload differs.
  - Out-of-order messages: persist by sequence and render sorted by `seq`.

### POST /daemon/tasks/:id/result

- **Purpose**: Report task completion or failure.
- **Permission**: Public local MVP.
- **Request body**:

```json
{
  "status": "completed",
  "result": "Implemented task message API.",
  "error": null,
  "tokenUsage": {
    "inputTokens": 1000,
    "outputTokens": 500
  }
}
```

- **Response**
  - 200: updated task.
  - 409: invalid state transition.

## WebSocket Events

### Client Connection

- **Path**: `/api/ws`
- **Auth**: None for MVP.
- **Client query params**: optional `workspaceId`.

### Server to Web UI

| Event | Payload | Purpose |
|-------|---------|---------|
| `runtime.status_changed` | runtime snapshot | Update dashboard runtime status. |
| `agent.status_changed` | agent snapshot | Update agent list/status. |
| `task.created` | task snapshot | Insert new task into task list. |
| `task.status_changed` | task snapshot | Update task state labels and detail view. |
| `task.progress` | task message | Append real-time agent output. |

### Server to Daemon

| Event | Payload | Purpose |
|-------|---------|---------|
| `task.dispatched` | `{ "runtimeId": "uuid" }` | Prompt daemon to claim immediately. |
| `task.cancel` | `{ "taskId": "uuid" }` | Ask daemon to terminate a local process. |

## Data Models

### TaskStatus

```ts
type TaskStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
```

### TaskMessageType

```ts
type TaskMessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'status'
  | 'error'
```

### AgentProvider

```ts
type AgentProvider =
  | 'claude'
  | 'codex'
  | 'openclaw'
  | 'opencode'
  | 'hermes'
  | 'gemini'
  | 'cursor'
  | 'kimi'
  | 'kiro'
```

## Non-Functional

- API responses for dashboard lists should return within 1 second in local development.
- Task messages must be persisted before broadcast so UI reconnect can recover.
- WebSocket is the fast path; polling `GET /tasks/:id/messages` is the recovery path.
- No user auth is required for MVP; documentation and UI copy must present this as local/dev scope.
