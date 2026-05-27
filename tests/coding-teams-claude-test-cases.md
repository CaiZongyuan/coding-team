# Test Cases: Coding Teams Claude Code MVP

## Overview

- **Feature**: Claude Code runtime detection and daemon registration API
- **Requirements Source**: `docs/prd/coding-teams.md`, `docs/api/coding-teams.md`, GitHub issue #4
- **Test Coverage**: Claude Code detection, daemon registration, runtime listing, validation errors, and state boundaries
- **Last Updated**: 2026-05-27

## Testing Strategy

Automated tests must not invoke a real Claude Code model call and must not require a logged-in Claude account. Provider detection is tested with an injected mock command runner. A real `claude --version` command is allowed only as optional local smoke coverage.

The default validation command for issue #4 is:

```bash
cd backend && bun test
```

Optional local smoke:

```bash
claude --version
```

## Test Case Categories

### 1. Functional Tests

#### TC-F-001: Detect Installed Claude Code Runtime

- **Requirement**: Issue #4 AC: mock `claude --version` success returns `provider=claude`, `status=ready`, and version metadata.
- **Priority**: High
- **Preconditions**:
  - A mock command runner is injected.
  - The mock returns exit code 0 and stdout `2.0.57 (Claude Code)`.
- **Test Steps**:
  1. Call `detectClaudeCodeRuntime` with the mock runner.
  2. Read the returned detection result.
- **Expected Results**:
  - Detection result has `provider` equal to `claude`.
  - Detection result has `command` equal to `claude`.
  - Detection result has `status` equal to `ready`.
  - Detection result includes version `2.0.57`.
  - Detection result includes capabilities for coding, filesystem, and shell workflows.
- **Postconditions**: No real Claude Code process or model call is executed.

#### TC-F-002: Register Claude Runtime Through Daemon API

- **Requirement**: Issue #4 AC: `POST /api/daemon/register` stores a Claude runtime and `GET /api/runtimes` returns it.
- **Priority**: High
- **Preconditions**:
  - Backend app is created with an empty in-memory store.
  - Payload contains daemon metadata and one Claude runtime.
- **Test Steps**:
  1. Send `POST /api/daemon/register` with daemon and runtime payload.
  2. Assert registration response includes `daemonId` and runtime metadata.
  3. Send `GET /api/runtimes`.
- **Expected Results**:
  - Registration returns HTTP 200.
  - Runtime response includes `provider=claude`.
  - Runtime response includes `status=online`.
  - Runtime list returns exactly the registered runtime for the empty store case.
- **Postconditions**: In-memory store contains one daemon and one runtime.

#### TC-F-003: Upsert Existing Claude Runtime

- **Requirement**: `POST /api/daemon/register` is idempotent by daemon identity and provider.
- **Priority**: Medium
- **Preconditions**:
  - Backend app is created with an empty in-memory store.
  - Two registration payloads use the same daemon hostname and Claude provider.
- **Test Steps**:
  1. Register daemon with Claude runtime version `2.0.56`.
  2. Register the same daemon/provider with version `2.0.57`.
  3. Fetch `GET /api/runtimes`.
- **Expected Results**:
  - Runtime list contains one Claude runtime, not duplicates.
  - Runtime metadata reflects the later version.
- **Postconditions**: Runtime upsert preserves stable daemon/provider identity.

### 2. Edge Case Tests

#### TC-E-001: Detect Claude Code With Nonstandard Version Output

- **Requirement**: Detector should tolerate version text that includes labels or extra words.
- **Priority**: Medium
- **Preconditions**:
  - Mock runner returns exit code 0 and stdout `Claude Code 2.1.0-beta`.
- **Test Steps**:
  1. Call `detectClaudeCodeRuntime`.
  2. Inspect version field.
- **Expected Results**:
  - Detection status is `ready`.
  - Version field captures `2.1.0-beta` or preserves raw output when exact parsing is not possible.
