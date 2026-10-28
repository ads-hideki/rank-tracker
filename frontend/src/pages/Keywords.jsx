import { useState, useRef } from 'react'
import { useKeywords } from '../hooks/useKeywords'
import { useProducts } from '../hooks/useProducts'
import { useSettings } from '../hooks/useSettings'
import {
  checkKeywordAssignment, unlinkedCapacity,
  keywordCountByProduct, unlinkedCount, estimateJobs, estimateMinutes,
} from '../lib/limits'

export default function Keywords() {
  const { keywords, loading, addKeyword, addKeywordsBatch, removeKeyword, updateKeyword } = useKeywords()
  const { products } = useProducts()
  const { limits } = useSettings()
  const [input, setInput] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editProductIds, setEditProductIds] = useState([])
  const fileRef = useRef()
  const inputRef = useRef()

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const totalJobs  = estimateJobs(keywords, products)
  const unlinked   = unlinkedCount(keywords)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), type === 'error' ? 6000 : 3500)
  }

  const toggleProduct = (id) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const check = checkKeywordAssignment({ keywords, products, limits, productIds: selectedProductIds })
    if (!check.ok) { showToast(check.reason, 'error'); return }
    setAdding(true)
    try {
      await addKeyword(input, selectedProductIds)
      const added = input.trim()
      setInput('')
      setSelectedProductIds([])
      showToast(`「${added}」を追加しました`)
      inputRef.current?.focus()
    } finally {
      setAdding(false)
    }
  }

  const handleCsv = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const { default: Papa } = await import('papaparse')
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: async ({ data }) => {
        const texts    = data.flat().map(v => String(v).trim()).filter(Boolean)
        const existing = new Set(keywords.map(k => k.text))
        const fresh    = [...new Set(texts)].filter(t => !existing.has(t))
        const capacity = unlinkedCapacity({ keywords, products, limits })
        const accepted = fresh.slice(0, capacity)
        const over     = fresh.length - accepted.length
        const result   = accepted.length > 0 ? await addKeywordsBatch(accepted) : { added: 0, skipped: 0 }
        const dup      = texts.length - fresh.length
        if (over > 0) {
          showToast(
            `${result.added}件追加、${dup}件スキップ（重複）。` +
            `紐づけなしキーワードの上限（${limits.maxUnlinkedKeywords}件）により ${over}件は登録されませんでした`,
            'error',
          )
        } else {
          showToast(`${result.added}件追加、${dup}件スキップ（重複）`)
        }
        fileRef.current.value = ''
      },
    })
  }

  const handleRemove = async (kw) => {
    if (!window.confirm(`「${kw.text}」を削除しますか？`)) return
    await removeKeyword(kw.id)
    showToast(`「${kw.text}」を削除しました`, 'info')
  }

  const startEdit = (kw) => {
    setEditingId(kw.id)
    setEditProductIds(kw.productIds || [])
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditProductIds([])
  }

  const saveEdit = async (kwId) => {
    const check = checkKeywordAssignment({ keywords, products, limits, keywordId: kwId, productIds: editProductIds })
    if (!check.ok) { showToast(check.reason, 'error'); return }
    await updateKeyword(kwId, { productIds: editProductIds })
    setEditingId(null)
    setEditProductIds([])
    showToast('商品の紐づけを更新しました')
  }

  const toggleEditProduct = (id) => {
    setEditProductIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const toastStyle = {
    success: 'bg-green-50 text-green-700 border-green-200',
    info:    'bg-blue-50 text-blue-700 border-blue-200',
    error:   'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h2 className="text-lg font-bold text-gray-900 mb-6">キーワード管理</h2>

      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${toastStyle[toast.type]}`}>
          {toast.msg}
        </div>
      )}

      {/* 登録状況（上限に対する使用量） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 mb-4 grid grid-cols-3 gap-3 text-center">
        <Usage label="想定ジョブ数" value={totalJobs} max={limits.maxTotalJobs} note={`約${estimateMinutes(totalJobs)}分`} />
        <Usage label="紐づけなし" value={unlinked} max={limits.maxUnlinkedKeywords} />
        <div>
          <p className="text-xs text-gray-500">商品あたり上限</p>
          <p className="text-lg font-bold text-gray-700">{limits.maxKeywordsPerProduct}<span className="text-xs font-normal text-gray-400 ml-0.5">個</span></p>
        </div>
      </div>

      {/* 手動追加 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">手動追加</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="例：スキンケア 美容液"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              追加
            </button>
          </div>
          {products.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                対象商品（任意・複数選択可）
                <span className="text-gray-400 font-normal ml-1">各商品 {limits.maxKeywordsPerProduct} 個まで・未選択なら紐づけなし</span>
              </p>
              <ProductPicker
                products={products}
                selected={selectedProductIds}
                onToggle={toggleProduct}
                counts={keywordCountByProduct(keywords)}
                max={limits.maxKeywordsPerProduct}
              />
            </div>
          )}
        </form>
      </div>

      {/* CSV一括登録 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">CSV一括登録</h3>
        <p className="text-xs text-gray-400 mb-3">
          A列にキーワードを1行ずつ記入したCSVをアップロード（重複は自動スキップ）。
          商品に紐づけない形で登録されるため、上限 {limits.maxUnlinkedKeywords} 件に収まる分だけ受け付けます
          （あと {unlinkedCapacity({ keywords, products, limits })} 件）
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleCsv}
          className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* キーワード一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">登録済みキーワード</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{keywords.length}件</span>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">読み込み中...</p>
        ) : keywords.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">まだ登録されていません</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {keywords.map(kw => (
              <li key={kw.id} className="px-5 py-3 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-800">{kw.text}</span>
                    {kw.productIds?.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {kw.productIds.map(pid => {
                          const p = productMap[pid]
                          return p ? (
                            <span key={pid} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                              {p.name}
                            </span>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <span className="ml-2 text-xs text-gray-400">紐づけなし（全店舗）</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {editingId !== kw.id && (
                      <button
                        onClick={() => startEdit(kw)}
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                      >
                        商品を編集
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(kw)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {editingId === kw.id && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    {products.length === 0 ? (
                      <p className="text-xs text-gray-400">商品が登録されていません</p>
                    ) : (
                      <div className="mb-2">
                        <ProductPicker
                          products={products}
                          selected={editProductIds}
                          onToggle={toggleEditProduct}
                          counts={keywordCountByProduct(keywords, kw.id)}
                          max={limits.maxKeywordsPerProduct}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(kw.id)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** 上限に対する使用量。90% 以上で黄色、上限到達で赤。 */
function Usage({ label, value, max, note }) {
  const unlimited = !max || max <= 0
  const ratio = unlimited ? 0 : value / max
  const color = ratio >= 1 ? 'text-red-600' : ratio >= 0.9 ? 'text-yellow-600' : 'text-gray-700'
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>
        {value}
        <span className="text-xs font-normal text-gray-400 ml-0.5">/ {unlimited ? '無制限' : max}</span>
      </p>
      {note && <p className="text-[11px] text-gray-400">{note}</p>}
    </div>
  )
}

/**
 * 商品のチェックボックス一覧。各商品の「現在の紐づけ数/上限」を表示し、
 * 上限に達した商品は（既に選択済みでなければ）選べない。
 * 商品が多いときは絞り込み欄を出す。
 */
function ProductPicker({ products, selected, onToggle, counts, max }) {
  const [filter, setFilter] = useState('')
  const shown = filter
    ? products.filter(p => (p.name + ' ' + (p.sku || '')).toLowerCase().includes(filter.toLowerCase()))
    : products
  return (
    <div>
      {products.length > 12 && (
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="商品名・SKUで絞り込み"
          className="mb-2 w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}
      <div className="flex flex-wrap gap-3 max-h-48 overflow-y-auto">
        {shown.map(p => {
          const n = counts[p.id] || 0
          const checked = selected.includes(p.id)
          const full = !checked && n >= max
          return (
            <label key={p.id} className={`flex items-center gap-1.5 ${full ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={full}
                onChange={() => onToggle(p.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{p.name}</span>
              <span className={`text-[11px] ${n >= max ? 'text-red-500' : 'text-gray-400'}`}>{n}/{max}</span>
            </label>
          )
        })}
        {shown.length === 0 && <span className="text-xs text-gray-400">該当する商品がありません</span>}
      </div>
    </div>
  )
}
