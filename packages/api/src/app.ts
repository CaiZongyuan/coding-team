import { Hono } from 'hono'

import {
  createMemoryStore,
  type DaemonRegistrationInput,
  type RuntimeInput,
  type RuntimeProvider,
  type RuntimeStatus,
  type RuntimeStore,
} from './store'
import {
  createMemoryMessageStore,
  MessageConflictError,
  MessageTaskNotFoundError,
  TaskNotRunningError,
  type InputMessage,
  type MessageStore,
} from './message-store'
import {
  createMemoryTaskStore,
  InvalidTransitionError,
  TaskNotFoundError,
  type TaskStore,
} from './task-store'

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

type CreateAppOptions = {
  store?: RuntimeStore
  taskStore?: TaskStore
  messageStore?: MessageStore
}

type ValidationErrorBody = {
  error: {
    code: 'VALIDATION_ERROR'
    message: string
    details: Record<string, unknown>
  }
}

export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? createMemoryStore()
  const taskStore = options.taskStore ?? createMemoryTaskStore()
  const messageStore = options.messageStore ?? createMemoryMessageStore((taskId) => {
    const task = taskStore.getTask(taskId)
    if (!task) return { exists: false }
    return { exists: true, status: task.status }
  })
  const app = new Hono()

  // --- Dashboard ---
  app.get('/', (c) => c.html(runtimeDashboardHtml()))

  // --- Runtime API ---
  app.get('/api/runtimes', (c) => {
    return c.json({ runtimes: store.listRuntimes() })
  })

  // --- Daemon Registration ---
  app.post('/api/daemon/register', async (c) => {
    let payload: unknown

    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    const validation = validateRegistrationPayload(payload)
    if (!validation.ok) {
      return c.json(validationError(validation.errors), 400)
    }

    return c.json(store.registerDaemon(validation.value))
  })

  // --- Task API ---

  // Create task
  app.post('/api/tasks', async (c) => {
    let payload: unknown
    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    if (!isRecord(payload) || typeof payload.title !== 'string' || payload.title.trim().length === 0) {
      return c.json(validationError(['title is required']), 400)
    }

    const task = taskStore.createTask({
      title: payload.title as string,
      description: typeof payload.description === 'string' ? payload.description : '',
      priority: typeof payload.priority === 'number' ? payload.priority : undefined,
    })

    return c.json({ task }, 201)
  })

  // List tasks
  app.get('/api/tasks', (c) => {
    const status = c.req.query('status') as string | undefined
    const result = taskStore.listTasks(
      status ? { status: status as any } : undefined,
    )
    return c.json(result)
  })

  // Get task by ID
  app.get('/api/tasks/:id', (c) => {
    const task = taskStore.getTask(c.req.param('id'))
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404)
    }
    return c.json({ task })
  })

  // Cancel task
  app.post('/api/tasks/:id/cancel', (c) => {
    try {
      const task = taskStore.cancelTask(c.req.param('id'))
      return c.json({ task }, 202)
    } catch (error) {
      return handleTaskError(error, c)
    }
  })

  // --- Daemon Task API ---

  // Claim task
  app.post('/api/daemon/tasks/claim', async (c) => {
    let payload: unknown
    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    if (!isRecord(payload)) {
      return c.json(validationError(['body must be an object']), 400)
    }

    const daemonId = payload.daemonId
    const runtimeId = payload.runtimeId
    if (typeof daemonId !== 'string' || typeof runtimeId !== 'string') {
      return c.json(validationError(['daemonId and runtimeId are required']), 400)
    }

    const task = taskStore.claimTask({ daemonId, runtimeId })
    if (!task) {
      return new Response(null, { status: 204 })
    }
    return c.json({ task })
  })

  // Start task
  app.post('/api/daemon/tasks/:id/start', async (c) => {
    let payload: unknown
    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    if (!isRecord(payload)) {
      return c.json(validationError(['body must be an object']), 400)
    }

    try {
      const task = taskStore.startTask(c.req.param('id'), {
        daemonId: payload.daemonId as string,
        runtimeId: payload.runtimeId as string,
        startedAt: typeof payload.startedAt === 'string' ? payload.startedAt : undefined,
      })
      return c.json({ task })
    } catch (error) {
      return handleTaskError(error, c)
    }
  })

  // Report result
  app.post('/api/daemon/tasks/:id/result', async (c) => {
    let payload: unknown
    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    if (!isRecord(payload) || (payload.status !== 'completed' && payload.status !== 'failed')) {
      return c.json(validationError(['status must be completed or failed']), 400)
    }

    try {
      const task = taskStore.updateTaskResult(
        c.req.param('id'),
        payload.status === 'completed'
          ? { status: 'completed', result: typeof payload.result === 'string' ? payload.result : undefined }
          : { status: 'failed', error: typeof payload.error === 'string' ? payload.error : undefined },
      )
      return c.json({ task })
    } catch (error) {
      return handleTaskError(error, c)
    }
  })

  // Heartbeat
  app.post('/api/daemon/tasks/:id/heartbeat', (c) => {
    try {
      taskStore.updateHeartbeat(c.req.param('id'))
      return new Response(null, { status: 204 })
    } catch (error) {
      return handleTaskError(error, c)
    }
  })

  // --- Task Message API ---

  // Append messages
  app.post('/api/daemon/tasks/:id/messages', async (c) => {
    let payload: unknown
    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    if (!isRecord(payload) || !Array.isArray(payload.messages)) {
      return c.json(validationError(['messages array is required']), 400)
    }

    const taskId = c.req.param('id')
    const messages = (payload.messages as Array<Record<string, unknown>>).map(
      (msg): InputMessage => ({
        seq: msg.seq as number,
        type: msg.type as InputMessage['type'],
        content: typeof msg.content === 'string' ? msg.content : undefined,
        tool: typeof msg.tool === 'string' ? msg.tool : undefined,
        input: msg.input,
        output: typeof msg.output === 'string' ? msg.output : undefined,
      }),
    )

    try {
      const result = messageStore.appendMessages(taskId, messages)
      // 200 for idempotent (inserted=0), 201 for new insertions
      return c.json(result, result.inserted > 0 ? 201 : 200)
    } catch (error) {
      if (error instanceof MessageTaskNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: error.message } }, 404)
      }
      if (error instanceof TaskNotRunningError) {
        return c.json({ error: { code: 'CONFLICT', message: error.message } }, 409)
      }
      if (error instanceof MessageConflictError) {
        return c.json({ error: { code: 'CONFLICT', message: error.message } }, 409)
      }
      throw error
    }
  })

  // Get messages
  app.get('/api/tasks/:id/messages', (c) => {
    const taskId = c.req.param('id')
    const task = taskStore.getTask(taskId)
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404)
    }

    const afterSeqStr = c.req.query('afterSeq')
    const afterSeq = afterSeqStr ? parseInt(afterSeqStr, 10) : 0
    const messages = messageStore.listMessages(taskId, { afterSeq: isNaN(afterSeq) ? 0 : afterSeq })
    return c.json({ messages })
  })

  return app
}

