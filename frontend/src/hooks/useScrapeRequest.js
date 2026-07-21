import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

const REF = doc(db, 'system', 'scrapeStatus')

/**
 * 自動取得の実行状況（読み取り専用・プラットフォーム別）。
 *
 * 楽天はオフィスPCのタスクスケジューラ、YahooはGitHub Actionsが実行する。
 * scraper/main.py が開始時にrunning・終了時にdone/errorを、
 * system/scrapeStatus の { rakuten:{...}, yahoo:{...} } に書き込むので、
 * ここではそれを購読して表示するだけ。
 *
 * status === undefined … 初期ロード中
 * status === {}         … まだ一度も実行記録がない
 * status.rakuten / status.yahoo … 各プラットフォームの {status, startedAt, completedAt, message}
 */
export function useScrapeRequest() {
  const [status, setStatus] = useState(undefined)

  useEffect(() => {
    const unsub = onSnapshot(REF, snap => {
      setStatus(snap.exists() ? snap.data() : {})
    })
    return unsub
  }, [])

  return { status }
}
