import { computed } from "vue"

export type AppLocale = "zh" | "ja" | "en"

const detectLocale = (): AppLocale => {
  const lang = (navigator.language || "").toLowerCase()
  if(lang.startsWith("ja")) return "ja"
  if(lang.startsWith("zh")) return "zh"
  return "en"
}

export const locale = detectLocale()

export const useLocale = () => {
  const isZh = locale === "zh"
  const isJa = locale === "ja"

  const t = computed(() => ({
    brand: "Sunny Together",
    eyebrow: isJa ? "Remote listening room" : isZh ? "Remote listening room" : "Remote listening room",
    homeTitle: isJa ? "一緒に聴く部屋を作成" : isZh ? "远程同步收听空间" : "Create a synced listening room",
    homeIntro: isJa
      ? "小宇宙、Apple Podcasts、公開 MP3 リンクを貼るだけ。再生、停止、リアクション、メモを同じ部屋で同期します。"
      : isZh
        ? "粘贴小宇宙、Apple Podcasts 或公开 mp3 链接，创建一个可分享的同步收听房间。播放、暂停、reaction 和时间点都在同一个空间里。"
        : "Paste a Xiaoyuzhou, Apple Podcasts, or public MP3 link to create a shared room with synced playback, reactions, and timestamp notes.",
    nameLabel: isJa ? "表示名" : isZh ? "你的名字" : "Your name",
    namePlaceholder: isJa ? "例：Sunny" : isZh ? "例如：Sunny" : "e.g. Sunny",
    urlLabel: isJa ? "エピソード URL" : isZh ? "单集链接" : "Episode URL",
    urlPlaceholder: "https://www.xiaoyuzhoufm.com/episode/...",
    createRoom: isJa ? "部屋を作成" : isZh ? "创建房间" : "Create room",
    installApp: isJa ? "アプリとして追加" : isZh ? "添加到桌面" : "Add to home screen",
    supported: isJa ? "対応" : isZh ? "支持" : "Supports",
    supportedLine: isJa ? "小宇宙 / Apple Podcasts JP・CA・CN / 直接 mp3" : isZh ? "小宇宙 / Apple Podcasts JP・CA・CN / 直接 mp3" : "Xiaoyuzhou / Apple Podcasts JP, CA, CN / direct MP3",
    supportedSitesTitle: isJa ? "対応リンク" : isZh ? "支持的网站 / 链接" : "Supported links",
    supportedSites: isJa
      ? ["小宇宙", "Apple Podcasts JP / CA / CN / US", "公開 Podcast ページ", "WeChat 音声記事", "一派・Podcast", "直接 mp3 / m4a", "RSS 公開字幕"]
      : isZh
        ? ["小宇宙", "Apple Podcasts JP / CA / CN / US", "公开播客网页", "微信音频文章", "一派・Podcast", "直接 mp3 / m4a", "RSS 公开字幕"]
        : ["Xiaoyuzhou", "Apple Podcasts JP / CA / CN / US", "Public podcast pages", "WeChat audio articles", "SSPAI Podcast", "Direct mp3 / m4a", "Public RSS transcripts"],
    supportedSitesNote: isJa
      ? "Spotify / Pocket Casts のアプリ内自動字幕は公開 RSS ではない場合があるため、現在は自動取得しません。"
      : isZh
        ? "Spotify / Pocket Casts 这类 App 内部自动字幕如果没有公开到 RSS，目前不会自动读取。"
        : "App-only auto transcripts from Spotify or Pocket Casts are not read unless they are published into the public RSS feed.",
    signal: isJa ? "Live sync ready" : isZh ? "Live sync ready" : "Live sync ready",
    rememberHint: isJa ? "名前はこの端末に保存され、次回は自動入力されます。" : isZh ? "名字会保存在这台设备上，下次自动带上。" : "Your name is saved on this device for next time.",
    parsing: isJa ? "解析中.." : isZh ? "解析中.." : "Parsing..",
    creating: isJa ? "部屋を作成中" : isZh ? "正在创建收听房间" : "Creating listening room",
    invalidLink: isJa ? "有効なリンクを貼ってください" : isZh ? "请粘贴有效链接" : "Paste a valid link",
    features: isJa
      ? ["ログイン不要", "再生同期", "リアクションとメモ"]
      : isZh
        ? ["无需账号加入", "播放状态同步", "reaction 与时间点"]
        : ["No account required", "Synced playback", "Reactions and notes"],
    roomReplaceAudio: isJa ? "音声を替える" : isZh ? "替换音频" : "Replace audio",
    roomReplacePlaceholder: isJa ? "新しいエピソード URL..." : isZh ? "新的单集链接..." : "New episode URL...",
    roomReplaceSubmit: isJa ? "替换" : isZh ? "替换" : "Replace",
    roomReplaceParsing: isJa ? "新しい音声を解析中.." : isZh ? "正在解析新音频.." : "Parsing new audio..",
    roomReplaceFailed: isJa ? "音声を替えられませんでした。リンクを確認してください。" : isZh ? "替换失败，请检查链接后重试。" : "Could not replace the audio. Check the link and try again.",
    roomReplaceNotice: isJa ? "音声が更新されました" : isZh ? "音频已替换" : "Audio replaced",
    pausePrefix: isJa ? "一時停止" : isZh ? "暂停中" : "Paused",
    noteJump: isJa ? "クリックして移動" : isZh ? "点击跳到这里" : "Click to jump",
    enteringRoom: isJa ? "部屋に入っています.." : isZh ? "正在进入房间.." : "Entering room..",
    connectingPlayer: isJa ? "プレイヤーに接続しています.." : isZh ? "正在连接播放器.." : "Connecting player..",
    pauseMenu: isJa ? "一時停止…" : isZh ? "暂停…" : "Pause...",
    pauseReasons: isJa ? ["休憩", "仕事", "電話", "少し離席", "あとで再開"] : isZh ? ["厕所", "工作", "接电话", "走开一下", "稍后回来"] : ["Break", "Work", "Call", "Away", "Back soon"],
    pauseReasonWaiting: isJa ? "戻り待ち" : isZh ? "等人回来" : "Waiting",
    resumePlayback: isJa ? "再生を続ける" : isZh ? "继续播放" : "Resume",
    resumePlaybackHint: isJa ? "部屋は再生中です。タップして同期を続けてください。" : isZh ? "房间正在播放，点一下继续同步收听。" : "The room is playing. Tap once to resume.",
    inactiveHint: isJa ? "誰かが同期から外れているかもしれません。" : isZh ? "有人可能没跟上。" : "Someone may have fallen out of sync.",
    pauseAndWait: isJa ? "待つ" : isZh ? "暂停等一下" : "Pause and wait",
    keepPlaying: isJa ? "続ける" : isZh ? "继续播放" : "Keep playing",
    sessionStatus: isJa ? "集中セッション中" : isZh ? "专注计时中" : "Focus timer running",
    notePlaceholder: isJa ? "タイムスタンプを残す…" : isZh ? "记一个时间点…" : "Add a timestamp...",
    addNote: isJa ? "+ メモ" : isZh ? "＋ 打点" : "+ Note",
    notesTitle: isJa ? "タイムスタンプ" : isZh ? "时间点" : "Timestamps",
    copyAll: isJa ? "すべてコピー" : isZh ? "复制全部" : "Copy all",
    copiedNotes: isJa ? "タイムスタンプをコピーしました" : isZh ? "已复制全部时间点笔记" : "Copied all timestamps",
    subtitles: isJa ? "字幕" : isZh ? "字幕" : "Captions",
    subtitlesOn: isJa ? "字幕：オン" : isZh ? "字幕：开" : "Captions: on",
    subtitlesOff: isJa ? "字幕：オフ" : isZh ? "字幕：关" : "Captions: off",
    subtitlesLoading: isJa ? "字幕を読み込み中…" : isZh ? "正在加载字幕…" : "Loading captions...",
    subtitlesEmpty: isJa ? "公開字幕はありません" : isZh ? "暂无公开字幕" : "No public captions",
    subtitlesUntimed: isJa ? "この字幕には時間情報がありません" : isZh ? "这份字幕没有时间轴，暂不能高亮" : "This transcript has no timing data",
    listeners: isJa ? "参加中" : isZh ? "正在听的有" : "Listening now",
    manage: isJa ? "管理" : isZh ? "管理" : "Manage",
    entered: isJa ? "に入室" : isZh ? "进入" : " joined",
    leave: isJa ? "退出" : isZh ? "离开" : "Leave",
    share: isJa ? "共有" : isZh ? "分享" : "Share",
    createFocusRoom: isJa ? "集中ルームを作る（音声なし）" : isZh ? "创建专注房间（无需播客）" : "Start a focus room (no podcast)",
    tabListen: isJa ? "一緒に聴く" : isZh ? "一起听" : "Listen",
    tabStudy: isJa ? "一緒に集中" : isZh ? "一起学" : "Study",
    // ---- Study Mode (Pomodoro + todos + status) ----
    phaseFocus: isJa ? "集中" : isZh ? "专注" : "Focus",
    phaseShortBreak: isJa ? "小休憩" : isZh ? "短休息" : "Short break",
    phaseLongBreak: isJa ? "長い休憩" : isZh ? "长休息" : "Long break",
    timerStart: isJa ? "開始" : isZh ? "开始" : "Start",
    timerPause: isJa ? "一時停止" : isZh ? "暂停" : "Pause",
    timerResume: isJa ? "再開" : isZh ? "继续" : "Resume",
    timerReset: isJa ? "リセット" : isZh ? "重置" : "Reset",
    timerSettings: isJa ? "設定" : isZh ? "设置" : "Settings",
    timerSave: isJa ? "保存" : isZh ? "保存" : "Save",
    timerNextFocus: isJa ? "集中を始める" : isZh ? "开始专注" : "Start focus",
    timerNextShort: isJa ? "小休憩を始める" : isZh ? "开始短休息" : "Start short break",
    timerNextLong: isJa ? "長い休憩を始める" : isZh ? "开始长休息" : "Start long break",
    timerNextGeneric: isJa ? "次へ" : isZh ? "下一阶段" : "Next",
    timerNotifyTitle: isJa ? "ポモドーロ" : isZh ? "番茄钟" : "Pomodoro",
    timerNotifyBody: isJa
      ? "{phase}が終わりました。「{next}」で続けましょう"
      : isZh
        ? "{phase}结束啦，点「{next}」继续"
        : "{phase} finished — tap \"{next}\" to continue.",
    timerCfgFocus: isJa ? "集中" : isZh ? "专注" : "Focus",
    timerCfgShort: isJa ? "小休憩" : isZh ? "短休" : "Short",
    timerCfgLong: isJa ? "長休憩" : isZh ? "长休" : "Long",
    studyMyStatus: isJa ? "自分の状態" : isZh ? "我的状态" : "My status",
    studyMe: isJa ? "（自分）" : isZh ? "（我）" : " (me)",
    studyNoTodo: isJa ? "まだ todo がありません" : isZh ? "还没有 todo" : "No todos yet",
    studyTodoPlaceholder: isJa ? "やることを追加…" : isZh ? "加一个要做的事…" : "Add a task...",
    studyStatusWorking: isJa ? "集中中" : isZh ? "专注中" : "Working",
    studyStatusStuck: isJa ? "詰まった" : isZh ? "卡住了" : "Stuck",
    studyStatusBreak: isJa ? "休憩" : isZh ? "休息" : "Break",
    studyStatusAway: isJa ? "離席" : isZh ? "离开" : "Away",
    studyStatusDone: isJa ? "完了" : isZh ? "完成" : "Done",
  }))

  return { locale, t }
}
