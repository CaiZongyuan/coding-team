# Coding Teams Desktop 端构建方案

## 一、现状分析

### 当前仓库结构
```
coding-teams/
├── backend/          # Hono API + daemon（独立 package.json，Bun runtime）
├── apps/web/         # TanStack Start Web UI（独立 git repo，pnpm）
├── docs/             # 架构文档
├── .claude/skills/   # Claude Code 操作 skills
└── .codex/skills/    # 遗留 harness
```

**问题**：没有根级 workspace 配置，`backend/` 和 `apps/web/` 各自独立管理依赖，无法共享类型和代码。

### 参考架构（Multica）
```
multica/                          # pnpm monorepo + Turborepo
├── apps/
│   ├── web/                      # Next.js Web
│   ├── desktop/                  # Electron 桌面端
│   ├── mobile/                   # Expo React Native
│   └── docs/                     # Fumadocs 文档站
├── packages/
│   ├── core/                     # Headless 业务逻辑（API client、stores、queries）
│   ├── ui/                       # 原子 UI 组件（shadcn 风格）
│   ├── views/                    # 共享业务页面（组合 core + ui）
│   ├── tsconfig/                 # 共享 TypeScript 配置
│   └── eslint-config/            # 共享 ESLint 配置
└── server/                       # Go 后端
```

Multica 的关键设计模式：
- **packages/core**：无 React DOM 依赖的 headless 层，包含 API client、Zustand stores、TanStack Query
- **packages/ui**：纯 UI 组件，无业务逻辑
- **packages/views**：业务页面，组合 core + ui，无平台特定导入
- **Electron 三层架构**：main process（Node.js）→ preload（IPC bridge）→ renderer（React）
- **Platform bridge**：core 层抽象平台差异（storage、notifications、navigation）

---

## 二、目标架构

### 2.1 Monorepo 结构

采用 **pnpm workspace + Turborepo**（与 Multica 一致），将现有 `backend/` 迁移为 `packages/api`：

```
coding-teams/
├── apps/
│   ├── web/                      # TanStack Start Web UI（保留现有）
│   ├── desktop/                  # Electron 桌面端（新增）
│   └── docs/                     # 文档站（可选，后续）
├── packages/
│   ├── api/                      # Hono API Server（从 backend/ 迁移）
│   ├── core/                     # Headless 业务逻辑层（新增）
│   ├── ui/                       # 共享 UI 组件库（新增）
│   ├── views/                    # 共享业务页面（新增）
│   └── tsconfig/                 # 共享 TypeScript 配置（新增）
├── docs/                         # 架构文档
├── package.json                  # 根 workspace 配置
├── pnpm-workspace.yaml           # pnpm workspace
├── turbo.json                    # Turborepo 构建编排
└── .claude/ .codex/              # Skills 和 harness
```

### 2.2 依赖关系图

```
views ──► core + ui
desktop renderer ──► views + core + ui     （共享 Web 的所有 UI）
web ──► views + core + ui
desktop main ──► core（仅类型和 API client）
api（独立，不依赖 core/ui/views）
```

### 2.3 技术栈选型

| 层 | 技术 | 理由 |
|----|------|------|
| Desktop Shell | **Electron** | Multica 已验证成熟，生态丰富，支持自动更新 |
| Renderer | **React 19 + Vite** | 与 Web 端共享 views/ui/core |
| 构建 | **electron-vite** | Electron + Vite 一等公民支持 |
| 打包 | **electron-builder** | 跨平台（macOS DMG/ZIP, Windows NSIS, Linux AppImage） |
| State | **Zustand + TanStack Query** | 与 Multica 一致，成熟模式 |
| UI | **Tailwind CSS 4 + shadcn/ui** | 与 Web 端一致 |
| Monorepo | **pnpm workspace + Turborepo** | 与 Multica 一致 |
| API | **Hono**（packages/api） | 保持现有，不迁移 |

---

## 三、packages/* 详细设计

### 3.1 packages/tsconfig

