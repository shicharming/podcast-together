<script setup lang="ts">
import images from '../../images';
import { useContactPage } from './tools/useContactPage';

const {
  onTapEmail,
  onTapClosePreview,
  imgData,
} = useContactPage()

const doNothing = (e: Event) => {
  e.stopPropagation()
}
</script>

<template>
<main class="contact-page">
  <section class="contact-shell">
    <p class="eyebrow">Contact</p>
    <h1>商务联系</h1>
    <p class="intro">
      欢迎联系我讨论产品合作、内容共听场景和定制部署需求。
    </p>

    <button class="contact-item" @click="onTapEmail">
      <div class="div-bg-img ci-img ci-img_email"></div>
      <div class="ci-text">
        <span>邮件</span>
        <strong>适合正式合作与需求说明</strong>
      </div>
    </button>

    <a class="contact-item" href="https://jiaminshi.com" target="_blank">
      <div class="site-mark">JS</div>
      <div class="ci-text">
        <span>主站</span>
        <strong>了解更多项目与背景</strong>
      </div>
    </a>
  </section>
</main>

<div class="preview-container"
  :class="{ 'preview-container_show': imgData.show }"
  @click="onTapClosePreview"
>
  <div class="preview-box" @click="doNothing">
    <div class="pb-img-box">
      <img :src="imgData.imgUrl" class="preview-img" />
    </div>
    <p v-if="imgData.tip" class="preview-p">{{ imgData.tip }}</p>
  </div>
</div>
</template>

<style scoped lang="scss">
.contact-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 68px 20px 34px;
  display: flex;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(233, 239, 244, .5) 100%),
    var(--bg-color);
}

.contact-shell {
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
  margin: 18px 0 34px;
  color: var(--desc-color);
  font-size: 16px;
  line-height: 1.8;
}

.contact-item {
  width: 100%;
  min-height: 112px;
  box-sizing: border-box;
  padding: 18px;
  margin-bottom: 12px;
  border: 1px solid var(--line-color);
  border-radius: 8px;
  background-color: var(--card-color);
  display: flex;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, background-color .15s, transform .15s;

  &:hover,
  &:active {
    border-color: var(--accent-color);
    background-color: var(--other-btn-hover);
  }

  .ci-img {
    width: 46px;
    height: 46px;
    margin-right: 18px;
    flex-shrink: 0;

    &.ci-img_email {
      background-size: 90% 90%;
      background-image: v-bind("'url(' + images.OUTLOOK + ')'");
    }
  }

  .ci-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ci-text span {
    color: var(--text-color);
    font-size: 18px;
    font-weight: 800;
  }

  .ci-text strong {
    color: var(--note-color);
    font-size: 14px;
    font-weight: 600;
  }
}

.site-mark {
  width: 46px;
  height: 46px;
  margin-right: 18px;
  flex-shrink: 0;
  border-radius: 8px;
  background-color: var(--main-btn-bg);
  color: var(--main-btn-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: .04em;
}

.preview-container {
  width: 100vw;
  height: 100vh;
  z-index: 1500;
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 0;
  left: 0;
  transition: all 0.3s;
  opacity: 0;
  visibility: hidden;
  background-color: rgba(10, 20, 28, .78);
}

.preview-container_show {
  opacity: 1;
  visibility: visible;
}

.preview-box {
  width: 70%;
  max-width: 250px;
  padding: 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--bg-color);
  position: relative;

  .pb-img-box {
    width: 100%;
    padding-bottom: 100%;
    position: relative;

    .preview-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
  }

  .preview-p {
    text-align: center;
    margin-block-start: 15px;
    margin-block-end: 0;
    font-size: var(--desc-font);
    color: var(--note-color);
  }
}
</style>
