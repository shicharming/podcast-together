<script setup lang="ts">
import 'shikwasa2/dist/shikwasa.min.css'
import PtButton from "../../components/pt-button.vue"
import { useRoomPage } from "./tools/useRoomPage"
import ListeningLoader from '../../components/listening-loader.vue'
import images from '../../images';
import { initBtns } from "./tools/handle-btns"
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import { useTheme } from '../../hooks/useTheme';
import { initManage } from './tools/init-manage';
import RoomManagePopup from './room-manage-popup.vue';
import StudyPanel from './StudyPanel.vue';
import { useCccee } from "./tools/cccee"

import cui from '../../components/custom-ui';
import { useLocale } from '../../hooks/useLocale';
import { TranscriptCue, TranscriptRef } from '../../type';
import { request_parse_transcript } from '../create-page/cp-request';
import ptApi from '../../utils/pt-api';

const { theme } = useTheme()
const {
  pageData,
  playerEl,
  toHome,
  toContact,
  toEditMyName,
  onEveryoneCanOperatePlayerChange,
  sendReaction,
  addNote,
  seekToNote,
  getPlayerCurrentTimeMs,
  pauseWithReason,
  replaceContent,
  continuePlayback,
  pauseForInactiveListeners,
  sendTimer,
  sendTodo,
  sendStatus,
  getTimerRemainingMs,
} = useRoomPage()
const state = toRef(pageData, "state")

// 一起听 / 一起学 tab
const activeTab = ref<"listen" | "study">("listen")
const myGuestId = computed(() => pageData.participants.find(p => p.isMe)?.guestId ?? "")

// 纯专注房间（无播客）进入后默认切到 Study Mode
watch(() => pageData.state, (s) => {
  if(s === 3 && !pageData.content) activeTab.value = "study"
})

const { t } = useLocale()

const REACTIONS = ["😂", "🤔", "👍", "😭", "👀", "✨"]
const PAUSE_REASONS = computed(() => [...t.value.pauseReasons, t.value.pauseReasonWaiting])
const focusTick = ref(0)
const focusMinutesLeft = computed(() => {
  focusTick.value
  const elapsed = Math.floor(getPlayerCurrentTimeMs() / 1000)
  const left = Math.max(0, (25 * 60) - (elapsed % (25 * 60)))
  const m = Math.floor(left / 60)
  const s = left % 60
  return `${m}:${s < 10 ? "0" + s : s}`
})

const noteText = ref("")
const replaceLink = ref("")
const showReasons = ref(false)
const isReplacing = ref(false)
const subtitleEnabled = ref(ptApi.getStorageSync<boolean>("subtitle_enabled") === true)
const subtitleStatus = ref<"idle" | "loading" | "ready" | "empty" | "untimed">("idle")
const subtitleCues = ref<TranscriptCue[]>([])
const activeCueIndex = ref(-1)
let subtitleTimer = 0

const onTapAddNote = () => {
  const t = noteText.value.trim()
  addNote(t)
  noteText.value = ""
}

const onTapReason = (reason: string) => {
  pauseWithReason(reason)
  showReasons.value = false
}

const onTapReplaceContent = async () => {
  const link = replaceLink.value.trim()
  if(link.length < 10 || isReplacing.value) return
  isReplacing.value = true
  cui.showLoading({ title: t.value.roomReplaceParsing })
  const ok = await replaceContent(link)
  cui.hideLoading()
  isReplacing.value = false
  if(!ok) {
    cui.showModal({ content: t.value.roomReplaceFailed, showCancel: false })
    return
  }
  replaceLink.value = ""
}

const chooseTranscript = (items?: TranscriptRef[]): TranscriptRef | undefined => {
  if(!items?.length) return
  const score = (type: string) => {
    const t = type.toLowerCase()
    if(t.includes("vtt")) return 0
    if(t.includes("subrip") || t.includes("srt")) return 1
    if(t.includes("json")) return 2
    if(t.includes("text")) return 3
    return 4
  }
  return [...items].sort((a, b) => score(a.type) - score(b.type))[0]
}