// ---------------------------------------------------------------------------
// Error handling helper
// ---------------------------------------------------------------------------

function handleTaskError(error: unknown, c: { json: (body: unknown, status: number) => Response }) {
  if (error instanceof TaskNotFoundError) {
    return c.json({ error: { code: 'NOT_FOUND', message: error.message } }, 404)
  }
  if (error instanceof InvalidTransitionError) {
    return c.json({ error: { code: 'CONFLICT', message: error.message } }, 409)
  }
  throw error
}

// ---------------------------------------------------------------------------
// Dashboard HTML 页面（交互式版本）
// ---------------------------------------------------------------------------

function runtimeDashboardHtml(): string {
  // 注意：这里用的是模板字符串（反引号），HTML 中的反引号需要转义为 \\`
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coding Teams Dashboard</title>
    <style>
      :root { color-scheme:light; font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif; background:#f6f8fb; color:#162033; }
      body { margin:0; }
      main { max-width:1080px; margin:0 auto; padding:32px 20px; }
      header { display:flex; align-items:end; justify-content:space-between; gap:16px; margin-bottom:24px; }
      h1 { margin:0; font-size:28px; font-weight:700; }
      h2 { margin:24px 0 12px; font-size:20px; font-weight:700; }
      button,.btn { border:1px solid #c7d1e0; background:#fff; color:#162033; border-radius:6px; padding:7px 14px; font:inherit; cursor:pointer; font-size:13px; white-space:nowrap; }
      button:hover,.btn:hover { background:#f0f4f8; }
      button.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
      button.primary:hover { background:#1d4ed8; }
      button.danger { background:#dc2626; color:#fff; border-color:#dc2626; }
      button.danger:hover { background:#b91c1c; }
      button.warn { background:#d97706; color:#fff; border-color:#d97706; }
      button:disabled { opacity:.5; cursor:not-allowed; }
      table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #d9e1ec; margin-bottom:16px; }
      th,td { padding:10px 12px; border-bottom:1px solid #e6ebf2; text-align:left; font-size:13px; }
      th { background:#edf2f8; font-weight:650; }
      td.actions { display:flex; gap:6px; flex-wrap:wrap; }
      .badge { display:inline-flex; align-items:center; gap:5px; font-weight:650; font-size:12px; padding:2px 8px; border-radius:999px; }
      .badge::before { content:""; width:7px; height:7px; border-radius:999px; }
      .badge.queued { background:#f0f4f8; color:#475569; } .badge.queued::before { background:#8a94a6; }
      .badge.dispatched { background:#eff6ff; color:#1d4ed8; } .badge.dispatched::before { background:#2563eb; }
      .badge.running { background:#eff6ff; color:#1d4ed8; } .badge.running::before { background:#2563eb; }
      .badge.completed { background:#ecfdf5; color:#065f46; } .badge.completed::before { background:#168a48; }
      .badge.failed { background:#fef2f2; color:#991b1b; } .badge.failed::before { background:#dc2626; }
      .badge.cancelled { background:#fffbeb; color:#92400e; } .badge.cancelled::before { background:#d97706; }
      .badge.online { background:#ecfdf5; color:#065f46; } .badge.online::before { background:#168a48; }
      .badge.offline { background:#f0f4f8; color:#475569; } .badge.offline::before { background:#8a94a6; }
      .form-row { display:flex; gap:8px; align-items:end; flex-wrap:wrap; margin-bottom:16px; }
      .form-row label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
      .form-row input,.form-row textarea,.form-row select { padding:7px 10px; border:1px solid #c7d1e0; border-radius:6px; font:inherit; font-size:13px; min-width:120px; }
      .form-row textarea { min-width:200px; min-height:36px; resize:vertical; }
      .panel { border:1px solid #d9e1ec; background:#fff; border-radius:8px; padding:16px; margin-bottom:16px; }
      .panel h3 { margin:0 0 12px; font-size:15px; }
      .msg-item { padding:8px 12px; border-left:3px solid #c7d1e0; margin-bottom:6px; background:#fafbfc; font-size:13px; border-radius:0 6px 6px 0; }
      .msg-item.text { border-left-color:#2563eb; } .msg-item.thinking { border-left-color:#8b5cf6; }
      .msg-item.tool_use { border-left-color:#d97706; } .msg-item.tool_result { border-left-color:#168a48; }
      .msg-item.status { border-left-color:#6b7280; } .msg-item.error { border-left-color:#dc2626; }
      .msg-item .msg-meta { font-size:11px; color:#6b7280; margin-bottom:2px; }
      .msg-item .msg-body { white-space:pre-wrap; word-break:break-all; }
      .msg-item pre { margin:4px 0 0; font-size:12px; background:#f0f4f8; padding:6px; border-radius:4px; overflow-x:auto; }
      .empty,.error { padding:18px; border:1px solid #d9e1ec; background:#fff; border-radius:8px; }
      .error { border-color:#d84d4d; color:#9d1c1c; }
      .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
      .toast { position:fixed; bottom:20px; right:20px; padding:12px 20px; background:#162033; color:#fff; border-radius:8px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:100; }
      .toast.show { opacity:1; }
      .back-link { font-size:13px; color:#2563eb; cursor:pointer; text-decoration:underline; display:inline-block; margin-bottom:12px; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Coding Teams Dashboard</h1>
        <div style="display:flex;gap:8px"><button id="refresh">刷新</button></div>
      </header>
      <div id="view-list">
        <section id="runtime-section"></section>
        <h2>任务队列</h2>
        <div class="panel">
          <h3>创建新任务</h3>
          <div class="form-row">
            <label>标题 <input id="f-title" placeholder="例：实现 WebSocket" /></label>
            <label>描述 <textarea id="f-desc" rows="1" placeholder="任务的详细说明"></textarea></label>
            <label>优先级 <input id="f-priority" type="number" value="50" style="width:70px" /></label>
            <button class="primary" id="btn-create">创建任务</button>
          </div>
        </div>
        <section id="task-table-section"></section>
      </div>
      <div id="view-detail" style="display:none">
        <span class="back-link" id="back-link">&larr; 返回任务列表</span>
        <div id="task-detail"></div>
        <div class="panel" id="msg-panel">
          <h3>执行消息</h3>
          <div id="msg-list"></div>
          <div class="form-row" style="margin-top:12px">
            <label>追加消息 <textarea id="f-msg" rows="2" placeholder="输入消息内容"></textarea></label>
            <label>类型
              <select id="f-msg-type">
                <option value="text">text</option><option value="thinking">thinking</option>
                <option value="tool_use">tool_use</option><option value="tool_result">tool_result</option>
                <option value="status">status</option><option value="error">error</option>
              </select>
            </label>
            <button class="primary" id="btn-append-msg">追加</button>
          </div>
        </div>
      </div>
    </main>
    <div class="toast" id="toast"></div>
    <script>
    function escapeHtml(v){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
    function esc(v){return v==null?'':escapeHtml(String(v))}
    function shortId(id){return id?id.slice(0,8)+'…':''}
    function timeAgo(iso){if(!iso)return '';const d=(Date.now()-new Date(iso).getTime())/1000;if(d<60)return Math.round(d)+'秒前';if(d<3600)return Math.round(d/60)+'分前';if(d<86400)return Math.round(d/3600)+'小时前';return new Date(iso).toLocaleString('zh-CN')}
    let toastTimer;function toast(msg,dur=2000){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),dur)}
    async function api(method,path,body){const opts={method,headers:{'Content-Type':'application/json'}};if(body)opts.body=JSON.stringify(body);const res=await fetch(path,opts);if(res.status===204)return{_status:204};const data=await res.json();data._status=res.status;if(!res.ok&&data.error)toast('错误: '+(data.error.message||JSON.stringify(data.error)),3000);return data}

    let currentTaskId=null,autoRefresh=null;
    function startAutoRefresh(){stopAutoRefresh();autoRefresh=setInterval(()=>{if(currentTaskId)loadDetail(currentTaskId);else{loadRuntimes();loadTaskTable()}},3000)}
    function stopAutoRefresh(){clearInterval(autoRefresh)}

    async function loadRuntimes(){const el=document.getElementById('runtime-section');try{const data=await api('GET','/api/runtimes');const rr=data.runtimes||[];if(!rr.length){el.innerHTML='<div class="empty">还没有 daemon 上报 runtime。</div>';return}el.innerHTML='<h2>Runtimes</h2><table><thead><tr><th>Provider</th><th>Name</th><th>Status</th><th>Version</th><th>Last Seen</th></tr></thead><tbody>'+rr.map(r=>'<tr><td>'+esc(r.provider)+'</td><td>'+esc(r.name)+'</td><td><span class="badge '+esc(r.status||'offline')+'">'+esc(r.status||'offline')+'</span></td><td>'+esc(r.version)+'</td><td>'+esc(r.lastSeenAt)+'</td></tr>').join('')+'</tbody></table>'}catch(e){el.innerHTML='<div class="error">加载 runtime 失败</div>'}}

    async function loadTaskTable(){const el=document.getElementById('task-table-section');try{const data=await api('GET','/api/tasks');const tasks=data.tasks||[];if(!tasks.length){el.innerHTML='<div class="empty">还没有任务。用上方表单创建一个吧。</div>';return}el.innerHTML='<table><thead><tr><th>ID</th><th>状态</th><th>标题</th><th>优先级</th><th>创建时间</th><th>操作</th></tr></thead><tbody>'+tasks.map(t=>{const s=t.status||'queued';let b='<button onclick="viewDetail(\\''+t.id+'\\')">详情</button> ';if(s==='queued')b+='<button class="primary" onclick="doClaim()">认领</button>';if(s==='dispatched')b+='<button class="primary" onclick="doStart(\\''+t.id+'\\')">开始</button>';if(s==='running')b+='<button class="primary" onclick="doHeartbeat(\\''+t.id+'\\')">心跳</button> <button onclick="viewDetail(\\''+t.id+'\\')">消息</button>';if(s==='queued'||s==='dispatched')b+=' <button class="danger" onclick="doCancel(\\''+t.id+'\\')">取消</button>';return'<tr><td class="mono">'+shortId(t.id)+'</td><td><span class="badge '+esc(s)+'">'+esc(s)+'</span></td><td>'+esc(t.title)+'</td><td>'+(t.priority??'')+'</td><td>'+timeAgo(t.createdAt)+'</td><td class="actions">'+b+'</td></tr>'}).join('')+'</tbody></table>'}catch(e){el.innerHTML='<div class="error">加载任务失败</div>'}}

    async function doCreate(){const title=document.getElementById('f-title').value.trim();const desc=document.getElementById('f-desc').value.trim();const pri=parseInt(document.getElementById('f-priority').value)||50;if(!title){toast('请输入标题');return}const d=await api('POST','/api/tasks',{title,description:desc,priority:pri});if(d._status===201){toast('任务已创建');document.getElementById('f-title').value='';document.getElementById('f-desc').value='';loadTaskTable()}}
    async function doClaim(){const d=await api('POST','/api/daemon/tasks/claim',{daemonId:'dashboard-user',runtimeId:'manual'});if(d._status===200){toast('已认领：'+(d.task?.title||''));loadTaskTable()}else if(d._status===204){toast('没有可认领的任务')}}
    async function doStart(id){const d=await api('POST','/api/daemon/tasks/'+id+'/start',{daemonId:'dashboard-user',runtimeId:'manual'});if(d._status===200){toast('任务已开始执行');loadTaskTable()}}
    async function doHeartbeat(id){const d=await api('POST','/api/daemon/tasks/'+id+'/heartbeat',{});if(d._status===204){toast('心跳已更新');loadTaskTable()}}
    async function doCancel(id){if(!confirm('确定取消这个任务？'))return;const d=await api('POST','/api/tasks/'+id+'/cancel');if(d._status===202){toast('任务已取消');loadTaskTable()}}
    async function doComplete(id){const r=prompt('输入完成结果（可选）：')||'';const d=await api('POST','/api/daemon/tasks/'+id+'/result',{status:'completed',result:r});if(d._status===200){toast('任务已完成');loadDetail(id)}}
    async function doFail(id){const e=prompt('输入失败原因：')||'手动标记失败';const d=await api('POST','/api/daemon/tasks/'+id+'/result',{status:'failed',error:e});if(d._status===200){toast('任务已标记为失败');loadDetail(id)}}
    async function doAppendMsg(id){const content=document.getElementById('f-msg').value.trim();const type=document.getElementById('f-msg-type').value;if(!content){toast('请输入消息内容');return}const md=await api('GET','/api/tasks/'+id+'/messages');const mm=md.messages||[];const ns=mm.length>0?Math.max(...mm.map(m=>m.seq))+1:1;const d=await api('POST','/api/daemon/tasks/'+id+'/messages',{messages:[{seq:ns,type,content}]});if(d._status===200||d._status===201){toast('已追加消息 (seq='+ns+')');document.getElementById('f-msg').value='';loadDetail(id)}}

    async function viewDetail(id){document.getElementById('view-list').style.display='none';document.getElementById('view-detail').style.display='';currentTaskId=id;await loadDetail(id)}
    function backToList(){document.getElementById('view-list').style.display='';document.getElementById('view-detail').style.display='none';currentTaskId=null;loadTaskTable()}

    async function loadDetail(id){const el=document.getElementById('task-detail');try{const data=await api('GET','/api/tasks/'+id);if(data._status===404){el.innerHTML='<div class="error">任务不存在</div>';return}const t=data.task;document.getElementById('msg-panel').style.display=(t.status==='running'||t.status==='completed'||t.status==='failed')?'':'none';let ab='';if(t.status==='queued')ab='<button class="primary" onclick="doClaim()">认领</button>';if(t.status==='dispatched')ab='<button class="primary" onclick="doStart(\\''+t.id+'\\')">开始执行</button>';if(t.status==='running')ab='<button onclick="doHeartbeat(\\''+t.id+'\\')">心跳</button> <button onclick="doComplete(\\''+t.id+'\\')">完成</button> <button class="danger" onclick="doFail(\\''+t.id+'\\')">失败</button>';if(t.status==='queued'||t.status==='dispatched')ab+=' <button class="warn" onclick="doCancel(\\''+t.id+'\\')">取消</button>';el.innerHTML='<div class="panel"><div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px"><div><h3 style="margin-bottom:4px">'+esc(t.title)+'</h3><span class="mono" style="color:#6b7280">'+esc(t.id)+'</span></div><div style="display:flex;gap:6px;align-items:center"><span class="badge '+esc(t.status)+'" style="font-size:14px;padding:4px 12px">'+esc(t.status)+'</span>'+ab+'</div></div><table style="margin-top:12px"><tr><th>描述</th><td>'+esc(t.description||'—')+'</td></tr><tr><th>优先级</th><td>'+(t.priority??'—')+'</td></tr><tr><th>Daemon</th><td class="mono">'+esc(t.daemonId||'—')+'</td></tr><tr><th>Runtime</th><td class="mono">'+esc(t.runtimeId||'—')+'</td></tr><tr><th>创建时间</th><td>'+esc(t.createdAt)+'</td></tr>'+(t.dispatchedAt?'<tr><th>认领时间</th><td>'+esc(t.dispatchedAt)+'</td></tr>':'')+(t.startedAt?'<tr><th>开始时间</th><td>'+esc(t.startedAt)+'</td></tr>':'')+(t.completedAt?'<tr><th>完成时间</th><td>'+esc(t.completedAt)+'</td></tr>':'')+(t.result?'<tr><th>结果</th><td>'+esc(t.result)+'</td></tr>':'')+(t.error?'<tr><th>错误</th><td style="color:#991b1b">'+esc(t.error)+'</td></tr>':'')+(t.lastHeartbeatAt?'<tr><th>最后心跳</th><td>'+timeAgo(t.lastHeartbeatAt)+'</td></tr>':'')+'</table></div>';if(document.getElementById('msg-panel').style.display!=='none')loadMessages(id)}catch(e){el.innerHTML='<div class="error">加载失败</div>'}}

    async function loadMessages(id){const el=document.getElementById('msg-list');try{const data=await api('GET','/api/tasks/'+id+'/messages');const mm=data.messages||[];if(!mm.length){el.innerHTML='<div class="empty" style="padding:12px">暂无消息。</div>';return}el.innerHTML=mm.map(m=>{let b=esc(m.content);if(m.tool)b+='<pre>tool: '+esc(m.tool)+(m.input?'\\ninput: '+esc(typeof m.input==='string'?m.input:JSON.stringify(m.input)):'')+(m.output?'\\noutput: '+esc(m.output):'')+'</pre>';return'<div class="msg-item '+esc(m.type)+'"><div class="msg-meta">seq='+m.seq+' · '+esc(m.type)+' · '+timeAgo(m.createdAt)+'</div><div class="msg-body">'+b+'</div></div>'}).join('')}catch(e){el.innerHTML='<div class="error">加载消息失败</div>'}}

    document.getElementById('btn-create').addEventListener('click',doCreate)
    document.getElementById('refresh').addEventListener('click',()=>{if(currentTaskId)loadDetail(currentTaskId);else{loadRuntimes();loadTaskTable()}})
    document.getElementById('back-link').addEventListener('click',backToList)
    document.getElementById('btn-append-msg').addEventListener('click',()=>{if(currentTaskId)doAppendMsg(currentTaskId)})
    document.getElementById('f-title').addEventListener('keydown',e=>{if(e.key==='Enter')doCreate()})
    loadRuntimes();loadTaskTable();startAutoRefresh()
    </script>
  </body>
</html>`
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validationError(errors: string[]): ValidationErrorBody {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: `Validation failed: ${errors.join('; ')}`,
      details: { errors },
    },
  }
}

type ValidationResult =
  | { ok: true; value: DaemonRegistrationInput }
  | { ok: false; errors: string[] }

function validateRegistrationPayload(payload: unknown): ValidationResult {
  const errors: string[] = []

  if (!isRecord(payload)) {
    return { ok: false, errors: ['body must be an object'] }
  }

  const daemon = isRecord(payload.daemon) ? payload.daemon : null
  if (!daemon) {
    errors.push('daemon is required')
  }

  const hostname = daemon?.hostname
  if (typeof hostname !== 'string' || hostname.trim().length === 0) {
    errors.push('daemon.hostname is required')
  }

  const runtimesValue = payload.runtimes
  if (!Array.isArray(runtimesValue)) {
    errors.push('runtimes must be an array')
  }

  const runtimes = Array.isArray(runtimesValue)
    ? runtimesValue.flatMap((runtime, index) =>
        validateRuntimeInput(runtime, index, errors),
      )
    : []

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: {
      daemon: {
        hostname: hostname as string,
        deviceInfo: optionalString(daemon?.deviceInfo),
        version: optionalString(daemon?.version),
      },
      runtimes,
    },
  }
}

function validateRuntimeInput(
  runtime: unknown,
  index: number,
  errors: string[],
): RuntimeInput[] {
  if (!isRecord(runtime)) {
    errors.push(`runtimes[${index}] must be an object`)
    return []
  }

  const provider = runtime.provider
  if (provider !== 'claude') {
    errors.push(`runtimes[${index}].provider must be claude`)
  }

  const name = runtime.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push(`runtimes[${index}].name is required`)
  }

  const command = runtime.command
  if (typeof command !== 'string' || command.trim().length === 0) {
    errors.push(`runtimes[${index}].command is required`)
  }

  const status = runtime.status
  if (status !== 'online' && status !== 'offline') {
    errors.push(`runtimes[${index}].status must be online or offline`)
  }

  if (
    provider !== 'claude' ||
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    typeof command !== 'string' ||
    command.trim().length === 0 ||
    (status !== 'online' && status !== 'offline')
  ) {
    return []
  }

  return [
    {
      provider: provider as RuntimeProvider,
      name,
      command,
      version: optionalString(runtime.version),
      status: status as RuntimeStatus,
      capabilities: isRecord(runtime.capabilities) ? runtime.capabilities : {},
    },
  ]
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
