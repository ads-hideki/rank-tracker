import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error('[useProducts] Firestore エラー:', err.code, err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  const addProduct = async ({ name, sku, storeItems }) => {
    const ref = await addDoc(collection(db, 'products'), {
      name: name.trim(),
      sku: sku.trim(),
      storeItems,
      active: true,
      createdAt: serverTimestamp(),
    })
    return ref.id
  }

  const removeProduct = async (id) => {
    await deleteDoc(doc(db, 'products', id))
  }

  const updateProduct = async (id, data) => {
    await updateDoc(doc(db, 'products', id), data)
  }

  return { products, loading, addProduct, removeProduct, updateProduct }
}
