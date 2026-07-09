<script setup lang="ts">
import { computed, ref, onActivated, watch } from 'vue';
import { hasPreviousRouteInApp, goHome, useRouteAndPtRouter } from "../../routes/pt-router";
import PtButton from "../../components/pt-button.vue"
import cp from "./cp-helper"
import ListeningLoader from '../../components/listening-loader.vue'

const { router, route } = useRouteAndPtRouter()
const hasPrev = hasPreviousRouteInApp()
const inputValue = ref<string>("")
const inputEl = ref<HTMLInputElement | null>(null)

const hasQuery = ref(false)
watch(() => route.query, (newV, oldV) => {
  if(route.name !== "create") return
  const { title, text, link } = newV
  hasQuery.value = Boolean(title || text || link)
})

const canSubmit = computed(() => {
  const val = inputValue.value
  const v = val.trim()
  if(v.length < 10) return false
  const reg = /^http(s)?:\/\/[\w\.-]*\w{1,32}\.\w{2,6}\S*$/g
  return reg.test(val)
})

const onInputConfirm = () => {
  inputEl?.value?.blur()
  if(!canSubmit.value) return
  cp.finishInput(inputValue.value, router, route)
}

const onTapConfirm = () => {
  if(!canSubmit.value) return
  cp.finishInput(inputValue.value, router, route)
  inputEl?.value?.blur()
}

const onTapBack = () => {
  if(hasPrev.value) router.go(-1)
  else goHome(router)
}

const onTapFocusRoom = () => {
  cp.createFocusRoom(router, route)
}

onActivated(() => {
  const { title, text, link } = route.query

  if(title || text || link) {
    hasQuery.value = true
    cp.useLinkFromQuery(router, route)
  }
  else {
    if(canSubmit.value) return
    inputEl.value?.focus()
  }
})
</script>

<template>
  <main class="create-page">
    <section class="create-shell">
      <p class="eyebrow">New listening room</p>
      <h1>导入单集链接</h1>
      <p class="intro">
        粘贴小宇宙、Apple Podcasts 多地区链接，或可公开访问的 mp3 地址。系统会解析标题、封面和音频源，并创建一个可分享的同步房间。
      </p>

      <label class="url-box">
        <span>Episode URL</span>
        <input
          v-model="inputValue"
          placeholder="https://www.xiaoyuzhoufm.com/episode/..."
          type="url"
          @keyup.enter="onInputConfirm"
          maxlength="1000"
          ref="inputEl"
        />
      </label>

      <div class="support-row">
        <span>xiaoyuzhoufm.com</span>
        <span>Apple Podcasts JP / CA / CN</span>
        <span>direct mp3</span>
      </div>
    </section>

    <section class="create-actions">
      <pt-button
        class="join-main-btn"
        text="创建房间"
        @click="onTapConfirm"
        :disabled="!canSubmit"
      />
      <pt-button class="focus-room-btn" text="创建专注房间（无需播客）" type="other" @click="onTapFocusRoom"></pt-button>
      <pt-button :text="hasPrev ? '返回' : '回到首页'" type="other" @click="onTapBack"></pt-button>
    </section>

    <div v-if="hasQuery" class="page-full">
      <ListeningLoader />
      <div class="pf-text">
        <span>正在创建收听房间</span>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
.create-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 68px 20px 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(233, 239, 244, .5) 100%),
    var(--bg-color);
}

.create-shell,
.create-actions {
  width: 100%;
  max-width: 560px;
}

.eyebrow {
  margin: 0 0 14px;
  color: var(--accent-color);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--text-color);
  font-size: clamp(34px, 7vw, 54px);
  line-height: 1.08;
}

.intro {
  margin: 18px 0 38px;
  color: var(--desc-color);
  font-size: 16px;
  line-height: 1.8;
  text-align: left;
}

.url-box {
  display: block;
  padding: 18px;
  border: 1px solid var(--line-color);
  border-radius: 8px;
  background-color: var(--card-color);
  box-sizing: border-box;

  span {
    display: block;
    margin-bottom: 12px;
    color: var(--note-color);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
  }
}

input {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  outline: none;
  color: var(--text-color);
  font-size: 18px;
  line-height: 1.6;
  text-align: left;
}

input::-webkit-input-placeholder {
  color: var(--note-color);
}

.support-row {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    padding: 6px 10px;
    border-radius: 6px;
    background-color: var(--tag-bg);
    color: var(--tag-text);
    font-size: 12px;
    font-weight: 700;
  }
}

.create-actions {
  padding-top: 36px;

  .join-main-btn {
    margin-bottom: 12px;
  }

  .focus-room-btn {
    margin-bottom: 12px;
  }
}

.page-full {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  width: 100vw;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1500;
  background-color: var(--bg-color);

  .pf-text {
    font-size: var(--desc-font);
    color: var(--desc-color);
    line-height: 1.5;
  }
}
</style>
