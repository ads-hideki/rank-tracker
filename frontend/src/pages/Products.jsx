import { useState, useRef } from 'react'
import { useProducts } from '../hooks/useProducts'
import { useKeywords } from '../hooks/useKeywords'
import { STORES } from '../lib/stores'

const emptyStoreItems = () => Object.fromEntries(STORES.map(s => [s.id, '']))

export default function Products() {
  const { products, loading, addProduct, removeProduct } = useProducts()
  const { keywords, updateKeyword } = useKeywords()
  const [form, setForm] = useState({ name: '', sku: '', storeItems: emptyStoreItems() })
  const [selectedKeywordIds, setSelectedKeywordIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState(null)
  const nameRef = useRef()

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const toggleKeyword = (id) => {
    setSelectedKeywordIds(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setAdding(true)
    try {
      const added = form.name.trim()
      const newProductId = await addProduct(form)
      if (selectedKeywordIds.length > 0) {
        await Promise.all(
          selectedKeywordIds.map(kwId => {
            const kw = keywords.find(k => k.id === kwId)
            const currentIds = kw?.productIds || []
            if (currentIds.includes(newProductId)) return Promise.resolve()
            return updateKeyword(kwId, { productIds: [...currentIds, newProductId] })
          })
        )
      }
      setForm({ name: '', sku: '', storeItems: emptyStoreItems() })
      setSelectedKeywordIds([])
      showToast(`「${added}」を追加しました`)
      nameRef.current?.focus()
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (p) => {
    if (!window.confirm(`「${p.name}」を削除しますか？`)) return
    await removeProduct(p.id)
    showToast(`「${p.name}」を削除しました`, 'info')
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <h2 className="text-lg font-bold text-gray-900 mb-6">商品マスタ管理</h2>

      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">新規登録</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                商品名 <span className="text-red-400">*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例：美容液 50ml"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SKU（管理用ID）</label>
              <input
                type="text"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="例：SK-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-3">
              店舗別 商品コード
              <span className="text-gray-400 font-normal ml-1">（店舗ごとに異なるコードを入力・未設定は空欄）</span>
            </p>
            <div className="space-y-3">
              {STORES.map(s => {
                const urlHint = s.platform === 'rakuten'
                  ? `item.rakuten.co.jp/${s.urlId}/【コード】/`
                  : `store.shopping.yahoo.co.jp/${s.urlId}/【コード】.html`
                const placeholder = s.platform === 'rakuten' ? '例: ads-007' : '例: ads007'
                return (
                  <div key={s.id} className="flex items-start gap-3">
                    <span className="text-xs font-medium text-gray-600 w-32 shrink-0 pt-2">{s.label}</span>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={form.storeItems[s.id] || ''}
                        onChange={e => setForm(f => ({
                          ...f,
                          storeItems: { ...f.storeItems, [s.id]: e.target.value },
                        }))}
                        placeholder={placeholder}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-400 mt-1 font-mono">{urlHint}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {keywords.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                紐づけるキーワード
                <span className="text-gray-400 font-normal ml-1">（任意・複数選択可）</span>
              </p>
              <div className="flex flex-wrap gap-3 max-h-32 overflow-y-auto">
                {keywords.map(kw => (
                  <label key={kw.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedKeywordIds.includes(kw.id)}
                      onChange={() => toggleKeyword(kw.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{kw.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding || !form.name.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              追加
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">登録済み商品</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{products.length}件</span>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">読み込み中...</p>
        ) : products.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">まだ登録されていません</p>
        ) : (
          <>
            {/* モバイル：カード表示 */}
            <ul className="md:hidden divide-y divide-gray-100">
              {products.map(p => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      {p.sku && (
                        <p className="text-xs text-gray-400 mt-0.5">SKU: {p.sku}</p>
                      )}
                      <div className="mt-1.5 space-y-0.5">
                        {STORES.map(s => {
                          const code = p.storeItems?.[s.id]
                          return code ? (
                            <p key={s.id} className="text-xs text-gray-500">
                              <span className="text-gray-400">{s.label}:</span>{' '}
                              <span className="font-mono">{code}</span>
                            </p>
                          ) : null
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(p)}
                      className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* デスクトップ：テーブル表示 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">商品名</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">SKU</th>
                    {STORES.map(s => (
                      <th key={s.id} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                        {s.label}<br />
                        <span className="font-normal text-gray-400">商品コード</span>
                      </th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku || '-'}</td>
                      {STORES.map(s => (
                        <td key={s.id} className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {p.storeItems?.[s.id] || <span className="text-gray-300">-</span>}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemove(p)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
