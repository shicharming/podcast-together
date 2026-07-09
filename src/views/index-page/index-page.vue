<script setup lang="ts">
import PtButton from "../../components/pt-button.vue"
import { useRouteAndPtRouter } from "../../routes/pt-router"
import images from "../../images"
import { computed, onActivated, ref, watch } from "vue"
import share from "../../utils/share"
import { useAddToHomeScreen } from "./tools/useAddToHomeScreen"
import { useLocale } from "../../hooks/useLocale"
import cp from "../create-page/cp-helper"
import ptUtil from "../../utils/pt-util"

const { showInstallPwaBtn, onTapInstall } = useAddToHomeScreen()
const { router, route } = useRouteAndPtRouter()
const { t } = useLocale()

const urlValue = ref("")
const nameValue = ref(ptUtil.getUserData().nickName || "")
const inputEl = ref<HTMLInputElement | null>(null)
const isCreatingFromQuery = ref(false)

const isDummyUrl = (value: string) => {
  const v = value.trim().toLowerCase()
  if(!v) return false
  return v.includes("...") || v.includes("dummy") || v.includes("example.com") || v.includes("/episode/...")
}

const canSubmit = computed(() => {
  const url = urlValue.value.trim()
  const name = nameValue.value.trim()
  if(name.length < 1 || url.length < 10) return false
  const reg = /^http(s)?:\/\/[\w\.-]*\w{1,32}\.\w{2,6}\S*$/g
  return reg.test(url)
})

const saveName = () => {
  const userData = ptUtil.getUserData()
  userData.nickName = nameValue.value.trim()
  ptUtil.setUserData(userData)
}

const onTapCreateBtn = () => {
  if(isDummyUrl(urlValue.value)) {
    urlValue.value = ""
    inputEl.value?.focus()
    return
  }
  if(!canSubmit.value) return
  saveName()
  cp.finishInput(urlValue.value, router, route)
  inputEl.value?.blur()
}

const onUrlFocus = () => {
  if(isDummyUrl(urlValue.value)) urlValue.value = ""
}

const tryUseShareTarget = () => {
  const { title, text, link } = route.query
  if(!(title || text || link)) return
  if(!nameValue.value.trim()) return
  isCreatingFromQuery.value = true
  saveName()
  cp.useLinkFromQuery(router, route, "index")
}

watch(() => route.query, () => {
  if(route.name === "index") tryUseShareTarget()
})

onActivated(() => {
  share.configShare()
  tryUseShareTarget()
  if(!urlValue.value) inputEl.value?.focus()
})
</script>

<template>
  <main class="index-page">
    <section class="index-shell">
      <div class="brand-row">
        <div class="div-bg-img brand-mark"></div>
        <span>{{ t.brand }}</span>
      </div>

      <div class="hero-copy">
        <p class="eyebrow">{{ t.eyebrow }}</p>
        <h1>{{ t.homeTitle }}</h1>
        <p class="subtitle">{{ t.homeIntro }}</p>
      </div>

      <form class="create-panel" @submit.prevent="onTapCreateBtn">
        <label class="field name-field">
          <span>{{ t.nameLabel }}</span>
          <input
            v-model="nameValue"
            :placeholder="t.namePlaceholder"
            type="text"
            maxlength="20"
            autocomplete="nickname"
          />
        </label>

        <label class="field">
          <span>{{ t.urlLabel }}</span>
          <input
            v-model="urlValue"
            :placeholder="t.urlPlaceholder"
            type="url"
            maxlength="1000"
            ref="inputEl"
            @focus="onUrlFocus"
          />
        </label>

        <pt-button class="index-main-btn" :text="t.createRoom" @click="onTapCreateBtn" :disabled="!canSubmit"></pt-button>
        <p class="remember-hint">{{ t.rememberHint }}</p>
      </form>

      <div class="support-row" :aria-label="t.supported">
        <span>{{ t.supported }}</span>
        <strong>{{ t.supportedLine }}</strong>
      </div>

      <section class="supported-sites" :aria-label="t.supportedSitesTitle">
        <div class="supported-sites__head">{{ t.supportedSitesTitle }}</div>
        <div class="supported-sites__grid">
          <span v-for="site in t.supportedSites" :key="site">{{ site }}</span>
        </div>
        <p>{{ t.supportedSitesNote }}</p>
      </section>

      <div class="signal-panel" aria-label="room status preview">
        <div class="signal-line">
          <span class="signal-dot"></span>
          <span>{{ t.signal }}</span>
        </div>
        <div class="meter-row">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div class="feature-grid">
        <div v-for="(feature, index) in t.features" :key="feature">
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <strong>{{ feature }}</strong>
        </div>
      </div>
    </section>

    <section class="action-shell">
      <button v-if="showInstallPwaBtn" class="install-btn" @click="onTapInstall">
        <img :src="images.IC_DOWNLOAD" alt="" />
        <span>{{ t.installApp }}</span>
      </button>
    </section>

    <div v-if="isCreatingFromQuery" class="page-full">
      <div class="pf-text">
        <span>{{ t.creating }}</span>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
