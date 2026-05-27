# Product Requirements Document: Coding Teams MVP

**Version**: 1.0
**Date**: 2026-05-27
**Author**: Sarah / Product Owner
**Quality Score**: 92/100
**Issue**: https://github.com/CaiZongyuan/coding-team/issues/1

---

## Executive Summary

Coding Teams MVP is a local-first multi-agent coordination platform for coding agents. It connects locally available Coding Agent CLIs through a daemon, lets a Manager Agent split a user goal into executable tasks, dispatches those tasks to suitable agents, and streams execution output back into a simple Web UI.

The first release is intentionally narrow. It does not include user authentication, organization permissions, marketplaces, or automation products. Success is measured by whether the core product flow can be proven through end-to-end tests: discover agents, submit a goal, create tasks, execute through daemon/runtime, stream output, and complete with persisted results.

---

## Problem Statement

**Current Situation**: Developers can run tools such as Claude Code, Codex, Gemini, or other agent CLIs locally, but there is no unified local coordination layer that can discover those agents, assign work, show execution state, and preserve task output in one place.

**Proposed Solution**: Build a Web UI, Hono API, PostgreSQL persistence layer, and local daemon that together support goal submission, Manager-driven task decomposition, runtime discovery, task claiming, execution reporting, and real-time agent output viewing.

**Business Impact**: The MVP creates a testable foundation for a multi-agent coding team. It reduces manual coordination cost and establishes the core architecture needed for later reliability, permissions, skills, automation, and marketplace features.

---

## Success Metrics

**Primary KPIs:**
- E2E goal execution: An end-to-end test can submit a goal and observe the root task complete successfully.
- E2E runtime discovery: An end-to-end test can register a daemon, upsert at least one runtime, and show it in the UI.
- E2E real-time output: An end-to-end test can append task messages and verify the UI receives and displays agent output in order.
- E2E failure visibility: An end-to-end test can simulate task failure and verify failed state, error text, and retry eligibility are visible.

**Validation**: MVP acceptance requires the E2E suite to pass for the core daemon, task queue, Manager, and UI observation flows. Unit and integration tests may support implementation, but the release gate is end-to-end behavior.

---

## User Personas

### Primary: Local AI Coding Team Operator
- **Role**: Developer or technical operator running multiple coding agents on a local machine.
- **Goals**: Submit a high-level coding goal, let the system split work, and watch agents execute tasks.
- **Pain Points**: Manual task coordination, scattered CLI output, no unified status view, and limited recoverability when an agent fails.
- **Technical Level**: Advanced.

### Secondary: Product Builder / Maintainer
- **Role**: Builder extending the Coding Teams platform.
- **Goals**: Understand stable product, API, and UI contracts before implementing features.
- **Pain Points**: Architecture docs exist, but implementation-ready acceptance criteria and UI/API contracts are missing.
- **Technical Level**: Advanced.

---

## User Stories & Acceptance Criteria

### Story 1: Discover Local Agent Runtimes

**As a** local AI coding team operator
**I want to** run a daemon that discovers local Coding Agent CLIs
**So that** the platform knows which runtimes are available for work

**Acceptance Criteria:**
- [ ] Daemon can register itself with hostname, version, and device metadata.
- [ ] Daemon can report discovered runtimes with provider, command, version, capabilities, and status.
- [ ] Web UI can show online/offline runtime state without requiring user auth.
- [ ] E2E test verifies a daemon registration appears in the runtime list.

### Story 2: Submit a Goal and Create Tasks

**As a** local AI coding team operator
**I want to** submit a natural language goal
**So that** the Manager Agent can turn it into trackable tasks

**Acceptance Criteria:**
- [ ] Web UI can submit a goal to the API.
- [ ] API creates a root task for the goal.
- [ ] Manager service can create structured subtasks with title, description, priority, dependencies, and routing hints.
- [ ] E2E test verifies task creation after goal submission.

### Story 3: Claim and Execute Tasks

**As a** daemon
**I want to** claim queued tasks and report execution lifecycle events
**So that** local agent CLIs can perform assigned work and persist results

**Acceptance Criteria:**
- [ ] Daemon can claim an eligible task atomically.
- [ ] Task state can progress through queued, dispatched, running, completed, failed, and cancelled.
- [ ] Daemon can append ordered execution messages.
- [ ] Daemon can report final success or failure.
- [ ] E2E test verifies a claimed task reaches completed state with a result.

### Story 4: Observe Real-Time Agent Output

**As a** local AI coding team operator
**I want to** see agent output as it streams in
**So that** I can understand what the agent is doing and diagnose failures

**Acceptance Criteria:**
- [ ] Task Detail page shows task status, assigned agent/runtime, prompt, message stream, result, and error.
- [ ] Message stream supports text, thinking, tool_use, tool_result, status, and error message types.
- [ ] Messages render in sequence order.
- [ ] E2E test verifies appended messages appear in the UI in real time or after WebSocket reconnect/poll fallback.

---

## Functional Requirements

### Core Features

**Feature 1: Daemon and Runtime Registry**
- Description: Register local daemon instances and their discovered Coding Agent runtimes.
- User flow: Start daemon, daemon detects providers, daemon posts registration, UI shows runtime status.
- Edge cases: CLI missing, CLI installed but not configured, daemon offline, duplicate provider registration.
- Error handling: Registration returns structured validation errors; stale heartbeats mark daemon/runtime offline.

