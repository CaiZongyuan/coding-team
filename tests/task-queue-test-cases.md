# Test Cases: Task Queue & Task Message Stream

**Issue**: #10, #11
**Source API**: `docs/api/coding-teams.md`

## Coverage Matrix

### Task Queue (#10)

| TC-ID | Description | Status |
|-------|-------------|--------|
| TC-TQ-001 | Create task with title and description | Missing |
| TC-TQ-002 | Create task with custom priority | Missing |
| TC-TQ-003 | Create task rejects missing title | Missing |
| TC-TQ-004 | List tasks returns all tasks | Missing |
| TC-TQ-005 | List tasks filters by status | Missing |
| TC-TQ-006 | Get task by ID returns single task | Missing |
| TC-TQ-007 | Get task returns 404 for unknown ID | Missing |
| TC-TQ-008 | Claim picks highest priority queued task | Missing |
| TC-TQ-009 | Claim returns 204 when no eligible tasks | Missing |
| TC-TQ-010 | Claim sets task to dispatched with daemon/runtime binding | Missing |
| TC-TQ-011 | Start transitions dispatched task to running | Missing |
| TC-TQ-012 | Start rejects task not in dispatched state | Missing |
| TC-TQ-013 | Cancel transitions queued task to cancelled | Missing |
| TC-TQ-014 | Cancel transitions dispatched task to cancelled | Missing |
| TC-TQ-015 | Cancel returns 409 for completed task | Missing |
| TC-TQ-016 | Cancel returns 404 for unknown task | Missing |

### Task Message Stream (#11)

| TC-ID | Description | Status |
|-------|-------------|--------|
| TC-MS-001 | Append messages to a running task | Missing |
| TC-MS-002 | Messages returned in seq order | Missing |
| TC-MS-003 | Duplicate seq with identical content is idempotent | Missing |
| TC-MS-004 | Duplicate seq with different content returns 409 | Missing |
| TC-MS-005 | Report completed result | Missing |
| TC-MS-006 | Report failed result | Missing |
| TC-MS-007 | Heartbeat updates lastHeartbeatAt | Missing |
| TC-MS-008 | Append to non-existent task returns 404 | Missing |
| TC-MS-009 | Append to non-running task returns 409 | Missing |
| TC-MS-010 | GET messages supports afterSeq pagination | Missing |
| TC-MS-011 | GET messages for non-existent task returns 404 | Missing |

### Dashboard (#10 supplementary)

| TC-ID | Description | Status |
|-------|-------------|--------|
| TC-DB-001 | Dashboard includes task list section | Missing |
| TC-DB-002 | Dashboard fetches both runtimes and tasks | Missing |

## Test Case Details

### TC-TQ-001: Create task with title and description

- **Endpoint**: `POST /api/tasks`
- **Request**: `{ title: "Implement API route", description: "Create Hono route for task messages." }`
- **Expected**: 201 with `{ task: { id, title, description, status: "queued", priority: 50, ... } }`

### TC-TQ-002: Create task with custom priority

- **Endpoint**: `POST /api/tasks`
- **Request**: `{ title: "Urgent fix", description: "Fix auth bug", priority: 10 }`
- **Expected**: 201, `task.priority === 10`

### TC-TQ-003: Create task rejects missing title

- **Endpoint**: `POST /api/tasks`
- **Request**: `{ description: "No title" }`
- **Expected**: 400 VALIDATION_ERROR

### TC-TQ-004: List tasks returns all tasks

- **Setup**: Create 2 tasks
- **Endpoint**: `GET /api/tasks`
- **Expected**: 200 with `{ tasks: [...], total: 2 }`

### TC-TQ-005: List tasks filters by status

- **Setup**: Create 1 task, claim it (dispatched)
- **Endpoint**: `GET /api/tasks?status=queued`
- **Expected**: 200, only queued tasks returned

### TC-TQ-006: Get task by ID

- **Setup**: Create a task, capture ID
- **Endpoint**: `GET /api/tasks/:id`
- **Expected**: 200 with full task record

### TC-TQ-007: Get task returns 404 for unknown ID

- **Endpoint**: `GET /api/tasks/non-existent-id`
- **Expected**: 404

### TC-TQ-008: Claim picks highest priority queued task