const loadSubtitles = async () => {
  subtitleCues.value = []
  activeCueIndex.value = -1
  const transcript = chooseTranscript(pageData.content?.transcripts)
  if(!subtitleEnabled.value) {
    subtitleStatus.value = "idle"
    return
  }
  if(!transcript) {
    subtitleStatus.value = "empty"
    return
  }
  subtitleStatus.value = "loading"
  const res = await request_parse_transcript(transcript)
  if(!subtitleEnabled.value) return
  const cues = res?.data?.cues ?? []
  if(res?.code !== "0000") {
    subtitleStatus.value = "empty"
    return
  }
  if(!cues.length) {
    subtitleStatus.value = transcript.type.toLowerCase().includes("text") ? "untimed" : "empty"
    return
  }
  subtitleCues.value = cues
  subtitleStatus.value = "ready"
  updateActiveCue()
}

const onTapToggleSubtitles = () => {
  subtitleEnabled.value = !subtitleEnabled.value
  ptApi.setStorageSync("subtitle_enabled", subtitleEnabled.value)
  loadSubtitles()
}

const onTapSubtitleCue = (cue: TranscriptCue) => {
  seekToNote(cue.startMs)
}

const updateActiveCue = () => {
  if(!subtitleEnabled.value || !subtitleCues.value.length) return
  const current = getPlayerCurrentTimeMs()
  const idx = subtitleCues.value.findIndex(v => current >= v.startMs && current < v.endMs)
  if(idx === activeCueIndex.value) return
  activeCueIndex.value = idx
  nextTick(() => {
    document.querySelector(".subtitle-cue_active")?.scrollIntoView({ block: "center", behavior: "smooth" })
  })
}

const onTapCopyNotes = async () => {
  if(!pageData.notes.length) return
  const text = pageData.notes
    .map(n => `${formatTime(n.position)}  ${n.nickName}：${n.text}`)
    .join("\n")
  try {
    await navigator.clipboard.writeText(text)
    cui.showModal({ content: t.value.copiedNotes, showCancel: false })
  } catch {}
}

