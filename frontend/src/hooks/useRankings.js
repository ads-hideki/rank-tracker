import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, limit,
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
