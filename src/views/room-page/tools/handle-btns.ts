import { computed, Ref } from "vue"
import cui from "../../../components/custom-ui"
import { usePwaDisplayMode } from "../../../hooks/usePwaDisplayMode"
import { PageData, PageParticipant, PageState } from "../../../type/type-room-page"
import ptApi from "../../../utils/pt-api"
import { enterRoom } from "./useRoomPage"

export function initBtns(
  state: Ref<PageState>,
  pageData: PageData,
  toHome: () => void,
  toContact: () => void,
  toEditMyName: (newName: string) => void,
) {
  const { displayMode } = usePwaDisplayMode()
  const btnText = computed(() => {
    const v = state.value
    if(v < 11) return ""
    if(v === 11 || v === 12 || v === 14 || v === 15) return "回到首页"
    if(v === 13 || v === 16 || v === 17 || v === 18 || v === 19) return "重新进入"
    return "重新尝试"
  })

  const btnText2 = computed(() => {
    const v = state.value
    if (v === 13 || v === 18 || v === 19 || v === 20) return "联系支持"
    return ""
  })

  const h1 = computed(() => {
    const v = state.value
    if(v <= 10) return ""
    if(v === 11) return "链接已过期"
    if(v === 12) return "查无此房间"
    if(v === 13) return "网络不佳"
    if(v === 14) return "拒绝访问"
    if(v === 15) return "房间人数已满"
    if(v === 16) return "长时间未操作"
    if(v === 17) return "已离开房间"
    if(v === 18) return "连接异常"
    if(v === 19) return "未知异常"
    return "未知错误"
  })

  const pText = computed(() => {
    const v = state.value
    const network = `请检查网络状态；\n如果重新尝试仍无改善，请联系支持。`
    const idle = `已超过 5 分钟未操作。\n请重新进入房间。`
    const disconnected = `你的连接似乎已断开。`
    const unknown = `当前浏览器连接状态异常，建议关闭页面后重新打开。`

    if(v <= 10) return ""
    if(v === 13 || v === 20) return network
    if(v === 17) return idle
    if(v === 18) return disconnected
    if(v === 19) return unknown
    return ""
  })

  const onTapBtn = () => {
    const s = state.value
    if (s === 11 || s === 12 || s === 14 || s === 15) {
      toHome()
    }
    else {
      enterRoom()
    }
  }

  const onTapBtn2 = () => {
    toContact()
  }

  const onTapLeave = async () => {
    const res = await cui.showModal({
      title: "离开房间",
      content: "确定要离开当前收听房间吗？"
    })
    if(res.confirm) {
      toHome()
    }
  }

  const getShareData = (): ShareData => {
    const c = pageData.content
    const url = location.href
    return {
      title: c?.seriesName ? `邀请你加入《${c.seriesName}》同步收听` : "邀请你加入同步收听房间",
      text: c?.title ? c.title : "打开链接即可进入同步收听房间。",
      url,
    }
  }

  const onTapShare = () => {
    const cha = ptApi.getCharacteristic()
    const v = displayMode.value
    const shareData = getShareData()

    if(ptApi.canShare(shareData)) {
      ptApi.share(shareData)
      return
    }

    if(cha.isPC || v === "standalone") {
      const url = location.href
      ptApi.copyToClipboard(url)
      cui.showModal({
        title: "房间链接已复制",
        content: "可以发送给需要加入同步收听的人。",
        showCancel: false
      })
      return
    }
    cui.showModal({
      title: "分享房间",
      content: "请使用浏览器或系统自带的分享功能发送当前房间链接。",
      showCancel: false
    })
  }

  const onTapEditMyName = async (e: PageParticipant) => {
    if(!e.isMe) return
    const res = await cui.showTextEditor({
      title: "修改昵称",
      value: e.nickName,
      placeholder: "请输入昵称"
    })
    if(res.confirm && res.value) {
      if(res.value !== e.nickName) toEditMyName(res.value)
    }
  }

  return {
    btnText,
    btnText2,
    h1,
    pText,
    onTapBtn,
    onTapBtn2,
    onTapLeave,
    onTapShare,
    onTapEditMyName,
  }
}