// ms → mm:ss
function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? "0" + s : s}`
}
const { 
  btnText, 
  btnText2, 
  h1, 
  pText, 
  onTapBtn, 
  onTapBtn2,
  onTapLeave,
  onTapShare,
  onTapEditMyName,
} = initBtns(state, pageData, toHome, toContact, toEditMyName)
const { 
  showManagePopup,
  onTapManageBtn,
  onTapManageMask,
} = initManage()

useCccee(pageData)

const alwaysFalse = ref(false)
const hasLink = computed(() => {
  const linkUrl = pageData.content?.linkUrl
  if(linkUrl) return true
  return false
})

const sourceLabel = computed(() => {
  const source = pageData.content?.sourceType
  if(source === "xiaoyuzhou") return "Xiaoyuzhou"
  if(source === "apple_podcast") return "Apple Podcasts"
  if(source === "direct_mp3") return "Direct MP3"
  return source || "Podcast"
})

const onTapShowMore = () => {
  if(hasLink.value) {
    window.open(pageData.content?.linkUrl as string, "_blank")
    return
  }
  if(pageData.showMoreBox) pageData.showMoreBox = false
}

watch(() => pageData.content?.audioUrl, () => {
  loadSubtitles()
})

onMounted(() => {
  subtitleTimer = window.setInterval(() => {
    focusTick.value++
    updateActiveCue()
  }, 500)
})

onUnmounted(() => {
  if(subtitleTimer) clearInterval(subtitleTimer)
})

</script>

<template>
  <div class="page">

    <!-- 给浏览器爬 -->
    <div v-show="alwaysFalse">
      <img :src="images.APP_LOGO_COS" height="132" width="132" />
      <p>{{ pageData.content?.title ? pageData.content.title 
        : pageData.content?.seriesName ? '邀请你加入《' + pageData.content?.seriesName + '》同步收听' 
        : '邀请你加入同步收听房间' }}</p>
    </div>


    <!-- 加载中 -->
    <div v-if="state <= 2" class="page-full">
      <ListeningLoader />
      <div class="pf-text">
        <span v-if="state === 1">{{ t.enteringRoom }}</span>
        <span v-else>{{ t.connectingPlayer }}</span>
      </div>
    </div>

    <!-- 正常显示 -->
    <div v-show="state === 3" class="page-container pomodoro-page">

      <!-- 浮动 reaction 层 -->
      <div class="reaction-layer">
        <transition-group name="reaction">
          <div v-for="r in pageData.reactions" :key="r.id" class="reaction-item">
            <span class="reaction-emoji">{{ r.emoji }}</span>
            <span class="reaction-name">{{ r.nickName }}</span>
          </div>
        </transition-group>
      </div>

      <!-- 暂停理由提示 -->
      <transition name="fade">
        <div v-if="pageData.pauseNotice" class="pause-notice">{{ pageData.pauseNotice }}</div>
      </transition>

      <!-- 一起听 / 一起学 切换 -->
      <div class="room-tabs">
        <button class="room-tab" :class="{ 'room-tab_on': activeTab === 'listen' }" @click="activeTab = 'listen'">🎧 {{ t.tabListen }}</button>
        <button class="room-tab" :class="{ 'room-tab_on': activeTab === 'study' }" @click="activeTab = 'study'">📚 {{ t.tabStudy }}</button>
      </div>

      <!-- Study Mode 面板 -->
      <StudyPanel
        v-show="activeTab === 'study'"
        :study="pageData.study"
        :participants="pageData.participants"
        :my-guest-id="myGuestId"
        :reactions="REACTIONS"
        :get-remaining-ms="getTimerRemainingMs"
        @timer="sendTimer"
        @todo="sendTodo"
        @status="sendStatus"
        @reaction="sendReaction"
      />

      <!-- 一起听（播客）视图 -->
      <div v-show="activeTab === 'listen'">

      <!-- 播放器 -->
      <div v-if="pageData.needsPlaybackResume" class="resume-banner">
        <span>{{ t.resumePlaybackHint }}</span>
        <button @click="continuePlayback">{{ t.resumePlayback }}</button>
      </div>

      <div v-if="pageData.inactiveListeners.length" class="inactive-banner">
        <span>{{ t.inactiveHint }}</span>
        <button @click="pauseForInactiveListeners">{{ t.pauseAndWait }}</button>
        <button @click="continuePlayback">{{ t.keepPlaying }}</button>
      </div>

      <div class="focus-shell">
        <div class="focus-label">Focus Session</div>
        <div class="focus-timer">{{ focusMinutesLeft }}</div>
        <div class="focus-sub">{{ pageData.inactiveListeners.length ? t.inactiveHint : t.sessionStatus }}</div>
      </div>

      <div ref="playerEl" class="rp-player"></div>

      <div class="subtitle-tools">
        <button class="cb-chip" :class="{ 'cb-on': subtitleEnabled }" @click="onTapToggleSubtitles">
          {{ subtitleEnabled ? t.subtitlesOn : t.subtitlesOff }}
        </button>
        <span v-if="subtitleEnabled && subtitleStatus === 'loading'">{{ t.subtitlesLoading }}</span>
        <span v-else-if="subtitleEnabled && subtitleStatus === 'empty'">{{ t.subtitlesEmpty }}</span>
        <span v-else-if="subtitleEnabled && subtitleStatus === 'untimed'">{{ t.subtitlesUntimed }}</span>
      </div>

      <div v-if="subtitleEnabled && subtitleStatus === 'ready'" class="subtitle-box" :aria-label="t.subtitles">
        <button
          v-for="(cue, index) in subtitleCues"
          :key="`${cue.startMs}-${index}`"
          class="subtitle-cue"
          :class="{ 'subtitle-cue_active': index === activeCueIndex }"
          @click="onTapSubtitleCue(cue)"
        >
          <span class="subtitle-time">{{ formatTime(cue.startMs) }}</span>
          <span>{{ cue.text }}</span>
        </button>
      </div>

      <div class="room-virtual-one"></div>

      <!-- 工作栏：reaction / 暂停理由 / 打点 / 替换音频 -->
      <div class="companion-bar">
        <div class="cb-row cb-reactions">
          <button v-for="e in REACTIONS" :key="e" class="cb-chip cb-emoji" @click="sendReaction(e)">{{ e }}</button>
        </div>

        <div class="cb-row cb-reason-row">
          <button v-for="r in PAUSE_REASONS" :key="r" class="cb-chip" @click="onTapReason(r)">{{ r }}</button>
        </div>

        <div class="cb-row cb-note-row">
          <input
            v-model="noteText"
            class="cb-note-input"
            type="text"
            :placeholder="t.notePlaceholder"
            maxlength="200"
            @keyup.enter="onTapAddNote"
          />
          <button class="cb-chip cb-note-btn" @click="onTapAddNote">{{ t.addNote }}</button>
        </div>

        <div class="cb-row cb-replace-row">
          <input
            v-model="replaceLink"
            class="cb-note-input"
            type="url"
            :placeholder="t.roomReplacePlaceholder"
            maxlength="1000"
            @keyup.enter="onTapReplaceContent"
          />
          <button class="cb-chip cb-note-btn" @click="onTapReplaceContent">
            {{ t.roomReplaceSubmit }}
          </button>
        </div>
      </div>

      <!-- 时间点笔记 -->
      <div v-if="pageData.notes.length" class="notes-box">
        <div class="notes-head">
          <span class="notes-title">{{ t.notesTitle }}</span>
          <span class="notes-copy" @click="onTapCopyNotes">{{ t.copyAll }}</span>
        </div>
        <div class="note-row" v-for="n in pageData.notes" :key="n.noteId">
          <button class="note-time" :title="t.noteJump" @click="seekToNote(n.position)">{{ formatTime(n.position) }}</button>
          <span class="note-nick">{{ n.nickName }}</span>
          <span class="note-text">{{ n.text }}</span>
        </div>
      </div>

      <div v-if="pageData.participants?.length" class="room-listening">
        <div class="rl-title">{{ t.listeners }}</div>
        <div class="rl-mini-btn" v-if="pageData.amIOwner" @click="onTapManageBtn">
          <span>{{ t.manage }}</span>
        </div>
      </div>
      <div v-if="pageData.participants?.length"
        class="room-participants"
      >
        <template v-for="(item, index) in pageData.participants" :key="item.guestId">
          <div class="room-participant">
            <div class="rp-nickName" 
              :class="{ 'rp-nickName_pointer': item.isMe }" 
              @click="onTapEditMyName(item)"
            >
              <span>{{ item.nickName }}</span>
              <div v-if="item.isMe" class="div-bg-img rp-nickName-icon"></div>
            </div>
            <div class="rp-enter-time">
              <span>{{ item.enterStr }}{{ t.entered }}</span>
            </div>
          </div>
        </template>
      </div>
      </div><!-- /listen (part 1) -->

      <!-- 离开 / 分享（两个 tab 都显示） -->
      <div class="room-btns">
        <div class="room-btn" @click="onTapLeave">
          <div class="div-bg-img room-btn-icon room-btn-icon_leave"></div>
          <span>{{ t.leave }}</span>
        </div>
        <div class="room-btn room-btn-main" @click="onTapShare">
          <div class="div-bg-img room-btn-icon room-btn-icon_share"></div>
          <span>{{ t.share }}</span>
        </div>
      </div>

      <!-- 一起听（续）：单集信息 -->
      <div v-show="activeTab === 'listen'">
      <div v-if="pageData.content?.title"
        class="room-title-desc"
      >
        <div class="episode-meta">
          <span>{{ sourceLabel }}</span>
          <span v-if="pageData.content.seriesName">{{ pageData.content.seriesName }}</span>
          <a v-if="pageData.content.linkUrl" :href="pageData.content.linkUrl" target="_blank" rel="noreferrer">Original</a>
          <a v-if="pageData.content.seriesUrl" :href="pageData.content.seriesUrl" target="_blank" rel="noreferrer">Series</a>
        </div>
        <div class="room-podcast-title">
          <span>{{ pageData.content.title }}</span>
        </div>
        <div v-if="pageData.content.description" class="room-desc-box">
          <div v-if="pageData.showMoreBox" 
            class="room-description room-desc-limited"
          >
            <span>{{ pageData.content.description }}</span>
          </div>
          <div v-else class="room-description" :class="{ 'room-desc_pointer': hasLink }" @click="onTapShowMore">
            <span>{{ pageData.content.description }}</span>
          </div>

          <!-- 展开更多 -->
          <div v-if="pageData.showMoreBox" 
            class="room-show-more"
            @click="onTapShowMore"
          >
            <span class="room-show-more-text">{{ hasLink ? '查看原文' : '展开更多' }}</span>
            <div class="div-bg-img room-show-more-icon" :class="{ 'rsmi-rotated': hasLink }" ></div>
            <div class="room-show-more-bg"></div>
          </div>
        </div>
      </div>

      <div class="room-virtual-two"></div>
      </div><!-- /listen (part 2) -->

    </div>

    <!-- 出现异常 -->
    <div v-show="state >= 11" class="page-full">
      <img :src="state === 17 ? images.IMG_DOOR : images.IMG_PLACEHOLDER" class="pf-no-data-img" />
      <div class="pf-no-data-box">
        <h1>{{ h1 }}</h1>
        <p v-if="pText">{{ pText }}</p>
      </div>
      <div class="pf-no-data-btns">
        <pt-button
          :type="btnText2 ? 'main' : 'other'"
          @click="onTapBtn"
          :text="btnText" 
        />
        <pt-button
          v-if="btnText2"
          type="other"
          class="pf-ndb-other"
          @click="onTapBtn2"
          :text="btnText2" 
        />
      </div>
    </div>

  </div>
  <RoomManagePopup 
    :show="showManagePopup" 
    :everyoneCanOperatePlayer="pageData.everyoneCanOperatePlayer"
    @tapmask="onTapManageMask"
    @everyoneCanOperatePlayerChange="onEveryoneCanOperatePlayerChange"
  ></RoomManagePopup>
  
</template>

<style scoped lang="scss">

.page {
  min-height: 100vh;
}

.room-tabs {
  width: 100%;
  display: flex;
  gap: 8px;
  margin-bottom: 20px;

  .room-tab {
    flex: 1;
    border: none;
    cursor: pointer;
    border-radius: 16px;
    padding: 10px 0;
    font-size: var(--btn-font);
    background-color: var(--other-btn-bg);
    color: var(--other-btn-text);
    transition: .15s;

    &.room-tab_on {
      background-color: var(--main-btn-bg);
      color: var(--main-btn-text);
    }
  }
}

.page-full {
  height: 100vh;
  min-height: 480px;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  justify-content: space-evenly;
  align-items: center;
  width: 92%;
  max-width: 400px;
  position: relative;

  .pf-text {
    font-size: var(--desc-font);
    color: var(--desc-color);
    line-height: 1.5;
  }

  .pfnd-btns {
    width: 100%;
    height: 116px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .pf-no-data-img {
    width: 90px;
    height: 90px;
  }

  .pf-no-data-box {
    width: 100%;
    height: 150px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    h1 {
      margin-block-start: auto;
      margin-block-end: auto;
      font-size: var(--big-word-style);
      color: var(--text-color);
      line-height: 1.2;
    }

    p {
      margin-block-start: 20px;
      margin-block-end: auto;
      font-size: var(--desc-color);
      color: var(--desc-color);
      line-height: 1.5;
      text-align: center;
      white-space: pre-wrap;
      user-select: text;
    }
  }

  .pf-no-data-btns {
    width: 100%;
    height: 130px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    .pf-ndb-other {
      margin-top: 15px;
    }
  }

}

.page-container {
  padding-top: 50px;
  align-items: flex-start;
  text-align: left;
  max-width: 700px;
  
  .rp-player {
    width: 100%;
    position: relative;
    z-index: 500;
  }

  .room-virtual-one {
    width: 100%;
    height: 50px;
  }

  h2 {
    font-size: var(--title-font);
    color: var(--text-color);
    margin-block-start: 0;
    margin-block-end: 20px;
  }

  .room-listening {
    margin-block-start: 0;
    margin-block-end: 20px;
    width: 100%;
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;

    .rl-title {
      font-size: var(--title-font);
      color: var(--text-color);
      font-weight: 700;
      width: 60%;
      display: flex;
      flex-wrap: wrap;
      line-height: 32px;
    }

    .rl-mini-btn {
      display: flex;
      height: 32px;
      align-items: center;
      justify-content: center;
      background-color: var(--other-btn-bg);
      color: var(--other-btn-text);
      font-size: var(--mini-font);
      transition: .15s;
      cursor: pointer;
      border-radius: 30px;
      padding: 0 14px;
      min-width: 50px;
    }

    .rl-mini-btn:hover, .rl-mini-btn:active {
      background-color: var(--other-btn-hover);
    }

  }

  .room-participants {
    width: 100%;
    background-color: var(--card-color);
    box-sizing: border-box;
    padding: 20px 24px;
    border-radius: 20px;
    position: relative;

    .room-participant {
      flex: 1;
      display: flex;
      align-items: center;
      height: 80px;
      position: relative;
    }

    .rp-nickName {
      display: flex;
      max-width: 60%;
      font-size: var(--desc-font);
      line-height: 22px;
      color: var(--desc-color);
      padding-right: 10px;
      user-select: text;

      .rp-nickName-icon {
        width: 22px;
        height: 22px;
        margin-left: 6px;
        opacity: .56;
        background-image: v-bind("'url(' + (theme === 'light' ? images.IC_EDIT : images.IC_EDIT_DM) + ')'");
      }
    }

    .rp-nickName_pointer {
      cursor: pointer;
    }

    .rp-enter-time {
      flex: 1;
      display: flex;
      justify-content: flex-end;
      text-align: right;
      font-size: var(--mini-font);
      color: var(--note-color);
    }

  }

  .room-virtual-two {
    width: 100%;
    height: 130px;
  }

  @media screen and (max-width: 640px) {
    .room-virtual-one {
      display: none;
    }

    .room-virtual-two {
      height: 180px;
    }
  }

  .room-btns {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-around;
    justify-content: space-evenly;
    position: relative;
    margin-top: 50px;

    .room-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 25px;
      height: 50px;
      width: 30%;
      min-width: 120px;
      transition: .15s;
      background-color: var(--other-btn-bg);
      color: var(--other-btn-text);
      font-size: var(--btn-font);
      cursor: pointer;

      .room-btn-icon {
        width: 20px;
        height: 20px;
        margin-right: 16px;
        opacity: v-bind("theme === 'light' ? .56 : .98");

        &.room-btn-icon_leave {
          background-image: v-bind("'url(' + (theme === 'light' ? images.IC_CLOSE : images.IC_CLOSE_DM) + ')'");
        }

        &.room-btn-icon_share {
          opacity: v-bind("theme === 'light' ? .98 : .66");
          background-image: v-bind("'url(' + (theme === 'light' ? images.IC_SHARE : images.IC_SHARE_DM) + ')'");
        }
      }

      &:hover {
        background-color: var(--other-btn-hover);
      }

      &.room-btn-main {
        background-color: var(--main-btn-bg);
        color: var(--main-btn-text);

        &:hover {
          background-color: var(--hover-btn-bg);
        }
      }
    }

  }

  .room-title-desc {
    margin-top: 50px;
    position: relative;
    width: 100%;

    .episode-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;

      span,
      a {
        padding: 5px 9px;
        border-radius: 6px;
        background-color: var(--tag-bg);
        color: var(--tag-text);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.35;
      }
    }

    .room-podcast-title {
      width: 100%;
      font-size: var(--title-font);
      color: var(--text-color);
      line-height: 1.5;
      font-weight: 700;
      margin-bottom: 10px;
      user-select: text;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      max-width: 100%;
    }

    .room-desc-box {
      width: 100%;
      background-color: var(--card-color);
      box-sizing: border-box;
      padding: 20px 24px;
      border-radius: 20px;
      position: relative;

      .room-description {
        position: relative;
        width: 100%;
        font-size: var(--desc-font);
        color: var(--desc-color);
        line-height: 1.75;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
        z-index: 10;
        user-select: text;
      }

      .room-desc-limited {
        /** 18px * 1.75行倍距 * 3行 */
        max-height: 95px;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }

      .room-desc_pointer {
        cursor: pointer;
      }

      .room-show-more {
        z-index: 15;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        text-align: center;
        width: 100%;
        padding: 30px 0 5px;
        /** 18px * 1.75 然后再减掉 5 */
        margin-top: -27px;
        cursor: pointer;

        .room-show-more-text {
          font-size: var(--btn-font);
          color: var(--text-color);
          font-weight: 700;
          line-height: 1.5;
          z-index: 17;
        }

        .room-show-more-icon {
          width: 20px;
          height: 20px;
          margin-left: 4px;
          opacity: .8;
          z-index: 17;
          background-image: v-bind("'url(' + (theme === 'light' ? images.IC_EXPAND : images.IC_EXPAND_DM) + ')'");
        }

        .rsmi-rotated {
          transform: rotate(-90deg);
        }

        .room-show-more-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 16;
          background: var(--more-btn-bg);
        }
      }

    }

  }

}

</style>

<!-- 新功能样式：reaction / 暂停理由 / 工作栏 / 时间点笔记 -->
<style scoped lang="scss">
.resume-banner,
.inactive-banner {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: var(--card-color);
  color: var(--text-color);
  box-shadow: 0 2px 12px rgba(0, 0, 0, .08);

  span {
    min-width: 0;
    font-size: var(--mini-font);
    line-height: 1.45;
  }

  button {
    border: 0;
    border-radius: 6px;
    min-height: 36px;
    padding: 0 12px;
    white-space: nowrap;
    background-color: var(--main-btn-bg);
    color: var(--main-btn-text);
    font-size: var(--mini-font);
    cursor: pointer;
  }
}

.inactive-banner button + button {
  background-color: var(--other-btn-bg);
  color: var(--other-btn-text);
}

.pomodoro-page {
  gap: 0;
}

.focus-shell {
  display: grid;
  width: 100%;
  min-height: 260px;
  box-sizing: border-box;
  padding: 30px 20px;
  border-radius: 8px;
  background: var(--card-color);
  color: var(--text-color);
  place-items: center;
  text-align: center;
  border: 1px solid var(--line-color);
  margin-bottom: 14px;
}

.focus-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--note-color);
}

.focus-timer {
  margin-top: 22px;
  font-size: 76px;
  line-height: 1;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.focus-sub {
  margin-top: 22px;
  max-width: 280px;
  color: var(--desc-color);
  font-size: var(--desc-font);
  line-height: 1.5;
}

.pomodoro-page .rp-player,
.pomodoro-page .subtitle-box,
.pomodoro-page .notes-box,
.pomodoro-page .room-participants,
.pomodoro-page .room-desc-box {
  border-radius: 8px;
  border: 1px solid var(--line-color);
}

.pomodoro-page .rp-player {
  margin-top: 0;
  margin-bottom: 12px;
  overflow: hidden;
}

.pomodoro-page .subtitle-tools {
  margin-top: 8px;
}

.reaction-layer {
  position: fixed;
  right: 16px;
  bottom: 90px;
  z-index: 800;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
}

.reaction-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: var(--card-color);
  border-radius: 20px;
  padding: 4px 12px 4px 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .1);

  .reaction-emoji { font-size: 20px; }
  .reaction-name {
    font-size: var(--mini-font);
    color: var(--desc-color);
  }
}

.reaction-enter-active { transition: all .25s ease; }
.reaction-leave-active { transition: all .4s ease; }
.reaction-enter-from { opacity: 0; transform: translateY(8px); }
.reaction-leave-to { opacity: 0; transform: translateX(20px); }

.pause-notice {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  background-color: var(--card-color);
  color: var(--text-color);
  font-size: var(--desc-font);
  padding: 8px 18px;
  border-radius: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .12);
}

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.subtitle-tools {
  width: 100%;
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .cb-chip {
    border: none;
    cursor: pointer;
    background-color: var(--other-btn-bg);
    color: var(--other-btn-text);
    font-size: var(--mini-font);
    border-radius: 16px;
    padding: 6px 14px;
    transition: .15s;
    line-height: 1.4;

    &:hover { background-color: var(--other-btn-hover); }
    &.cb-on {
      background-color: var(--main-btn-bg);
      color: var(--main-btn-text);
    }
  }

  span {
    color: var(--note-color);
    font-size: var(--mini-font);
  }
}

.subtitle-box {
  width: 100%;
  max-height: 220px;
  overflow-y: auto;
  margin-top: 12px;
  padding: 12px;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--line-color);
  background-color: var(--card-color);
}

.subtitle-cue {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--desc-color);
  cursor: pointer;
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 10px;
  padding: 7px 8px;
  text-align: left;
  font-size: 15px;
  line-height: 1.55;
  transition: background-color .15s, color .15s;

  &:hover {
    background-color: var(--tag-bg);
  }

  &.subtitle-cue_active {
    background-color: var(--main-btn-bg);
    color: var(--main-btn-text);
  }
}

.subtitle-time {
  color: var(--note-color);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.subtitle-cue_active .subtitle-time {
  color: inherit;
  opacity: .72;
}

.companion-bar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;

  .cb-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .cb-chip {
    border: none;
    cursor: pointer;
    background-color: var(--other-btn-bg);
    color: var(--other-btn-text);
    font-size: var(--mini-font);
    border-radius: 16px;
    padding: 6px 14px;
    transition: .15s;
    line-height: 1.4;

    &:hover { background-color: var(--other-btn-hover); }
    &.cb-on {
      background-color: var(--main-btn-bg);
      color: var(--main-btn-text);
    }
  }

  .cb-emoji { font-size: 18px; padding: 4px 10px; }

  .cb-reason-row .cb-chip {
    min-height: 36px;
  }

  .cb-note-row,
  .cb-replace-row {
    flex-wrap: nowrap;
    .cb-note-input {
      flex: 1;
      min-width: 0;
      background-color: var(--card-color);
      color: var(--text-color);
      border: none;
      outline: none;
      border-radius: 16px;
      padding: 8px 14px;
      font-size: var(--desc-font);
    }
    .cb-note-btn { white-space: nowrap; }
  }

  .cb-replace-row {
    padding-top: 2px;
  }

  @media screen and (max-width: 640px) {
    position: sticky;
    bottom: 0;
    z-index: 760;
    width: calc(100% + 24px);
    margin-left: -12px;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    border-top: 1px solid var(--line-color);
    background-color: color-mix(in srgb, var(--card-color) 94%, transparent);
    backdrop-filter: blur(14px);

    .cb-row {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }

    .cb-row::-webkit-scrollbar { display: none; }

    .cb-chip {
      min-height: 44px;
      border-radius: 8px;
      padding: 8px 12px;
      flex-shrink: 0;
    }

    .cb-note-row,
    .cb-replace-row {
      .cb-note-input {
        min-height: 44px;
        font-size: 16px;
      }
    }
  }
}

.notes-box {
  width: 100%;
  background-color: var(--card-color);
  box-sizing: border-box;
  padding: 16px 20px;
  border-radius: 20px;
  margin-bottom: 24px;

  .notes-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    .notes-title {
      font-size: var(--desc-font);
      color: var(--text-color);
      font-weight: 700;
    }
    .notes-copy {
      font-size: var(--mini-font);
      color: var(--desc-color);
      cursor: pointer;
    }
  }

  .note-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 0;
    font-size: var(--desc-font);
    line-height: 1.5;

    .note-time {
      border: 0;
      border-radius: 6px;
      padding: 3px 7px;
      background-color: var(--tag-bg);
      color: var(--main-btn-bg);
      cursor: pointer;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      font-size: var(--mini-font);
      line-height: 1.35;
    }
    .note-nick {
      color: var(--note-color);
      font-size: var(--mini-font);
      flex-shrink: 0;
    }
    .note-text {
      color: var(--desc-color);
      word-break: break-word;
    }
  }
}

</style>

<!-- 全局 -->
<style>
.shk-cover {
  background-position: center;
}
</style>
