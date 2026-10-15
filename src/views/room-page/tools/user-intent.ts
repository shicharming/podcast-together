// 只有“人”的操作才广播：系统暂停（iOS 锁屏/来电）、缓冲后的 playing、自动纠偏都不上报，
// 否则一台手机锁屏就会把全房间暂停，纠偏后的回声还会让各端来回拉扯。
// ponytail: 一次性标记 + 10s 过期；点了却没触发事件（如 autoplay 失败）时，
// 10s 内的下一个系统事件会被误当成人为操作。升级路径：按操作类型分别记意图。
export const USER_INTENT_MS = 10 * 1000

export function createIntentGate(now: () => number = Date.now) {
  let until = 0
  return {
    mark: () => { until = now() + USER_INTENT_MS },
    // 消费一次：同一次点击只放行第一个播放器事件（seek 之后的缓冲 playing 不算）
    take: (): boolean => {
      const ok = now() < until
      until = 0
      return ok
    },
  }
}