- **Postconditions**: Detection remains usable for runtime registration.

#### TC-E-002: Empty Runtime Registration Is Accepted

- **Requirement**: Daemon registration should support a daemon that has no detected runtimes yet.
- **Priority**: Medium
- **Preconditions**:
  - Payload includes valid daemon metadata and an empty `runtimes` array.
- **Test Steps**:
  1. Send `POST /api/daemon/register`.
  2. Fetch `GET /api/runtimes`.
- **Expected Results**:
  - Registration returns HTTP 200.
  - Runtime list remains empty.
  - Daemon identity is still created for future heartbeat/registration work.
- **Postconditions**: Store contains daemon metadata without runtime rows.

### 3. Error Handling Tests

#### TC-ERR-001: Claude Command Missing Does Not Throw

- **Requirement**: Issue #4 AC: command missing returns unavailable/missing state without unhandled exception.
- **Priority**: High
- **Preconditions**:
  - Mock command runner throws an error equivalent to `ENOENT`.
- **Test Steps**:
  1. Call `detectClaudeCodeRuntime`.
  2. Inspect returned detection result.
- **Expected Results**:
  - Function resolves successfully.
  - Detection result has `provider=claude`.
  - Detection result has `status=missing`.
  - Detection result includes a human-readable error message.
- **Postconditions**: No exception escapes to caller.

#### TC-ERR-002: Invalid Registration Payload Returns Structured Validation Error

- **Requirement**: Issue #4 AC: invalid payload returns `VALIDATION_ERROR`.
- **Priority**: High
- **Preconditions**:
  - Backend app is running with an empty in-memory store.
- **Test Steps**:
  1. Send `POST /api/daemon/register` with missing daemon hostname.
  2. Read JSON response.
- **Expected Results**:
  - Response status is HTTP 400.
  - Response body matches the standard error envelope.
  - Error code is `VALIDATION_ERROR`.
  - No runtime is inserted.
- **Postconditions**: Store remains unchanged.

#### TC-ERR-003: Unsupported Provider Is Rejected

- **Requirement**: Initial scope supports Claude Code only.
- **Priority**: High
- **Preconditions**:
  - Payload includes runtime provider `codex`.
- **Test Steps**:
  1. Send `POST /api/daemon/register`.
  2. Read JSON response.
- **Expected Results**:
  - Response status is HTTP 400.
  - Error code is `VALIDATION_ERROR`.
  - Error message states only `claude` is supported in this phase.
- **Postconditions**: Store remains unchanged.

### 4. State Transition Tests

#### TC-ST-001: Runtime Changes From Online To Offline On Re-Registration

- **Requirement**: Runtime status should reflect latest daemon registration payload.
- **Priority**: Medium
- **Preconditions**:
  - Existing Claude runtime is registered as `online`.
- **Test Steps**:
  1. Re-register the same daemon/provider with `status=offline`.
  2. Fetch `GET /api/runtimes`.
- **Expected Results**:
  - Existing runtime status changes to `offline`.
  - Runtime ID remains stable for the same daemon/provider pair.
- **Postconditions**: Store reflects latest runtime state.

## Test Coverage Matrix

| Requirement ID | Test Cases | Coverage Status |
|----------------|------------|-----------------|
| REQ-CLAUDE-DETECT-READY | TC-F-001, TC-E-001 | Complete |
| REQ-CLAUDE-DETECT-MISSING | TC-ERR-001 | Complete |
| REQ-DAEMON-REGISTER | TC-F-002, TC-F-003, TC-E-002 | Complete |
| REQ-RUNTIME-LIST | TC-F-002, TC-ST-001 | Complete |
| REQ-VALIDATION-ERROR | TC-ERR-002, TC-ERR-003 | Complete |
| REQ-NO-REAL-MODEL-CALL | TC-F-001, TC-ERR-001, Testing Strategy | Complete |

## Notes

