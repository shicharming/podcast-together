<script setup lang="ts">
/**
 * Study Mode 面板：共享番茄钟 + 每人 todo 列表 + 手动状态 + reaction。
 * 纯展示 + 事件上抛，计时全部来自服务端时间戳（父层 getRemainingMs 复用 time 校准）。
 */
import { computed, onMounted, onUnmounted, ref } from "vue"
import type { StudyState, StudyStatus, PageParticipant } from "../../type/type-room-page"

const props = defineProps<{
  study?: StudyState
  participants: PageParticipant[]
  myGuestId: string
  reactions: string[]
  getRemainingMs: () => number
}>()

const emit = defineEmits<{
  (e: "timer", action: "start" | "pause" | "reset" | "skip" | "config", config?: Record<string, number>): void
  (e: "todo", action: "add" | "toggle" | "delete", payload: { text?: string; todoId?: string }): void
  (e: "status", status: StudyStatus): void
  (e: "reaction", emoji: string): void
}>()

const STATUS_OPTIONS: { key: StudyStatus; label: string; emoji: string }[] = [
  { key: "working", label: "专注中", emoji: "💻" },
  { key: "stuck", label: "卡住了", emoji: "😵" },
  { key: "break", label: "休息", emoji: "☕" },
  { key: "away", label: "离开", emoji: "🚶" },
  { key: "done", label: "完成", emoji: "✅" },
]
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.key, s]))

const PHASE_LABEL: Record<string, string> = {
  focus: "专注",
  short_break: "短休息",
  long_break: "长休息",
}

// 500ms 心跳，驱动倒计时重算
const nowTick = ref(0)
let ticker = 0
let lastNotifiedStart = 0

const timer = computed(() => props.study?.timer)

const remainingMs = computed(() => {
  nowTick.value // 依赖心跳
  return props.getRemainingMs()
})

