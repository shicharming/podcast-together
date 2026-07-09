import share from "../../../utils/share"
import { ContentData } from "../../../type"

export const shareData = (c: ContentData, playStatus: string, nickName: string) => {
  const frdTitle = c.seriesName ? `${nickName} 邀请你加入《${c.seriesName}》同步收听` : `${nickName} 邀请你加入同步收听房间`
  const pyqTitle = c.title ? `${nickName} 邀请你同步收听 ${c.title}` : `${nickName} 邀请你加入同步收听房间`
  const desc = c.title ? c.title : "打开链接即可进入同步收听房间。"
  share.configShare({
    title: c.title || "Sunny Together",
    desc,
    imageUrl: c.imageUrl,
    wxShare: {
      frdTitle,
      frdDesc: desc,
      pyqTitle,
      frdImgUrl: c.imageUrl,
      pyqImgUrl: c.imageUrl,
    }
  })
}
