import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

// Firebase の認証は内部的にメール形式のIDを要求するため、
// 「annekor」のようなメールでないIDには固定ドメインを補ってメール形式にする。
// 利用者からはこのドメインは見えず、画面では「annekor」とだけ入力すればよい。
// アカウントも Firebase コンソールで annekor@annekor.local として作成する。
const ID_DOMAIN = 'annekor.local'

/** 「annekor」→「annekor@annekor.local」に正規化する。既に@を含む場合はそのまま扱う。 */
function toEmail(id) {
  const v = id.trim()
  return v.includes('@') ? v : `${v}@${ID_DOMAIN}`
}

/**
 * ログイン状態を管理する。
 *
 * ログインできるアカウントは Firebase Authentication に登録済みのものだけ。
 * アカウントの追加は Firebase コンソールで行う（このアプリからは新規登録できない）。
 *
 * user === undefined … 判定中（初回ロード）
 * user === null      … 未ログイン
 * user === {...}     … ログイン済み
 */
export function useAuth() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u ?? null))
  }, [])

  const login = (id, password) =>
    signInWithEmailAndPassword(auth, toEmail(id), password)

  const logout = () => signOut(auth)

  return { user, login, logout }
}