共享 TypeScript 配置，供其他包继承：

```
packages/tsconfig/
├── base.json          # 严格模式、ESM、路径别名
├── react.json         # 继承 base，加 JSX、DOM 类型
├── node.json          # 继承 base，加 Node.js 类型
└── package.json
```

### 3.2 packages/core

Headless 业务逻辑层，零 React DOM 依赖：

```
packages/core/
├── src/
│   ├── api/
│   │   ├── client.ts            # HTTP API client（fetch 封装）
│   │   └── ws-client.ts         # WebSocket client（自动重连）
│   ├── platform/
│   │   ├── core-provider.tsx    # 初始化 provider（API client、stores）
│   │   ├── storage.ts           # 存储 bridge（web: localStorage, desktop: IPC）
│   │   └── navigation.ts       # 导航 bridge
│   ├── types/
│   │   ├── task.ts              # Task、TaskStatus、TaskMessage 类型
│   │   ├── daemon.ts            # Daemon、Runtime 类型
│   │   ├── agent.ts             # Agent、Provider 类型
│   │   └── api.ts               # API request/response 类型
│   ├── tasks/
│   │   ├── queries.ts           # TanStack Query queryOptions
│   │   ├── mutations.ts         # TanStack Query mutations
│   │   └── store.ts             # Zustand store（本地 UI 状态）
│   ├── daemons/
│   │   ├── queries.ts
│   │   └── store.ts
│   ├── agents/
│   │   ├── queries.ts
│   │   └── store.ts
│   ├── realtime/
│   │   └── use-realtime-sync.ts # WS 事件 → Query cache 同步
│   ├── query-client.ts          # TanStack Query 全局配置
│   └── index.ts                 # barrel export
├── package.json
└── tsconfig.json
```

**核心原则**：
- API client 使用 `fetch`，web 和 desktop 共用
- Platform bridge 通过 provider 注入，桌面端用 IPC 实现
- TanStack Query 管理 server state，Zustand 管理 client state
- 所有 domain 类型集中管理，与 `packages/api` 的 schema 保持一致

### 3.3 packages/ui

原子 UI 组件，无业务逻辑：

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── tabs.tsx
│   │   ├── scroll-area.tsx
│   │   └── ...（shadcn/ui 组件）
│   ├── lib/
│   │   └── utils.ts             # cn() 等工具函数
│   ├── styles/
│   │   └── globals.css          # Tailwind 基础样式 + CSS 变量
│   └── index.ts
├── package.json
└── tsconfig.json
```

**策略**：初期直接用 shadcn/ui 组件，不提前抽象。

### 3.4 packages/views

共享业务页面，组合 core + ui：

```
packages/views/
├── src/
│   ├── layout/
│   │   ├── app-sidebar.tsx      # 侧边栏导航
│   │   ├── app-layout.tsx       # 主布局
│   │   └── header.tsx
│   ├── tasks/
│   │   ├── task-list.tsx        # 任务列表页
│   │   ├── task-detail.tsx      # 任务详情页
│   │   └── task-timeline.tsx    # 消息时间线
│   ├── daemons/
│   │   ├── daemon-list.tsx
│   │   └── daemon-detail.tsx
│   ├── agents/
│   │   ├── agent-list.tsx
│   │   └── agent-detail.tsx
│   ├── runtimes/
│   │   └── runtime-list.tsx
│   ├── dashboard/
│   │   └── overview.tsx         # 总览仪表盘
│   └── index.ts
├── package.json
└── tsconfig.json
```

**核心原则**：
- 无平台特定导入（不导入 Next.js router、Electron IPC）
- 导航通过 platform bridge 抽象
- 路由由各 app 自行管理（web 用 TanStack Router，desktop 用 React Router）

---

## 四、apps/desktop 详细设计

### 4.1 目录结构

```
apps/desktop/
├── src/
│   ├── main/                        # Electron 主进程
│   │   ├── index.ts                 # 入口：窗口创建、单实例锁、deep link
│   │   ├── daemon-manager.ts        # Daemon 生命周期（spawn、health check）
│   │   ├── updater.ts               # 自动更新（electron-updater）
│   │   ├── ipc-handlers.ts          # IPC 事件注册
│   │   ├── keyboard-shortcuts.ts    # 全局快捷键
│   │   └── tray.ts                  # 系统托盘（可选）
│   ├── preload/
│   │   ├── index.ts                 # contextBridge 暴露 API
│   │   └── index.d.ts              # TypeScript 类型声明
│   ├── renderer/
│   │   └── src/
│   │       ├── main.tsx             # React 入口
│   │       ├── App.tsx              # 根组件 + Provider
│   │       ├── routes.tsx           # React Router 路由定义
│   │       ├── globals.css          # 全局样式
│   │       ├── platform/            # Desktop 特有 platform 实现
│   │       │   ├── storage.ts       # 通过 IPC 调用主进程存储
│   │       │   ├── navigation.ts    # 桌面导航
│   │       │   └── daemon-bridge.ts # Daemon IPC bridge
│   │       ├── components/          # Desktop 特有组件
│   │       │   ├── desktop-layout.tsx
│   │       │   ├── title-bar.tsx    # 自定义标题栏
│   │       │   ├── daemon-panel.tsx # Daemon 状态面板
│   │       │   └── update-toast.tsx # 更新提示
│   │       └── pages/               # 页面（复用 views 或 desktop 专属）
│   │           ├── login.tsx
│   │           └── settings.tsx
│   └── shared/
│       └── daemon-types.ts          # main ↔ preload 共享类型
├── build/
│   └── icons/                       # 应用图标
├── resources/
│   └── icon.png
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

