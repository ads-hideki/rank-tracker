import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, limit, documentId,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

// JST ローカル日付を YYYY-MM-DD で返す
// toISOString() は UTC 基準のため、日本時間 9時前は前日になってしまう
export function localDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function useProductRankings(productId) {
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!productId) {
      setRankings([])
      setLoading(false)
      return
    }

    // orderBy + where の複合インデックスが未デプロイのため、
    // Firestore側は単一フィールド等値フィルターのみ。日付フィルター・ソートはクライアントで行う。
    const q = query(
      collection(db, 'rankings'),
      where('productId', '==', productId),
      limit(2000),
    )

    const unsub = onSnapshot(
      q,
      snap => {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 30)
        const cutoffStr = localDateString(cutoff)

        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => r.date >= cutoffStr)
          .sort((a, b) => b.date.localeCompare(a.date))

        setRankings(docs)
        setLoading(false)
        setError(null)
      },
      err => {
        console.error('useProductRankings:', err)
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [productId])

  return { rankings, loading, error }
}

// キーワード×全店舗の順位推移（グラフ用）
export function useKeywordHistory(keywordId, days = 30) {
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!keywordId) {
      setRankings([])
      setLoading(false)
      return
    }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = localDateString(cutoff)

    const q = query(
      collection(db, 'rankings'),
      where('keywordId', '==', keywordId),
      where('date', '>=', cutoffStr),
      orderBy('date', 'asc'),
    )
    const unsub = onSnapshot(
      q,
      snap => {
        setRankings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error('useKeywordHistory:', err)
        setLoading(false)
      },
    )
    return unsub
  }, [keywordId, days])

  return { rankings, loading }
}

// 当日＋前日取得（ダッシュボード用）
// in クエリで2日分を1クエリで取得 → RankTable の前日比算出に必要
export function useTodayRankings() {
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = localDateString()
    const yesterday = localDateString(new Date(Date.now() - 86_400_000))
    const q = query(
      collection(db, 'rankings'),
      where('date', 'in', [today, yesterday]),
    )
    const unsub = onSnapshot(
      q,
      snap => {
        setRankings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error('useTodayRankings:', err)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { rankings, loading }
}

// 本日〜7日前の8日分（ダッシュボードの順位一覧用）
//
// 以前は rankings（1件1ドキュメント）を date in [8日分] で読んでいたが、
// 1回の表示で 3,000〜4,000 ドキュメントの読み取りになり、Firestore 無料枠（5万/日）を使い切った。
// 今は scraper/main.py が毎日 daily/{date} に全結果を1ドキュメントへまとめて書くので、
// それを 8 件読むだけにしている（キーの形式は firebase_client.daily_key と同じ "keywordId|storeId|productId"）。
// dates は新しい順（[0] が本日）。
export function useDashboardRankings(days = 8) {
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)
  const dates = Array.from({ length: days }, (_, i) =>
    localDateString(new Date(Date.now() - i * 86_400_000)),
  )
  const key = dates.join(',')

  useEffect(() => {
    const q = query(
      collection(db, 'daily'),
      where(documentId(), 'in', dates),
    )
    const unsub = onSnapshot(
      q,
      snap => {
        const rows = []
        for (const d of snap.docs) {
          const { date, entries } = d.data()
          for (const [k, rank] of Object.entries(entries || {})) {
            const [keywordId, storeId, productId] = k.split('|')
            rows.push({ id: `${date}_${k}`, date, keywordId, storeId, productId: productId || undefined, rank: rank ?? null })
          }
        }
        setRankings(rows)
        setLoading(false)
      },
      err => {
        console.error('useDashboardRankings:', err)
        setLoading(false)
      },
    )
    return unsub
    // dates は毎レンダー新しい配列になるので、文字列化した key を依存にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { rankings, dates, loading }
}

// 直近の最新順位一覧（ダッシュボードテーブル・Rankings ページ用）
// 取得窓を4日に絞ることで読み込み doc 数を削減
export function useLatestRankings() {
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 4)
    const cutoffStr = localDateString(cutoff)

    const q = query(
      collection(db, 'rankings'),
      where('date', '>=', cutoffStr),
      orderBy('date', 'desc'),
      limit(500),
    )
    const unsub = onSnapshot(
      q,
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // keywordId+storeId ごとに最新2件（今日・前日比算出用）
        const buckets = {}
        for (const r of all) {
          const key = `${r.keywordId}_${r.storeId}`
          if (!buckets[key]) buckets[key] = []
          if (buckets[key].length < 2) buckets[key].push(r)
        }
        setRankings(Object.values(buckets).flat())
        setLoading(false)
      },
      err => {
        console.error('useLatestRankings:', err)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { rankings, loading }
}
