import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, writeBatch, updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore'

const normText = s => (s || '').replace(/\s+/g, ' ').trim()
import { db } from '../lib/firebase'

export function useKeywords() {
  const [keywords, setKeywords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'keywords'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setKeywords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error('[useKeywords] Firestore エラー:', err.code, err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  const addKeyword = async (text, productIds = []) => {
    const trimmed = text.trim()
    if (!trimmed) return
    await addDoc(collection(db, 'keywords'), {
      text: trimmed,
      active: true,
      productIds,
      createdAt: serverTimestamp(),
    })
  }

  const addKeywordsBatch = async (texts) => {
    const unique = [...new Set(texts.map(t => t.trim()).filter(Boolean))]
    const existing = new Set(keywords.map(k => k.text))
    const newOnes = unique.filter(t => !existing.has(t))

    const batch = writeBatch(db)
    newOnes.forEach(text => {
      const ref = doc(collection(db, 'keywords'))
      batch.set(ref, { text, active: true, createdAt: serverTimestamp() })
    })
    await batch.commit()
    return { added: newOnes.length, skipped: unique.length - newOnes.length }
  }

  const removeKeyword = async (id) => {
    await deleteDoc(doc(db, 'keywords', id))
  }

  const updateKeyword = async (id, data) => {
    await updateDoc(doc(db, 'keywords', id), data)
  }

  /** 同じ文字列のキーワード（空白の違いは無視）を返す。 */
  const findByText = (text) => {
    const t = normText(text)
    return keywords.find(k => normText(k.text) === t) || null
  }

  /**
   * 商品にキーワードを紐づける（商品マスタ・ダッシュボードから）。
   * 同じ文字列のキーワードがあればそれに商品を追加、無ければ新規作成する。
   * 戻り値: { keyword, created }
   */
  const addKeywordToProduct = async (text, productId) => {
    const t = normText(text)
    if (!t) return null
    const existing = findByText(t)
    if (existing) {
      if (!(existing.productIds || []).includes(productId)) {
        await updateDoc(doc(db, 'keywords', existing.id), { productIds: arrayUnion(productId) })
      }
      return { keyword: existing, created: false }
    }
    const ref = await addDoc(collection(db, 'keywords'), {
      text: t,
      active: true,
      productIds: [productId],
      createdAt: serverTimestamp(),
    })
    return { keyword: { id: ref.id, text: t, productIds: [productId] }, created: true }
  }

  /**
   * 商品からキーワードを外す。外した結果どの商品にも紐づかなくなったら、
   * 「紐づけなしキーワード」として全店舗検索に回らないよう、キーワード自体を削除する。
   * 戻り値: 'unlinked' | 'deleted'
   */
  const unlinkKeyword = async (keywordId, productId) => {
    const kw = keywords.find(k => k.id === keywordId)
    const rest = (kw?.productIds || []).filter(id => id !== productId)
    if (rest.length === 0) {
      await deleteDoc(doc(db, 'keywords', keywordId))
      return 'deleted'
    }
    await updateDoc(doc(db, 'keywords', keywordId), { productIds: arrayRemove(productId) })
    return 'unlinked'
  }

  return {
    keywords, loading,
    addKeyword, addKeywordsBatch, removeKeyword, updateKeyword,
    findByText, addKeywordToProduct, unlinkKeyword,
  }
}