### 4.2 Main Process（主进程）

**核心职责**：
1. **窗口管理**：创建 BrowserWindow，自定义标题栏，macOS traffic light 定位
2. **Daemon 管理**：spawn/stop daemon 进程，健康检查，日志流式传输
3. **自动更新**：后台下载 + 用户主动安装
4. **IPC Bridge**：提供 daemon lifecycle、存储、通知、文件系统等 API

**Daemon 管理策略**：
- 桌面端内嵌 daemon 二进制（或利用 Bun runtime 编译产物）
- 启动时自动 spawn daemon，关闭时优雅停止
- Daemon 日志通过 IPC 流式传输到 renderer

### 4.3 Preload Layer（预加载层）

暴露三个 API 命名空间：

```typescript
// desktopAPI
interface DesktopAPI {
  getAppInfo(): { version: string; platform: string }
  getRuntimeConfig(): { apiUrl: string; wsUrl: string }
  openExternal(url: string): void
  showNotification(title: string, body: string): void
  setBadgeCount(count: number): void
  onDeepLink(callback: (url: string) => void): void
}

// daemonAPI
interface DaemonAPI {
  start(): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  getStatus(): DaemonStatus
  onStatusChange(callback: (status: DaemonStatus) => void): void
  onLog(callback: (log: string) => void): void
}

// updaterAPI
interface UpdaterAPI {
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateAvailable(callback: (info: any) => void): void
  onDownloadProgress(callback: (progress: any) => void): void
}
```

### 4.4 Renderer Process（渲染进程）

- 使用 `@coding-teams/views` 的共享页面组件
- 使用 `@coding-teams/core` 的 API client、queries、stores
- 使用 `@coding-teams/ui` 的基础 UI 组件
- Desktop 特有：自定义标题栏、daemon 状态面板、更新提示、托盘菜单
- 路由使用 React Router（memory router）

### 4.5 路由设计

```
/                          → 重定向到 /dashboard
/dashboard                 → 总览仪表盘
/tasks                     → 任务列表
/tasks/:id                 → 任务详情（消息时间线）
/agents                    → Agent 列表
/agents/:id                → Agent 详情
/runtimes                  → Runtime 列表
/daemons                   → Daemon 列表
/daemons/:id               → Daemon 详情
/settings                  → 设置（daemon 配置、更新）
```

---

## 五、实施路线