.index-page {
  min-height: 100vh;
  width: 100%;
  box-sizing: border-box;
  padding: 34px 20px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  background:
    radial-gradient(circle at 12% 4%, rgba(181, 138, 82, .16) 0, transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(233, 239, 244, .58) 100%),
    var(--bg-color);
}

.index-shell,
.action-shell {
  width: 100%;
  max-width: 620px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--desc-color);
  font-size: var(--mini-font);
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.brand-mark {
  width: 38px;
  height: 38px;
  background-image: v-bind("'url(' + images.APP_LOGO + ')'");
}

.hero-copy {
  margin-top: 54px;
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
  font-size: clamp(36px, 7.5vw, 62px);
  line-height: 1.06;
  font-weight: 850;
}

.subtitle {
  max-width: 580px;
  margin: 20px 0 0;
  color: var(--desc-color);
  font-size: 17px;
  line-height: 1.75;
  text-align: left;
}

.create-panel {
  margin-top: 34px;
  display: grid;
  grid-template-columns: minmax(128px, .42fr) 1fr;
  gap: 10px;
}

.field {
  display: block;
  padding: 14px 16px;
  border: 1px solid var(--line-color);
  border-radius: 8px;
  background-color: var(--card-color);
  box-sizing: border-box;
  text-align: left;

  span {
    display: block;
    margin-bottom: 8px;
    color: var(--note-color);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
}

input {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  outline: none;
  color: var(--text-color);
  font-size: 17px;
  line-height: 1.5;
  text-align: left;
}

input::-webkit-input-placeholder {
  color: var(--note-color);
}

.index-main-btn {
  grid-column: 1 / -1;
  margin-top: 2px;
}

.remember-hint {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  color: var(--note-color);
  font-size: 13px;
  text-align: center;
}

.support-row {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  span,
  strong {
    padding: 7px 10px;
    border-radius: 6px;
    background-color: var(--tag-bg);
    color: var(--tag-text);
    font-size: 12px;
    line-height: 1.35;
  }

  strong {
    font-weight: 800;
  }
}

.supported-sites {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--line-color);
  border-radius: 8px;
  background-color: var(--card-color);
  text-align: left;
}

.supported-sites__head {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 10px;
}

.supported-sites__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    padding: 6px 9px;
    border-radius: 6px;
    background-color: var(--tag-bg);
    color: var(--tag-text);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }
}

.supported-sites p {
  margin: 10px 0 0;
  color: var(--note-color);
  font-size: 12px;
  line-height: 1.55;
}

.signal-panel {
  margin-top: 38px;
  padding: 18px 0;
  border-top: 1px solid var(--line-color);
  border-bottom: 1px solid var(--line-color);
}

.signal-line {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 700;
}

.signal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--accent-color);
  box-shadow: 0 0 0 6px rgba(47, 111, 143, .12);
}

.meter-row {
  height: 36px;
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1.4fr .8fr 1.8fr 1fr 1.2fr;
  gap: 8px;
  align-items: end;

  span {
    display: block;
    height: 10px;
    background-color: var(--meter-color);
    border-radius: 2px;

    &:nth-child(2) { height: 24px; }
    &:nth-child(3) { height: 16px; }
    &:nth-child(4) { height: 30px; }
    &:nth-child(5) { height: 20px; background-color: var(--accent-warm); }
  }
}

.feature-grid {
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  div {
    min-height: 82px;
    padding: 14px;
    box-sizing: border-box;
    border: 1px solid var(--line-color);
    border-radius: 8px;
    background-color: var(--card-color);
    text-align: left;
  }

  span {
    display: block;
    color: var(--note-color);
    font-size: 12px;
    font-weight: 800;
    margin-bottom: 10px;
  }

  strong {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.45;
  }
}

.action-shell {
  padding-top: 24px;
}

.install-btn {
  width: 100%;
  height: 50px;
  border: 0;
  border-radius: 8px;
  background-color: var(--other-btn-bg);
  color: var(--other-btn-text);
  cursor: pointer;
  font-size: var(--btn-font);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  img {
    width: 20px;
    height: 20px;
    opacity: .72;
  }
}

.page-full {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
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

@media (max-width: 580px) {
  .index-page {
    padding-top: 26px;
  }

  .hero-copy {
    margin-top: 42px;
  }

  .create-panel {
    grid-template-columns: 1fr;
  }

  .feature-grid {
    grid-template-columns: 1fr;

    div {
      min-height: 0;
    }
  }
}
</style>