**Feature 2: Agent Configuration**
- Description: Define lightweight agent identities that bind instructions and provider preferences to a runtime.
- User flow: User creates agent, selects provider/runtime, sets name and instructions, then tasks can route to that agent.
- Edge cases: Runtime offline, provider mismatch, max concurrency reached.
- Error handling: API rejects invalid runtime/provider combinations and surfaces usable error messages.

**Feature 3: Goal and Task Queue**
- Description: Accept a user goal, create a root task, generate subtasks, and dispatch runnable tasks.
- User flow: User submits goal, Manager creates plan, Task Queue stores queued tasks, daemon claims work.
- Edge cases: No online runtime, Manager cannot produce valid subtasks, task dependency not complete.
- Error handling: Root task enters failed or waiting state with visible error and next step.

**Feature 4: Real-Time Task Messages**
- Description: Persist and broadcast agent execution messages.
- User flow: Daemon appends messages while agent runs; API persists them; Web UI displays them in Task Detail.
- Edge cases: WebSocket disconnect, out-of-order delivery, duplicate message sequence.
- Error handling: Client can recover by fetching messages from `GET /api/tasks/:id/messages`.

### Out of Scope

- User authentication, organization permissions, roles, invites, and billing.
- Full issue board, project board, labels, subscribers, and inbox.
- Skill marketplace, UGC marketplace, and self-evolving agent systems.
- Autopilot, cron, webhook automation, and cloud runtime pools.
- Desktop app, tray app, auto-update, or multi-tab desktop workflow.
- Physical devices, lab automation, or external hardware integrations.

---

## Technical Constraints

### Performance
- Runtime and task lists should load within 1 second in local development for typical MVP datasets.
- New task messages should appear in the UI within 1 second when WebSocket is connected.
- Daemon heartbeat interval defaults to 15 seconds.
- Daemon claim loop defaults to 3 seconds, with WebSocket notification as a latency optimization.

### Security
- MVP does not include user auth.
- Local execution risk must be acknowledged in docs and tests.
- Daemon must not expose secrets in task messages.
- Future auth/token design must not be blocked by schema choices, but it is not required for MVP acceptance.

### Integration
- **Web UI**: TanStack Start, React 19, Vite, Tailwind CSS, shadcn/ui-compatible component patterns.
- **API**: Hono HTTP API plus WebSocket hub.
- **DB**: PostgreSQL with Drizzle ORM.
- **Daemon**: Bun/TypeScript local process.
- **Agent CLIs**: MVP should support a provider adapter interface and initially validate with mocked providers or available local CLIs.

### Technology Stack
- TypeScript across web, API, daemon, and shared protocol packages.
- Bun workspace for monorepo scripts and dependency management.
- PostgreSQL for persistent workspace, daemon, runtime, agent, task, and task message data.

---

## MVP Scope & Phasing

### Phase 1: MVP
- Single-workspace local-first operation.
- Daemon registration, heartbeat, and runtime discovery.
- Lightweight agents bound to provider/runtime configuration.
- Goal submission and Manager-generated subtasks.
- Task queue claim/start/message/result lifecycle.
- Simple Web UI for goal submission, runtime/agent/task state, and real-time task output.
- E2E tests for discovery, goal execution, message streaming, and failure visibility.

**MVP Definition**: A local developer can run the platform, register at least one daemon/runtime, submit a goal, observe generated tasks, see agent output, and verify completion through end-to-end tests.

### Phase 2: Reliability Enhancements
- Lease sweeper and retry child task chains.
- Daemon restart recovery.
- More robust provider adapters for Claude, Codex, Gemini, OpenClaw, Hermes, and other CLIs.
- Better Manager routing by provider, capabilities, load, and task affinity.

### Future Considerations
- User auth and workspace permissions.
- Multi-tenant organizations.
- Skill and workflow marketplace.
- Autopilot and webhook-triggered tasks.
- Cloud runtime pool and desktop distribution.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| Provider CLI outputs differ significantly | High | Medium | Define adapter contract and normalize output into task message types. |
| Real-time UI becomes unreliable under reconnects | Medium | High | Persist ordered messages and support fetch fallback by sequence. |
| Manager creates tasks that cannot be routed | Medium | High | Validate plan against online runtimes before dispatch. |
| Local agent process hangs or crashes | Medium | High | Track heartbeat, timeout, cancellation, and failed state visibly. |
| No auth in MVP causes confusion about deployment scope | Medium | Medium | Document MVP as local-first/dev-only and keep auth out of release criteria. |

---

## Dependencies & Blockers

**Dependencies:**
- PostgreSQL development database.
- Bun runtime.
- Hono API server package.
- TanStack Start web app.
- At least one mock or local provider adapter for E2E tests.

**Known Blockers:**
- Current repository has architecture docs but no implemented API/daemon/shared packages yet.
- E2E framework and fixtures must be selected during implementation.

---

## Appendix

### Glossary
- **Agent**: A configured worker identity with name, instructions, provider, and runtime binding.
- **Runtime**: A discovered execution environment for a provider CLI on a daemon host.
- **Daemon**: Local background process that discovers runtimes, claims tasks, runs CLI processes, and reports output.
- **Manager Agent**: Internal service that turns goals into structured subtasks and routing decisions.
- **Task Message**: Ordered persisted execution event such as text, tool_use, tool_result, status, or error.

### References
- `docs/architecture.md`
- `docs/bio-function-design.md`
- `docs/api/coding-teams.md`
- `docs/ui/coding-teams.md`

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
