import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, writeBatch, updateDoc,
} from 'firebase/firestore'
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

  return { keywords, loading, addKeyword, addKeywordsBatch, removeKeyword, updateKeyword }
}
