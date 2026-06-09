/**
 * WebSocket Client
 *
 * 参考 Multica packages/core/api/ws-client.ts 的设计：
 * - 自动重连（3s backoff）
 * - 事件订阅
 * - unparseable message 保护
 */

/** WS 事件回调 */
export type WSEventHandler<T = unknown> = (event: T) => void

/** WS client 配置 */
export type WSClientConfig = {
  /** WebSocket URL */
  url: string
  /** 重连间隔（毫秒），默认 3000 */
  reconnectInterval?: number
  /** 自定义 WebSocket 实现（用于测试） */
  wsImpl?: new (url: string) => WebSocket
}

/** 创建 WebSocket client */
export function createWSClient(config: WSClientConfig) {
  const { url, reconnectInterval = 3000, wsImpl } = config
  const WS = wsImpl ?? WebSocket

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  const handlers = new Map<string, Set<WSEventHandler>>()

  /** 连接 WebSocket */
  function connect(): void {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return
    }

    ws = new WS(url)

    ws.onopen = () => {
      // 连接成功，清除重连定时器
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      dispatch('connected', null)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        if (data && typeof data === 'object' && 'type' in data) {
          dispatch(data.type, data.payload)
        }
      } catch {
        // unparseable message 保护：截断到 200 字符
        const raw = typeof event.data === 'string' ? event.data.slice(0, 200) : String(event.data)
        dispatch('raw_message', raw)
      }
    }

    ws.onclose = () => {
      dispatch('disconnected', null)
      if (shouldReconnect) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // onclose 会在 onerror 之后触发，重连逻辑放在 onclose
    }
  }

  /** 安排重连 */
  function scheduleReconnect(): void {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectInterval)
  }

  /** 分发事件到订阅者 */
  function dispatch(type: string, payload: unknown): void {
    const typeHandlers = handlers.get(type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(payload)
        } catch {
          // handler 错误不影响其他 handler
        }
      }
    }
  }

  /** 订阅事件 */
  function on<T = unknown>(type: string, handler: WSEventHandler<T>): () => void {
    if (!handlers.has(type)) {
      handlers.set(type, new Set())
    }
    const typeHandlers = handlers.get(type)!
    typeHandlers.add(handler as WSEventHandler)

    // 返回取消订阅函数
    return () => {
      typeHandlers.delete(handler as WSEventHandler)
      if (typeHandlers.size === 0) {
        handlers.delete(type)
      }
    }
  }

  /** 发送消息 */
  function send(data: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  /** 断开连接 */
  function disconnect(): void {
    shouldReconnect = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
  }

  return {
    connect,
    disconnect,
    on,
    send,
    /** 获取当前连接状态 */
    get readyState(): number {
      return ws?.readyState ?? WebSocket.CLOSED
    },
  }
}

/** WS client 类型 */
export type WSClient = ReturnType<typeof createWSClient>
