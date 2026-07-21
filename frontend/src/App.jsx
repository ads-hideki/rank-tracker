import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './components/Login'
import { useAuth } from './hooks/useAuth'

const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Keywords       = lazy(() => import('./pages/Keywords'))
const Rankings       = lazy(() => import('./pages/Rankings'))
const Products       = lazy(() => import('./pages/Products'))
const ProductRankings = lazy(() => import('./pages/ProductRankings'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      読み込み中...
    </div>
  )
}

function FullLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
      読み込み中...
    </div>
  )
}

export default function App() {
  const { user, login, logout } = useAuth()

  // 認証判定中
  if (user === undefined) return <FullLoader />

  // 未ログイン
  if (!user) return <Login onLogin={login} />

  // ログイン済み
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Layout user={user} onLogout={logout} />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"        element={<Dashboard />} />
            <Route path="keywords"         element={<Keywords />} />
            <Route path="rankings"         element={<Rankings />} />
            <Route path="products"         element={<Products />} />
            <Route path="product-rankings" element={<ProductRankings />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