### Phase 1：Monorepo 基础设施

**目标**：建立 pnpm workspace + Turborepo，迁移 backend/ → packages/api/

1. 创建根 `package.json`、`pnpm-workspace.yaml`、`turbo.json`
2. 创建 `packages/tsconfig/` 共享 TS 配置
3. 将 `backend/` 迁移到 `packages/api/`（保持内部结构不变）
4. 更新 CI/CD 脚本和 CLAUDE.md 中的路径引用
5. 验证：`bun test` 和 `bunx tsc --noEmit` 仍然通过

### Phase 2：packages/core — 共享业务逻辑层

**目标**：建立 API client、类型定义、TanStack Query 和 Zustand stores

1. 定义 domain types（task、daemon、agent、runtime）
2. 实现 HTTP API client（fetch 封装，与 packages/api 对接）
3. 实现 WebSocket client（自动重连）
4. 实现 platform bridge 接口（storage、navigation）
5. 实现 TanStack Query queries/mutations
6. 实现 Zustand stores
7. 实现 realtime sync hook

### Phase 3：packages/ui — 共享 UI 组件

**目标**：建立基础组件库

1. 配置 Tailwind CSS 4 + shadcn/ui
2. 初始化基础组件（button、card、badge、input、dialog、tabs、scroll-area）
3. 建立样式 token（CSS 变量）

### Phase 4：packages/views — 共享业务页面

**目标**：建立可被 web 和 desktop 复用的业务页面

1. 实现 layout 组件（sidebar、header）
2. 实现 task 列表/详情/时间线页面
3. 实现 daemon/agent/runtime 列表页面
4. 实现 dashboard 总览页面

### Phase 5：apps/desktop — Electron 桌面端

**目标**：构建完整的桌面应用

1. 初始化 electron-vite 项目结构
2. 实现 main process（窗口、IPC、daemon manager）
3. 实现 preload layer（contextBridge API）
4. 实现 renderer（复用 views + core + ui）
5. 实现 desktop 特有组件（标题栏、daemon 面板、更新提示）
6. 配置 electron-builder（macOS DMG 优先）
7. 验证：桌面端可以启动、连接 API server、展示 task 列表

---

## 六、关键决策点

### Q1：packages/api 保持 Bun runtime 还是迁移？

**建议**：保持 Bun runtime。`packages/api` 继续用 Bun 运行 Hono server，monorepo 的 pnpm workspace 主要管理前端和桌面端的依赖。API server 可以有独立的 `bun.lock`，或者统一到根 workspace。

### Q2：Web 端（apps/web）是否同步改造？

**建议**：Phase 1-4 建立共享包后，Web 端可以渐进迁移。当前阶段先让 desktop 直接消费 views/core/ui，Web 端后续接入。

### Q3：packages/core 的 API client 如何处理 packages/api 的路由？

**建议**：core 的 API client 直接调用 HTTP 接口（`/api/tasks` 等），不导入 packages/api 的代码。两者通过共享类型保持一致。

### Q4：Daemon 是内嵌还是独立进程？

**建议**：桌面端内嵌 daemon。main process 负责 spawn daemon 子进程（Bun 编译的独立二进制或直接 `bun run`），通过 stdout/stderr 收集日志。

---

## 七、与 Multica 的差异

| 方面 | Multica | Coding Teams |
|------|---------|-------------|
| 后端语言 | Go | TypeScript (Hono + Bun) |
| Web 框架 | Next.js | TanStack Start |
| 产品面 | Issue board、billing、squad、autopilot | 任务调度、agent 管理 |
| 认证 | 完整用户体系 + PAT | MVP 简化（本地使用为主） |
| 数据库 | PostgreSQL + Redis | PostgreSQL（内存 store 过渡） |
| packages/core 复杂度 | 248 文件 | MVP 约 30-50 文件 |

Coding Teams 大幅简化了 Multica 的产品面，但保留了核心架构模式（packages 分层、platform bridge、Electron 三层架构、TanStack Query + Zustand）。