const mmss = computed(() => {
  const total = Math.max(0, Math.ceil(remainingMs.value / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`
})

const phaseName = computed(() => (timer.value ? PHASE_LABEL[timer.value.phase] ?? timer.value.phase : "专注"))
const isRunning = computed(() => !!timer.value?.isRunning)
const finished = computed(() => remainingMs.value <= 0)

const roundDots = computed(() => {
  const t = timer.value
  if (!t) return { total: 4, filled: 0 }
  const total = t.config.roundsBeforeLong
  return { total, filled: t.completedFocusRounds % total }
})

const nextPhaseLabel = computed(() => {
  const t = timer.value
  if (!t) return "下一阶段"
  if (t.phase === "focus") {
    const willLong = (t.completedFocusRounds + 1) % t.config.roundsBeforeLong === 0
    return willLong ? "开始长休息" : "开始短休息"
  }
  return "开始专注"
})

// todos / status，按 guestId
const todosFor = (guestId: string) => props.study?.todos?.[guestId] ?? []
const statusFor = (guestId: string) => props.study?.statuses?.[guestId] ?? "working"

const newTodo = ref("")
const showSettings = ref(false)
const cfgFocus = ref(25)
const cfgShort = ref(5)
const cfgLong = ref(15)

const onToggleTimer = () => emit("timer", isRunning.value ? "pause" : "start")
const onReset = () => emit("timer", "reset")
const onSkip = () => emit("timer", "skip")

const onSaveConfig = () => {
  emit("timer", "config", {
    focusMs: Math.round(cfgFocus.value * 60 * 1000),
    shortBreakMs: Math.round(cfgShort.value * 60 * 1000),
    longBreakMs: Math.round(cfgLong.value * 60 * 1000),
    roundsBeforeLong: timer.value?.config.roundsBeforeLong ?? 4,
  })
  showSettings.value = false
}

const onAddTodo = () => {
  const text = newTodo.value.trim()
  if (!text) return
  emit("todo", "add", { text })
  newTodo.value = ""
}
const onToggleTodo = (todoId: string) => emit("todo", "toggle", { todoId })
const onDeleteTodo = (todoId: string) => emit("todo", "delete", { todoId })
const onSetStatus = (status: StudyStatus) => emit("status", status)

// 阶段结束时的浏览器通知（每个阶段只提醒一次）
function maybeNotify() {
  const t = timer.value
  if (!t || !t.isRunning) return
  if (remainingMs.value > 0) return
  if (lastNotifiedStart === t.startStamp) return
  lastNotifiedStart = t.startStamp
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("番茄钟", { body: `${phaseName.value}结束啦，点「${nextPhaseLabel.value}」继续` })
    } catch {}
  }
}

onMounted(() => {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {})
  }
  ticker = window.setInterval(() => {
    nowTick.value++
    maybeNotify()
  }, 500)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<template>
  <div class="study-panel">
    <!-- 番茄钟 -->
    <div class="timer-card" :class="{ 'timer-finished': finished }">
      <div class="timer-phase">{{ phaseName }}</div>
      <div class="timer-clock">{{ mmss }}</div>
      <div class="timer-dots">
        <span
          v-for="i in roundDots.total"
          :key="i"
          class="timer-dot"
          :class="{ 'timer-dot_on': i <= roundDots.filled }"
        ></span>
      </div>
      <div class="timer-controls">
        <button class="tc-btn tc-main" @click="onToggleTimer">{{ isRunning ? '暂停' : (finished ? '继续' : '开始') }}</button>
        <button class="tc-btn" @click="onReset">重置</button>
        <button class="tc-btn tc-next" @click="onSkip">{{ nextPhaseLabel }}</button>
        <button class="tc-btn tc-ghost" @click="showSettings = !showSettings">设置</button>
      </div>
      <div v-if="showSettings" class="timer-settings">
        <label>专注<input type="number" v-model.number="cfgFocus" min="1" max="180" /></label>
        <label>短休<input type="number" v-model.number="cfgShort" min="1" max="60" /></label>
        <label>长休<input type="number" v-model.number="cfgLong" min="1" max="60" /></label>
        <button class="tc-btn tc-main" @click="onSaveConfig">保存</button>
      </div>
    </div>

    <!-- reaction -->
    <div class="study-reactions">
      <button v-for="e in reactions" :key="e" class="sr-chip" @click="emit('reaction', e)">{{ e }}</button>
    </div>

    <!-- 我的状态 -->
    <div class="my-status">
      <span class="ms-label">我的状态</span>
      <button
        v-for="opt in STATUS_OPTIONS"
        :key="opt.key"
        class="ms-chip"
        :class="{ 'ms-chip_on': statusFor(myGuestId) === opt.key }"
        @click="onSetStatus(opt.key)"
      >{{ opt.emoji }} {{ opt.label }}</button>
    </div>

    <!-- 参与者卡片：状态 + todo -->
    <div class="study-cards">
      <div class="study-card" v-for="p in participants" :key="p.guestId" :class="{ 'study-card_me': p.guestId === myGuestId }">
        <div class="sc-head">
          <span class="sc-name">{{ p.nickName }}<span v-if="p.guestId === myGuestId" class="sc-me">（我）</span></span>
          <span class="sc-status">{{ STATUS_MAP[statusFor(p.guestId)]?.emoji }} {{ STATUS_MAP[statusFor(p.guestId)]?.label }}</span>
        </div>

        <ul class="sc-todos">
          <li v-for="item in todosFor(p.guestId)" :key="item.id" class="sc-todo" :class="{ 'sc-todo_done': item.done }">
            <template v-if="p.guestId === myGuestId">
              <button class="sc-check" @click="onToggleTodo(item.id)">{{ item.done ? '☑' : '☐' }}</button>
              <span class="sc-todo-text">{{ item.text }}</span>
              <button class="sc-del" @click="onDeleteTodo(item.id)">✕</button>
            </template>
            <template v-else>
              <span class="sc-check sc-check_ro">{{ item.done ? '☑' : '☐' }}</span>
              <span class="sc-todo-text">{{ item.text }}</span>
            </template>
          </li>
          <li v-if="!todosFor(p.guestId).length" class="sc-empty">还没有 todo</li>
        </ul>

        <div v-if="p.guestId === myGuestId" class="sc-add">
          <input
            v-model="newTodo"
            type="text"
            maxlength="200"
            placeholder="加一个要做的事…"
            @keyup.enter="onAddTodo"
          />
          <button class="tc-btn tc-main" @click="onAddTodo">＋</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.study-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 40px;
}

.timer-card {
  width: 100%;
  background-color: var(--card-color);
  border-radius: 24px;
  padding: 28px 20px;
  text-align: center;
  transition: background-color .3s;

  &.timer-finished {
    background-color: var(--main-btn-bg);
    color: var(--main-btn-text);
  }

  .timer-phase {
    font-size: var(--desc-font);
    color: var(--desc-color);
    letter-spacing: .1em;
  }
  .timer-finished & .timer-phase { color: var(--main-btn-text); opacity: .85; }

  .timer-clock {
    font-size: 64px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    color: var(--text-color);
    margin: 6px 0 10px;
  }
  .timer-finished & .timer-clock { color: var(--main-btn-text); }

  .timer-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 18px;

    .timer-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--other-btn-bg);
    }
    .timer-dot_on { background-color: var(--main-btn-bg); }
    .timer-finished & .timer-dot { background-color: rgba(255,255,255,.4); }
    .timer-finished & .timer-dot_on { background-color: #fff; }
  }

  .timer-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }

  .timer-settings {
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 10px;

    label {
      font-size: var(--mini-font);
      color: var(--desc-color);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    input {
      width: 52px;
      border: none;
      border-radius: 10px;
      padding: 6px 8px;
      background-color: var(--other-btn-bg);
      color: var(--text-color);
      text-align: center;
    }
  }
}

.tc-btn {
  border: none;
  cursor: pointer;
  border-radius: 16px;
  padding: 8px 16px;
  font-size: var(--btn-font);
  background-color: var(--other-btn-bg);
  color: var(--other-btn-text);
  transition: .15s;

  &:hover { background-color: var(--other-btn-hover); }
  &.tc-main { background-color: var(--main-btn-bg); color: var(--main-btn-text); }
  &.tc-main:hover { background-color: var(--hover-btn-bg); }
  &.tc-ghost { opacity: .7; }
}

.study-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;

  .sr-chip {
    border: none;
    cursor: pointer;
    font-size: 20px;
    background-color: var(--card-color);
    border-radius: 14px;
    padding: 4px 12px;
    transition: .15s;
    &:hover { transform: translateY(-2px); }
  }
}

.my-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .ms-label {
    font-size: var(--mini-font);
    color: var(--note-color);
    margin-right: 4px;
  }
  .ms-chip {
    border: none;
    cursor: pointer;
    border-radius: 14px;
    padding: 6px 12px;
    font-size: var(--mini-font);
    background-color: var(--other-btn-bg);
    color: var(--other-btn-text);
    transition: .15s;
    &.ms-chip_on { background-color: var(--main-btn-bg); color: var(--main-btn-text); }
  }
}

.study-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.study-card {
  background-color: var(--card-color);
  border-radius: 18px;
  padding: 16px 18px;

  &.study-card_me { outline: 2px solid var(--main-btn-bg); }

  .sc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;

    .sc-name { font-weight: 700; color: var(--text-color); font-size: var(--desc-font); }
    .sc-me { color: var(--note-color); font-weight: 400; font-size: var(--mini-font); }
    .sc-status { font-size: var(--mini-font); color: var(--desc-color); white-space: nowrap; }
  }

  .sc-todos {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;

    .sc-todo {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: var(--desc-font);
      color: var(--desc-color);

      &.sc-todo_done .sc-todo-text { text-decoration: line-through; opacity: .55; }
      .sc-todo-text { flex: 1; word-break: break-word; }
      .sc-check, .sc-del {
        border: none;
        background: none;
        cursor: pointer;
        color: var(--desc-color);
        font-size: 15px;
        padding: 0;
      }
      .sc-check_ro { cursor: default; }
      .sc-del { opacity: .5; }
      .sc-del:hover { opacity: 1; }
    }
    .sc-empty { font-size: var(--mini-font); color: var(--note-color); }
  }

  .sc-add {
    display: flex;
    gap: 6px;
    margin-top: 10px;

    input {
      flex: 1;
      min-width: 0;
      border: none;
      border-radius: 12px;
      padding: 8px 12px;
      background-color: var(--other-btn-bg);
      color: var(--text-color);
      font-size: var(--desc-font);
    }
  }
}
</style>
