/**
 * TaskDetail 组件
 *
 * 展示单个任务的元信息 + 执行消息流。
 * 每条消息容器带 data-type 属性，便于按 type 着色与测试选择。
 */
import type { Task, TaskMessage, TaskMessageType, TaskStatus } from '@coding-teams/core'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@coding-teams/ui'

const statusVariant: Record<TaskStatus, 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  queued: 'outline',
  dispatched: 'warning',
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'default',
}

const typeBorderColor: Record<TaskMessageType, string> = {
  text: 'border-l-blue-500',
  thinking: 'border-l-purple-500',
  tool_use: 'border-l-amber-500',
  tool_result: 'border-l-emerald-500',
  status: 'border-l-zinc-500',
  error: 'border-l-red-500',
}

export type TaskDetailProps = {
  task: Task
  messages: TaskMessage[]
}

export function TaskDetail({ task, messages }: TaskDetailProps) {
  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">{task.title}</CardTitle>
            <Badge variant={statusVariant[task.status]}>{task.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-0">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">Daemon</span>
              <span className="font-mono text-zinc-700">{task.daemonId ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">Runtime</span>
              <span className="font-mono text-zinc-700">{task.runtimeId ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">优先级</span>
              <span className="text-zinc-700">{task.priority}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">尝试</span>
              <span className="text-zinc-700">{task.attempt}</span>
            </div>
            {task.description && (
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                {task.description}
              </div>
            )}
            {task.error && (
              <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                错误: {task.error}
              </div>
            )}
            {task.result && (
              <div className="col-span-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                结果: {task.result}
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">执行消息</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {messages.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">暂无消息</div>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  data-type={m.type}
                  className={`rounded-r-lg border-l-2 bg-zinc-50/80 px-3 py-2 ${typeBorderColor[m.type]}`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                    <span className="font-mono">seq={m.seq}</span>
                    <span>·</span>
                    <span>{m.type}</span>
                  </div>
                  {m.tool && (
                    <div className="mb-0.5 font-mono text-xs text-amber-700">{m.tool}</div>
                  )}
                  {m.content && (
                    <div className="whitespace-pre-wrap text-sm text-zinc-800">{m.content}</div>
                  )}
                  {m.input != null && (
                    <pre className="mt-1 overflow-auto rounded-md bg-zinc-100 p-2 text-xs text-zinc-700">
                      {typeof m.input === 'string' ? m.input : JSON.stringify(m.input, null, 2)}
                    </pre>
                  )}
                  {m.output && (
                    <pre className="mt-1 overflow-auto rounded-md bg-zinc-900 p-2 text-xs text-zinc-100">
                      {m.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