- Real Claude Code verification is limited to `claude --version` smoke checks.
- Future task execution tests should use a fake Claude runner that emits deterministic stdout/stderr chunks.
- Future UI E2E tests should consume seeded task messages rather than invoking a real model.

## Issue #6 Addendum: Daemon One-Shot Registration and Runtime Dashboard

### Functional Tests

#### TC-F-004: Build Daemon Registration Payload From Ready Claude Detection

- **Requirement**: Issue #6 AC: mock Claude detector ready and verify registration payload.
- **Priority**: High
- **Preconditions**:
  - Mock detection result has `provider=claude`, `status=ready`, version `2.0.57`, and coding/filesystem/shell capabilities.
- **Test Steps**:
  1. Call `buildDaemonRegistration` with hostname, device info, daemon version, and detection result.
  2. Inspect daemon metadata and first runtime.
- **Expected Results**:
  - Payload daemon metadata includes hostname, device info, and daemon version.
  - Payload contains one runtime with `provider=claude`, `status=online`, `command=claude`, version, and capabilities.
- **Postconditions**: No real Claude model call is made.

#### TC-F-005: Daemon Client Posts Registration To Backend

- **Requirement**: Issue #6 AC: mock fetch and verify daemon sends correct JSON to `/api/daemon/register`.
- **Priority**: High
- **Preconditions**:
  - Mock detector returns ready Claude detection.
  - Mock fetch records URL, method, headers, and body.
- **Test Steps**:
  1. Call `registerClaudeRuntime` with mock detector and mock fetch.
  2. Inspect recorded request.
  3. Inspect returned registration response.
- **Expected Results**:
  - Request URL is `<serverUrl>/api/daemon/register`.
  - Request method is `POST`.
  - Request body contains daemon metadata and online Claude runtime.
  - Function returns parsed backend JSON response.
- **Postconditions**: No network call is made in automated tests.

#### TC-F-006: Runtime Dashboard Fetches Runtime API

- **Requirement**: Issue #6 AC: backend homepage serves a simple frontend connected to `/api/runtimes`.
- **Priority**: High
- **Preconditions**:
  - Backend app is created in test with an in-memory store.
- **Test Steps**:
  1. Request `GET /`.
  2. Inspect returned HTML.
- **Expected Results**:
  - Response status is 200.
  - Content type is HTML.
  - HTML includes `Coding Teams Runtime Dashboard`.
  - HTML includes `runtime-list` container.
  - HTML includes `fetch('/api/runtimes')`.
- **Postconditions**: The dashboard can be opened in a browser during local smoke testing.

### Edge Case Tests

#### TC-E-003: Missing Claude Detection Produces No Runtime Registration

- **Requirement**: Issue #6 AC: mock Claude detector missing and ensure no unhandled exception.
- **Priority**: High
- **Preconditions**:
  - Detection result has `status=missing`.
- **Test Steps**:
  1. Call `buildDaemonRegistration`.
  2. Inspect `runtimes`.
- **Expected Results**:
  - Payload includes daemon metadata.
  - Payload has an empty `runtimes` array.
  - Function does not throw.
- **Postconditions**: Backend can still record daemon identity without registering unavailable Claude runtime.

### Smoke Tests

#### TC-SMOKE-001: Real Local Claude Code Registers Into Backend

- **Requirement**: Issue #6 local manual smoke.
- **Priority**: Medium
- **Preconditions**:
  - Claude Code is installed locally.
  - Backend dev server is running.
- **Test Steps**:
  1. Run `cd backend && bun run dev`.
  2. In another terminal run `cd backend && bun run daemon:register`.
  3. Run `curl -sS http://localhost:3000/api/runtimes`.
  4. Open `http://localhost:3000`.
- **Expected Results**:
  - CLI output includes a registered Claude runtime.
  - `/api/runtimes` returns a Claude runtime with version.
  - Dashboard page renders and fetches runtime data.
- **Postconditions**: Runtime data is in-memory and disappears when backend restarts.
