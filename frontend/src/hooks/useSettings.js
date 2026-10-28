import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { DEFAULT_LIMITS } from '../lib/limits'

const REF = doc(db, 'system', 'settings')

/**
 * 登録上限などの設定（system/settings）。
 * ドキュメントが無い間は DEFAULT_LIMITS を使う。
 * 変更はダッシュボードの「取得設定」から（ログイン済みのみ書き込める）。
 * スクレイパー側（scraper/firebase_client.py get_settings）も同じドキュメントを読む。
 */
export function useSettings() {
  const [limits, setLimits] = useState(DEFAULT_LIMITS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    return onSnapshot(REF, snap => {
      setLimits({ ...DEFAULT_LIMITS, ...(snap.exists() ? snap.data() : {}) })
      setLoaded(true)
    })
  }, [])

  const updateLimits = async (partial) => {
    await setDoc(REF, partial, { merge: true })
  }

  return { limits, loaded, updateLimits }
}
