import util from "../util"
import wx from "weixin-js-sdk-ts"
import rq from "../../request"
import images from "../../images"
import { WxConfig, WxShare, ShareCfgData, ShareWay } from "../../type/type-share"
import ptApi from "../pt-api"

let hasConfigWxJsSDK = false

const _configWxJsSDK = (): Promise<boolean> => {
  if(hasConfigWxJsSDK) return util.getPromise(true)
  const { isWeChat } = ptApi.getCharacteristic()
  if(!isWeChat) {
    return util.getPromise(true)
  }

  const _env = util.getEnv()
  const url = _env.THIRD_PARTY_SETTING_URL
  if(!url) return util.getPromise(true)

  const body1 = {
    operateType: "WX_JS_SDK_CONFIG",
    webUrl: location.href
  }

  const _handle = async (a: (a1: boolean) => void): Promise<void> => {
    const res1 = await rq.request<WxConfig>(url, body1)
    const { data } = res1
    if(!data) {
      a(false)
      return
    }

    const jsApiList: wx.ApiMethod[] = ["updateAppMessageShareData", "updateTimelineShareData"]
    const data2 = {
      ...data,
      jsApiList,
      openTagList: []
    }

    wx.config(data2)
    wx.ready(() => {
      hasConfigWxJsSDK = true
      a(true)
    })
    wx.error(() => {
      a(false)
    })
    setTimeout(() => {
      a(false)
    }, 2000)
  }

  return new Promise(_handle)
}

const _setBasic = (title?: string, desc?: string, iconUrl?: string, shareWay?: ShareWay) => {
  if(title) {
    if(shareWay === "all" || shareWay === "inner") document.title = title
    if(shareWay === "all" || shareWay === "outside") {
      const twitter_title = document.querySelector(`head > meta[name="twitter:title"]`)
      const og_title = document.querySelector(`head > meta[property="og:title"]`)
      twitter_title?.setAttribute("content", title)
      og_title?.setAttribute("content", title)
    }
  }
  if(desc !== undefined) {
    const descEl = document.querySelector(`head > meta[name="description"]`)
    const twitter_desc = document.querySelector(`head > meta[name="twitter:description"]`)
    const og_desc = document.querySelector(`head > meta[property="og:description"]`)
    if(shareWay === "all" || shareWay === "inner") descEl?.setAttribute("content", desc)
    if(shareWay === "all" || shareWay === "outside") {
      twitter_desc?.setAttribute("content", desc)
      og_desc?.setAttribute("content", desc)
    }
  }
  if(iconUrl) {
    const iconEl = document.querySelector(`head > link[rel="icon"]`)
    const twitter_image = document.querySelector(`head > meta[name="twitter:image"]`)
    const og_image = document.querySelector(`head > meta[property="og:image"]`)
    if(shareWay === "all" || shareWay === "inner") iconEl?.setAttribute("href", iconUrl)
    if(shareWay === "all" || shareWay === "outside") {
      twitter_image?.setAttribute("content", iconUrl)
      og_image?.setAttribute("content", iconUrl)
    }
  }
}

const _setWeChat = (wxShare: WxShare) => {
  if(!hasConfigWxJsSDK) return
  const {
    frdTitle,
    frdDesc = "邀请你加入同步收听房间",
    frdImgUrl = images.APP_LOGO_COS,
    pyqTitle,
    pyqImgUrl = images.APP_LOGO_COS,
    link = location.origin
  } = wxShare

  wx.updateAppMessageShareData({
    title: frdTitle,
    desc: frdDesc,
    imgUrl: frdImgUrl,
    link,
    success() {},
    cancel() {}
  })
  wx.updateTimelineShareData({
    title: pyqTitle,
    imgUrl: pyqImgUrl,
    link,
    success() {},
    cancel() {}
  })
}

const _reset = () => {
  const title = "Sunny Together - 远程同步收听空间"
  const desc = "创建可分享的同步收听房间，一起播放、暂停、回应和记录时间点。"
  const iconUrl = images.FAVI_ICON
  _setBasic(title, desc, iconUrl, "all")
  _setWeChat({ frdTitle: title, pyqTitle: title })
}

const configShare = async (opt?: ShareCfgData): Promise<void> => {
  await _configWxJsSDK()

  if(!opt) {
    _reset()
    return
  }
  const { title, desc, imageUrl, shareWay = "all" } = opt
  _setBasic(title, desc, imageUrl, shareWay)
  if(opt.wxShare) _setWeChat(opt.wxShare)
}

export default {
  configShare
}
