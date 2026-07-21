import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

const REF = doc(db, 'system', 'scrapeRequest')

/**
 * 自動取得の実行状況（読み取り専用）。
 *
 * 順位取得は PC のタスクスケジューラが毎日 10:00 に実行する。
 * scraper/main.py が開始時に running、終了時に done / error を書き込むので、
 * ここではそれを購読して表示するだけ。
 *
 * 以前あった「今すぐ順位取得」ボタン（status を pending にして
 * watcher.py に拾わせる仕組み）は廃止した。
 */
export function useScrapeRequest() {
  const [request, setRequest] = useState(undefined) // undefined = 初期ロード中

  useEffect(() => {
    const unsub = onSnapshot(REF, snap => {
      setRequest(snap.exists() ? snap.data() : null)
    })
    return unsub
  }, [])

  return { request }
}
