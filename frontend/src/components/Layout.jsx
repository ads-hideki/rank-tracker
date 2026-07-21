import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'

const NAV = [
  { to: '/dashboard',        icon: '◈', label: 'ダッシュボード' },
  { to: '/keywords',         icon: '✦', label: 'キーワード管理' },
  { to: '/rankings',         icon: '▲', label: '順位詳細' },
  { to: '/products',         icon: '□', label: '商品マスタ' },
  { to: '/product-rankings', icon: '▶', label: '商品別順位' },
]

export default function Layout({ user, onLogout }) {
  const [open, setOpen] = useState(false)

  // 内部ドメイン（annekor@annekor.local）は隠してID部分だけ表示する
  const displayId = user?.email?.replace(/@annekor\.local$/, '')

  return (
    <div className="flex h-screen bg-gray-50 font-sans">

      {/* モバイル：サイドバー開時の背景オーバーレイ */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* サイドバー */}
      <aside className={[
        'fixed md:static inset-y-0 left-0 z-30',
        'w-52 bg-white border-r border-gray-200 flex flex-col shrink-0',
        'transition-transform duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}>
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="logo" className="w-8 h-8 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 font-medium tracking-wider uppercase leading-none">Rank Tracker</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5 leading-none">検索順位管理</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-100 space-y-2">
          {displayId && (
            <p className="text-xs text-gray-400 truncate" title={displayId}>
              {displayId} でログイン中
            </p>
          )}
          <button
            onClick={onLogout}
            className="w-full text-left text-xs font-medium text-gray-500 hover:text-red-600 transition-colors"
          >
            ログアウト
          </button>
          <p className="text-xs text-gray-300 pt-1">annekor / annekor22 / Yahoo annekor</p>
        </div>
      </aside>

      {/* コンテンツエリア */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* モバイル：トップバー */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="メニューを開く"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="logo" className="w-6 h-6" />
            <span className="text-sm font-bold text-gray-800">検索順位管理</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
