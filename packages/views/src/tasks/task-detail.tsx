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
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{task.title}</CardTitle>
            <Badge variant={statusVariant[task.status]}>{task.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              Daemon: <span className="font-mono">{task.daemonId ?? '—'}</span>
            </div>
            <div>
              Runtime: <span className="font-mono">{task.runtimeId ?? '—'}</span>
            </div>
            <div>优先级: {task.priority}</div>
            <div>尝试次数: {task.attempt}</div>
            {task.description && (
              <div className="col-span-2 text-zinc-600">{task.description}</div>
            )}
            {task.error && (
              <div className="col-span-2 text-red-600">错误: {task.error}</div>
            )}
            {task.result && (
              <div className="col-span-2 text-emerald-700">结果: {task.result}</div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>执行消息</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="py-4 text-zinc-500">暂无消息</div>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  data-type={m.type}
                  className={`border-l-4 bg-zinc-50 px-3 py-2 ${typeBorderColor[m.type]}`}
                >
                  <div className="mb-1 text-xs text-zinc-500">
                    seq={m.seq} · {m.type}
                  </div>
                  {m.tool && (
                    <div className="font-mono text-xs text-amber-700">{m.tool}</div>
                  )}
                  {m.content && (
                    <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                  )}
                  {m.input != null && (
                    <pre className="mt-1 overflow-auto rounded bg-zinc-100 p-2 text-xs">
                      {typeof m.input === 'string' ? m.input : JSON.stringify(m.input, null, 2)}
                    </pre>
                  )}
                  {m.output && (
                    <pre className="mt-1 overflow-auto rounded bg-zinc-900 p-2 text-xs text-zinc-100">
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