- **Setup**: Create tasks with priority 30, 10, 50
- **Endpoint**: `POST /api/daemon/tasks/claim` with `{ daemonId, runtimeId }`
- **Expected**: Returns task with priority 10

### TC-TQ-009: Claim returns 204 when no eligible tasks

- **Setup**: Empty task queue
- **Endpoint**: `POST /api/daemon/tasks/claim`
- **Expected**: 204 no body

### TC-TQ-010: Claim sets dispatched with daemon/runtime binding

- **Setup**: Create a queued task
- **Endpoint**: `POST /api/daemon/tasks/claim`
- **Expected**: Task status = dispatched, runtimeId and daemonId set

### TC-TQ-011: Start transitions dispatched to running

- **Setup**: Create + claim a task
- **Endpoint**: `POST /api/daemon/tasks/:id/start`
- **Expected**: Task status = running, startedAt is set

### TC-TQ-012: Start rejects non-dispatched task

- **Setup**: Create a task (still queued, not claimed)
- **Endpoint**: `POST /api/daemon/tasks/:id/start`
- **Expected**: 409

### TC-TQ-013: Cancel queued task

- **Setup**: Create a task
- **Endpoint**: `POST /api/tasks/:id/cancel`
- **Expected**: 202, task status = cancelled

### TC-TQ-014: Cancel dispatched task

- **Setup**: Create + claim a task
- **Endpoint**: `POST /api/tasks/:id/cancel`
- **Expected**: 202, task status = cancelled

### TC-TQ-015: Cancel completed task returns 409

- **Setup**: Create → claim → start → result(completed) a task
- **Endpoint**: `POST /api/tasks/:id/cancel`
- **Expected**: 409

### TC-TQ-016: Cancel unknown task returns 404

- **Endpoint**: `POST /api/tasks/non-existent/cancel`
- **Expected**: 404

---

### TC-MS-001: Append messages to running task

- **Setup**: Create → claim → start a task
- **Endpoint**: `POST /api/daemon/tasks/:id/messages`
- **Request**: `{ messages: [{ seq: 1, type: "text", content: "Hello" }] }`
- **Expected**: 201, `{ inserted: 1, lastSeq: 1 }`

### TC-MS-002: Messages returned in seq order

- **Setup**: Append messages with seq 3, 1, 2 (out of order)
- **Endpoint**: `GET /api/tasks/:id/messages`
- **Expected**: Messages ordered by seq: 1, 2, 3

### TC-MS-003: Duplicate seq identical content is idempotent

- **Setup**: Append seq=1 twice with same content
- **Expected**: Second call returns 200, `{ inserted: 0, lastSeq: 1 }`

### TC-MS-004: Duplicate seq different content returns 409

- **Setup**: Append seq=1 with content "A", then seq=1 with content "B"
- **Expected**: Second call returns 409

### TC-MS-005: Report completed result

- **Setup**: Running task
- **Endpoint**: `POST /api/daemon/tasks/:id/result`
- **Request**: `{ status: "completed", result: "Done" }`
- **Expected**: 200, task status = completed, result set

### TC-MS-006: Report failed result

- **Setup**: Running task
- **Endpoint**: `POST /api/daemon/tasks/:id/result`
- **Request**: `{ status: "failed", error: "timeout" }`
- **Expected**: 200, task status = failed, error set

### TC-MS-007: Heartbeat updates lastHeartbeatAt

- **Setup**: Running task
- **Endpoint**: `POST /api/daemon/tasks/:id/heartbeat`
- **Expected**: 204, task.lastHeartbeatAt is updated

### TC-MS-008: Append to non-existent task returns 404

- **Endpoint**: `POST /api/daemon/tasks/non-existent/messages`
- **Expected**: 404

### TC-MS-009: Append to non-running task returns 409

- **Setup**: Create a task (still queued)
- **Endpoint**: `POST /api/daemon/tasks/:id/messages`
- **Expected**: 409

### TC-MS-010: GET messages with afterSeq

- **Setup**: Append seq 1-5
- **Endpoint**: `GET /api/tasks/:id/messages?afterSeq=3`
- **Expected**: Only seq 4, 5 returned

### TC-MS-011: GET messages for non-existent task returns 404

- **Endpoint**: `GET /api/tasks/non-existent/messages`
- **Expected**: 404
