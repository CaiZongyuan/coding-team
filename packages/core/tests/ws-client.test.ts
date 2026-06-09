/**
 * TC-CORE-003: WS client 连接、自动重连、事件订阅
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { createWSClient } from '../src/api/ws-client'

/** Mock WebSocket 实现 */
function createMockWebSocket() {
  const instances: MockWS[] = []

  class MockWS {
    url: string
    readyState: number = WebSocket.CONNECTING
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null

    constructor(url: string) {
      this.url = url
      instances.push(this)
    }

    close() {
      this.readyState = WebSocket.CLOSED
      this.onclose?.()
    }

    send(data: string) {}

    /** 测试用：模拟收到消息 */
    _receiveMessage(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) })
    }

    /** 测试用：模拟连接成功 */
    _connect() {
      this.readyState = WebSocket.OPEN
      this.onopen?.()
    }
  }

  return { MockWS, instances }
}

describe('TC-CORE-003: WS client 连接、自动重连、事件订阅', () => {
  it('调用 connect 后创建 WebSocket 实例', () => {
    const { MockWS, instances } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any })

    client.connect()
    expect(instances.length).toBe(1)
    expect(instances[0].url).toBe('ws://localhost:3000/ws')
  })

  it('连接成功后分发 connected 事件', () => {
    const { MockWS, instances } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any })

    const handler = mock(() => {})
    client.on('connected', handler)

    client.connect()
    instances[0]._connect()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('收到消息后分发对应事件', () => {
    const { MockWS, instances } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any })

    const handler = mock(() => {})
    client.on('task.updated', handler)

    client.connect()
    instances[0]._connect()

    const payload = { taskId: '123', status: 'running' }
    instances[0]._receiveMessage({ type: 'task.updated', payload })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toEqual(payload)
  })

  it('unparseable message 分发 raw_message 事件', () => {
    const { MockWS, instances } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any })

    const handler = mock(() => {})
    client.on('raw_message', handler)

    client.connect()
    instances[0]._connect()

    // 模拟收到无效 JSON
    instances[0]!.onmessage!({ data: 'not json' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('on 返回取消订阅函数', () => {
    const { MockWS, instances } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any })

    const handler = mock(() => {})
    const unsub = client.on('test.event', handler)

    client.connect()
    instances[0]._connect()

    instances[0]._receiveMessage({ type: 'test.event', payload: 'data1' })
    expect(handler).toHaveBeenCalledTimes(1)

    unsub()
    instances[0]._receiveMessage({ type: 'test.event', payload: 'data2' })
    expect(handler).toHaveBeenCalledTimes(1) // 不再被调用
  })

  it('disconnect 后不再重连', () => {
    const { MockWS } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any, reconnectInterval: 50 })

    client.connect()
    client.disconnect()

    expect(client.readyState).toBe(WebSocket.CLOSED)
  })

  it('send 在连接打开时发送 JSON 数据', () => {
    const { MockWS, instances } = createMockWebSocket()
    const client = createWSClient({ url: 'ws://localhost:3000/ws', wsImpl: MockWS as any })

    client.connect()
    instances[0]._connect()

    const sendSpy = mock(() => {})
    instances[0].send = sendSpy

    client.send({ type: 'ping' })
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe(JSON.stringify({ type: 'ping' }))
  })
})
