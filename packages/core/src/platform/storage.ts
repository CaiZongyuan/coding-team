/**
 * Platform bridge 接口定义
 *
 * 参考 Multica packages/core/platform/ 的设计。
 * 具体实现由各 app（web/desktop）注入。
 */

/** 存储适配器接口 */
export type StorageAdapter = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 导航接口 */
export type NavigationAdapter = {
  navigate(path: string): void
  goBack(): void
  getCurrentPath(): string
}

/** Platform bridge：各 app 需要实现的接口 */
export type PlatformBridge = {
  storage: StorageAdapter
  navigation: NavigationAdapter
  /** 平台标识（'web' | 'desktop'） */
  platform: string
}
