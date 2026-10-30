import { useState, useRef } from 'react'
import { useProducts } from '../hooks/useProducts'
import { useKeywords } from '../hooks/useKeywords'
import { useSettings } from '../hooks/useSettings'
import { STORES } from '../lib/stores'
import { checkNewProduct, checkKeywordAssignment } from '../lib/limits'
import { TEPS, fetchTepsSkuMaster, buildCandidates, splitNewAndExisting } from '../lib/teps'
import ProductKeywords from '../components/ProductKeywords'

const emptyStoreItems = () => Object.fromEntries(STORES.map(s => [s.id, '']))

/** 品番（SKU）順。SKU 未設定は末尾。 */
const bySku = (a, b) => {
  if (!a.sku && !b.sku) return 0
  if (!a.sku) return 1
  if (!b.sku) return -1
  return a.sku.localeCompare(b.sku, 'ja', { numeric: true })
}

export default function Products() {
  const { products, loading, addProduct, removeProduct, updateProduct } = useProducts()
  const { keywords, updateKeyword, findByText, addKeywordToProduct, unlinkKeyword } = useKeywords()
  const { limits } = useSettings()

  // 商品側からのキーワード追加・削除（登録上限のチェックつき）
  const handleAddKeyword = async (p, text) => {
    const existing = findByText(text)
    const check = checkKeywordAssignment({
      keywords, products, limits,
      keywordId: existing?.id ?? null,
      productIds: [...new Set([...(existing?.productIds || []), p.id])],
    })
    if (!check.ok) return check
    const r = await addKeywordToProduct(text, p.id)
    showToast(r?.created ? `「${text.trim()}」を作成して紐づけました` : `「${text.trim()}」を紐づけました`)
    return { ok: true }
  }
  const handleRemoveKeyword = async (p, kw) => {
    const r = await unlinkKeyword(kw.id, p.id)
    showToast(r === 'deleted' ? `「${kw.text}」を削除しました` : `「${kw.text}」をこの商品から外しました`, 'info')
  }
  const [form, setForm] = useState({ name: '', sku: '', storeItems: emptyStoreItems() })
  const [selectedKeywordIds, setSelectedKeywordIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const nameRef = useRef()

  const sortedProducts = [...products].sort(bySku)

  // 店舗ごとに「同じ商品コードを持つ商品」を集める。
  // 例: 008-l / 008-m / 008-xl は楽天 annekor22 では1つのページ（ads_008）で売っているので、
  //     annekor22 の順位は3商品で同じ値になる。表ではその旨を注釈として出す。
  const sharedCodes = {}
  for (const s of STORES) {
    const bucket = {}
    for (const p of products) {
      const code = (p.storeItems?.[s.id] || '').trim()
      if (code) (bucket[code] = bucket[code] || []).push(p)
    }
    sharedCodes[s.id] = Object.fromEntries(Object.entries(bucket).filter(([, ps]) => ps.length > 1))
  }
  const sharedWith = (p, storeId) => {
    const code = (p.storeItems?.[storeId] || '').trim()
    return (sharedCodes[storeId]?.[code] || []).filter(q => q.id !== p.id)
  }

  const startEdit = (p) => {
    setEditingId(p.id)
    setEditForm({
      name: p.name || '',
      sku: p.sku || '',
      storeItems: { ...emptyStoreItems(), ...(p.storeItems || {}) },
    })
  }
  const cancelEdit = () => { setEditingId(null); setEditForm(null) }
  const saveEdit = async () => {
    if (!editForm.name.trim()) { showToast('商品名は必須です', 'error'); return }
    setSavingEdit(true)
    try {
      await updateProduct(editingId, {
        name: editForm.name.trim(),
        sku: editForm.sku.trim(),
        storeItems: Object.fromEntries(STORES.map(s => [s.id, (editForm.storeItems[s.id] || '').trim()])),
      })
      showToast(`「${editForm.name.trim()}」を更新しました`)
      cancelEdit()
    } finally {
      setSavingEdit(false)
    }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), type === 'error' ? 6000 : 3500)
  }

  const toggleKeyword = (id) => {
    setSelectedKeywordIds(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const check = checkNewProduct({
      keywords, products, limits,
      storeItems: form.storeItems, keywordIds: selectedKeywordIds,
    })
    if (!check.ok) { showToast(check.reason, 'error'); return }
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
          toast.type === 'success' ? 'bg-green-50 text-green-700 border-green-200'
          : toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {toast.msg}
        </div>
      )}

      <TepsImport products={products} addProduct={addProduct} showToast={showToast} />

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
                <span className="text-gray-400 font-normal ml-1">
                  （任意・{limits.maxKeywordsPerProduct} 個まで）
                </span>
                <span className={`ml-2 text-xs ${selectedKeywordIds.length >= limits.maxKeywordsPerProduct ? 'text-red-500' : 'text-gray-400'}`}>
                  {selectedKeywordIds.length}/{limits.maxKeywordsPerProduct}
                </span>
              </p>
              <div className="flex flex-wrap gap-3 max-h-32 overflow-y-auto">
                {keywords.map(kw => {
                  const checked = selectedKeywordIds.includes(kw.id)
                  const full = !checked && selectedKeywordIds.length >= limits.maxKeywordsPerProduct
                  return (
                    <label key={kw.id} className={`flex items-center gap-1.5 ${full ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={full}
                        onChange={() => toggleKeyword(kw.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{kw.text}</span>
                    </label>
                  )
                })}
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
              {sortedProducts.map(p => (
                <li key={p.id} className="px-4 py-3">
                  {editingId === p.id ? (
                    <ProductEditForm
                      form={editForm}
                      setForm={setEditForm}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      saving={savingEdit}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {p.sku && <span className="font-mono text-xs text-gray-400 mr-2">{p.sku}</span>}
                          {p.name}
                        </p>
                        <div className="mt-2">
                          <ProductKeywords
                            compact
                            product={p}
                            keywords={keywords}
                            max={limits.maxKeywordsPerProduct}
                            onAdd={text => handleAddKeyword(p, text)}
                            onRemove={kw => handleRemoveKeyword(p, kw)}
                          />
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          {STORES.map(s => {
                            const code = p.storeItems?.[s.id]
                            const others = sharedWith(p, s.id)
                            return code ? (
                              <p key={s.id} className="text-xs text-gray-500">
                                <span className="text-gray-400">{s.label}:</span>{' '}
                                <span className="font-mono">{code}</span>
                                {others.length > 0 && (
                                  <span className="ml-1 text-[10px] text-amber-700">（{others.map(q => q.sku || q.name).join(', ')} と同一ページ）</span>
                                )}
                              </p>
                            ) : null
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <button
                          onClick={() => startEdit(p)}
                          className="text-xs text-blue-500 hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleRemove(p)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* デスクトップ：テーブル表示 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">品番（SKU）</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">商品名</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                      キーワード<br />
                      <span className="font-normal text-gray-400">× で外す・＋で追加</span>
                    </th>
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
                  {sortedProducts.map(p => (
                    editingId === p.id ? (
                      <tr key={p.id} className="bg-blue-50/30">
                        <td colSpan={4 + STORES.length} className="px-5 py-4">
                          <ProductEditForm
                            form={editForm}
                            setForm={setEditForm}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            saving={savingEdit}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">{p.sku || <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-3 align-top min-w-[220px]">
                          <ProductKeywords
                            product={p}
                            keywords={keywords}
                            max={limits.maxKeywordsPerProduct}
                            onAdd={text => handleAddKeyword(p, text)}
                            onRemove={kw => handleRemoveKeyword(p, kw)}
                          />
                        </td>
                        {STORES.map(s => {
                          const others = sharedWith(p, s.id)
                          return (
                            <td key={s.id} className="px-4 py-3 text-gray-600 font-mono text-xs">
                              {p.storeItems?.[s.id] || <span className="text-gray-300">-</span>}
                              {others.length > 0 && (
                                <span
                                  className="block mt-0.5 font-sans text-[10px] text-amber-700"
                                  title={`${s.label} では ${others.map(q => q.sku || q.name).join(' / ')} と同じ商品ページで販売しているため、順位は同じ値になります`}
                                >
                                  同一ページ: {others.map(q => q.sku || q.name).join(', ')}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs text-blue-500 hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleRemove(p)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    )
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

/**
 * TēPs（売上・在庫管理）の商品マスタから商品を取り込む。
 * 読み込み → 新規だけをプレビュー（チェックで選択）→ 登録。登録済みの商品は触らない。
 */
function TepsImport({ products, addProduct, showToast }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: false, error: '', fresh: null, existing: 0, old: 0, total: 0 })
  const [selected, setSelected] = useState(new Set())
  const [choice, setChoice] = useState({})   // sku → 選んだ annekor22 コード（候補が複数ある商品のみ）
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const docs = await fetchTepsSkuMaster()
      const all  = buildCandidates(docs)
      const cands = all.filter(c => !c.old)
      const { fresh, existing } = splitNewAndExisting(cands, products)
      setState({ loading: false, error: '', fresh, existing: existing.length, old: all.length - cands.length, total: docs.length })
      setSelected(new Set(fresh.map(c => c.sku)))
      setChoice(Object.fromEntries(fresh.map(c => [c.sku, c.storeItems.annekor22])))
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message || String(e) }))
    }
  }

  const annekor22Of = c => (c.sku in choice ? choice[c.sku] : c.storeItems.annekor22)

  const toggle = sku => setSelected(prev => {
    const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n
  })
  const toggleAll = () => setSelected(prev =>
    prev.size === state.fresh.length ? new Set() : new Set(state.fresh.map(c => c.sku)))

  const register = async () => {
    const targets = state.fresh.filter(c => selected.has(c.sku))
    if (targets.length === 0) return
    if (!window.confirm(`${targets.length} 件の商品を登録します。よろしいですか？`)) return
    setSaving(true)
    let done = 0
    try {
      for (const c of targets) {
        await addProduct({ name: c.name, sku: c.sku, storeItems: { ...c.storeItems, annekor22: annekor22Of(c) } })
        done++
      }
      showToast(`TēPs から ${done} 件を登録しました`)
      setState(s => ({ ...s, fresh: s.fresh.filter(c => !selected.has(c.sku)), existing: s.existing + done }))
      setSelected(new Set())
    } catch (e) {
      showToast(`${done} 件登録後にエラー: ${e.message || e}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">
          TēPs（売上・在庫管理）から取り込み
          <span className="ml-2 text-xs font-normal text-gray-400">新しい商品だけを追加。登録済みの商品は変更しません</span>
        </span>
        <span className="text-gray-400 text-xs">{open ? '閉じる ▲' : '開く ▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500 mb-3">
            TēPs の品番（SKU）を楽天・Yahoo のページ単位にまとめて登録します。
            楽天 annekor は <span className="font-mono">manage_number</span>、楽天 annekor22 は店舗2のSKU（<span className="font-mono">rakuten2_sku</span>）から導いた管理番号、
            Yahoo は <span className="font-mono">product_code</span> を商品コードにします。
            annekor22 の候補が複数ある商品は「要確認」と表示するので、正しい方を選んでください（楽天の商品ページURL <span className="font-mono">item.rakuten.co.jp/annekor22/コード/</span> が開くものが正）。
            名前に「旧」を含む商品と、どちらのコードも無い商品は対象外です。
            （<a href={TEPS.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">TēPs を開く</a>）
          </p>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={load}
              disabled={state.loading}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {state.loading ? '読み込み中...' : state.fresh ? '再読み込み' : 'TēPs を読み込む'}
            </button>
            {state.fresh && (
              <span className="text-xs text-gray-500">
                TēPs {state.total} SKU → 商品 {state.fresh.length + state.existing} 件（登録済み {state.existing} / <b className="text-gray-800">新規 {state.fresh.length}</b>）、「旧」{state.old} 件を除外
              </span>
            )}
          </div>
          {state.error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{state.error}</p>}

          {state.fresh && state.fresh.length === 0 && (
            <p className="text-sm text-gray-400">新しく追加できる商品はありません。</p>
          )}

          {state.fresh && state.fresh.length > 0 && (
            <>
              <div className="overflow-y-auto max-h-96 border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left w-8">
                        <input type="checkbox" checked={selected.size === state.fresh.length} onChange={toggleAll} className="rounded border-gray-300 text-blue-600" />
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">品番</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">商品名</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">楽天 annekor</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">楽天 annekor22</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Yahoo</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {state.fresh.map(c => (
                      <tr key={c.sku} className={`hover:bg-gray-50 ${selected.has(c.sku) ? '' : 'opacity-50'}`}>
                        <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(c.sku)} onChange={() => toggle(c.sku)} className="rounded border-gray-300 text-blue-600" /></td>
                        <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">{c.sku}</td>
                        <td className="px-3 py-1.5 text-gray-800">{c.name}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">{c.storeItems.annekor || <span className="text-gray-300">-</span>}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">
                          {c.needsReview ? (
                            <span className="flex items-center gap-1.5">
                              <select
                                value={annekor22Of(c)}
                                onChange={e => setChoice(prev => ({ ...prev, [c.sku]: e.target.value }))}
                                className="border border-yellow-400 bg-yellow-50 rounded px-1.5 py-0.5 text-xs font-mono"
                              >
                                {c.annekor22Candidates.map(x => <option key={x} value={x}>{x}</option>)}
                                <option value="">（出品なし・対象外）</option>
                              </select>
                              <span className="text-[10px] text-yellow-700 whitespace-nowrap" title={c.reviewNote}>要確認</span>
                            </span>
                          ) : (
                            annekor22Of(c) || <span className="text-gray-300" title="店舗2のSKUが無いため対象外">-</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">{c.storeItems.annekor_yahoo || <span className="text-gray-300">-</span>}</td>
                        <td className="px-3 py-1.5 text-gray-400">{c.variants.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={register}
                  disabled={saving || selected.size === 0}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? '登録中...' : `選択した ${selected.size} 件を登録`}
                </button>
                <span className="text-xs text-gray-400">登録後は一覧の「編集」で名前や商品コードを直せます</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 商品の編集フォーム（商品名・品番・店舗別商品コード）。一覧の行の中に展開する。 */
function ProductEditForm({ form, setForm, onSave, onCancel, saving }) {
  const input = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">商品名 <span className="text-red-400">*</span></label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={input} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">品番（SKU）</label>
          <input type="text" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className={input} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STORES.map(s => (
          <div key={s.id}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{s.label} 商品コード</label>
            <input
              type="text"
              value={form.storeItems[s.id] || ''}
              onChange={e => setForm(f => ({ ...f, storeItems: { ...f.storeItems, [s.id]: e.target.value } }))}
              placeholder={s.platform === 'rakuten' ? '例: ads-007' : '例: ads007'}
              className={`${input} font-mono`}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        商品コードを変えると、翌日の取得からその商品コードで順位を探します。過去の順位データはそのまま残ります。
      </p>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
