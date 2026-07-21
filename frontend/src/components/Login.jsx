import { useState } from 'react'

/** Firebase の認証エラーコードを日本語メッセージに変換する。 */
function errorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。'
    case 'auth/user-disabled':
      return 'このアカウントは無効化されています。'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'IDまたはパスワードが違います。'
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待って再度お試しください。'
    case 'auth/network-request-failed':
      return 'ネットワークに接続できません。'
    default:
      return 'ログインに失敗しました。'
  }
}

export default function Login({ onLogin }) {
  const [id, setId]             = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onLogin(id, password)
      // 成功時は onAuthStateChanged が画面を切り替えるので、ここでは何もしない
    } catch (err) {
      setError(errorMessage(err?.code))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg" alt="logo" className="w-12 h-12 mb-3" />
          <p className="text-xs text-gray-400 font-medium tracking-wider uppercase">Rank Tracker</p>
          <h1 className="text-lg font-bold text-gray-800 mt-1">検索順位管理</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">ID</label>
            <input
              type="text"
              autoComplete="username"
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="annekor"
              required
              disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">パスワード</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
