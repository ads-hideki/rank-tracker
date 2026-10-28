/**
 * 自動取得の実行状況（楽天 / Yahoo 別）の表示部品。
 * データは system/scrapeStatus（scraper/main.py が書く）。設定ページで使う。
 */

/** Firestore Timestamp を「7月21日 10:38」形式に整形する。当日なら時刻のみ。 */
function formatStamp(ts) {
  const d = ts?.toDate?.()
  if (!d) return null

  const time = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  const isToday = d.toDateString() === new Date().toDateString()
  if (isToday) return time

  const day = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  return `${day} ${time}`
}

/** 楽天 / Yahoo それぞれのステータスを1枠で表示する。 */
export function PlatformStatus({ title, place, request }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-[11px] text-gray-400">{place}</span>
      </div>
      <ScrapeStatus request={request} />
    </div>
  )
}

export function ScrapeStatus({ request }) {
  if (request === undefined) {
    return <div className="h-5 w-40 bg-gray-100 animate-pulse rounded" />
  }
  if (!request) {
    return <span className="text-sm text-gray-400">実行記録がありません</span>
  }

  const { status, startedAt, completedAt, message } = request

  // 実行中（main.py が開始時に書き込む）
  if (status === 'running') {
    const started = formatStamp(startedAt)
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-blue-600">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        実行中{started && <span className="font-normal text-gray-500">（{started} 開始）</span>}
        {message && <span className="font-normal text-xs text-gray-500">{message}</span>}
      </span>
    )
  }

  // 完了
  if (status === 'done') {
    const done = formatStamp(completedAt)
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-green-700">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          {done ? `${done} 完了` : '完了'}
        </span>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    )
  }

  // エラー
  if (status === 'error') {
    const failed = formatStamp(completedAt)
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-red-600">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          {failed ? `${failed} エラー` : 'エラー'}
        </span>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    )
  }

  // pending は廃止した手動実行ボタンの名残。実行されることはない
  if (status === 'pending') {
    return <span className="text-sm text-gray-400">待機中（手動実行は廃止されました）</span>
  }

  return <span className="text-sm text-gray-400">状態不明</span>
}
