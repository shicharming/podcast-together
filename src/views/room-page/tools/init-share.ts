import share from "../../../utils/share"
import { ContentData } from "../../../type"

export const shareData = (c: ContentData | undefined, playStatus: string, nickName: string) => {
  const seriesName = c?.seriesName
  const title = c?.title
  const imageUrl = c?.imageUrl
  const frdTitle = seriesName ? `${nickName} 邀请你加入《${seriesName}》同步收听` : `${nickName} 邀请你加入同步收听房间`
  const pyqTitle = title ? `${nickName} 邀请你同步收听 ${title}` : `${nickName} 邀请你加入同步收听房间`
  const desc = title ? title : "打开链接即可进入同步收听房间。"
  share.configShare({
    title: title || "Sunny Together",
    desc,
    imageUrl,
    wxShare: {
      frdTitle,
      frdDesc: desc,
      pyqTitle,
      frdImgUrl: imageUrl,
      pyqImgUrl: imageUrl,
    }
  })
}
