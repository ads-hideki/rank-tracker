import { useState } from 'react'

/**
 * 商品に紐づくキーワードをチップで表示し、その場で追加・削除する。
 *   props:
 *     product   … 対象商品
 *     keywords  … 全キーワード（この中から productIds に product.id を含むものを表示）
 *     max       … 商品あたりの上限（表示用。判定は onAdd 側で行う）
 *     onAdd(text)        … 追加。失敗時は reason を返す { ok:false, reason } か例外
 *     onRemove(keyword)  … 削除（その商品から外す）
 *     compact   … スマホ表示（小さめ）
 */
export default function ProductKeywords({ product, keywords, max, onAdd, onRemove, compact = false }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const linked = keywords.filter(k => k.productIds?.includes(product.id))

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true); setError('')
    try {
      const r = await onAdd(text)
      if (r && r.ok === false) { setError(r.reason || '追加できませんでした'); return }
      setText('')
      setAdding(false)
    } catch (err) {
      setError(err?.message || '追加できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (kw) => {
    const others = (kw.productIds || []).filter(id => id !== product.id).length
    const msg = others > 0
      ? `「${kw.text}」をこの商品から外しますか？（他 ${others} 商品の紐づけは残ります）`
      : `「${kw.text}」をこの商品から外しますか？\n他に紐づく商品が無いため、キーワード自体を削除します（過去の順位データは残ります）。`
    if (!window.confirm(msg)) return
    setBusy(true)
    try { await onRemove(kw) } finally { setBusy(false) }
  }

  const chip = compact ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1 items-center">
        {linked.length === 0 && !adding && (
          <span className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-300`}>キーワードなし</span>
        )}
        {linked.map(kw => (
          <span key={kw.id} className={`inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 ${chip}`}>
            {kw.text}
            <button
              type="button"
              onClick={() => remove(kw)}
              disabled={busy}
              title="この商品からキーワードを外す"
              className="text-blue-300 hover:text-red-500 leading-none"
            >
              ×
            </button>
          </span>
        ))}
        {!adding ? (
          <button
            type="button"
            onClick={() => { setAdding(true); setError('') }}
            disabled={busy || linked.length >= max}
            title={linked.length >= max ? `上限 ${max} 個に達しています` : 'キーワードを追加'}
            className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed px-1`}
          >
            ＋追加
          </button>
        ) : (
          <form onSubmit={submit} className="inline-flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setText(''); setError('') } }}
              placeholder="例：ハンドバッグ レディース"
              disabled={busy}
              className="w-44 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" disabled={busy || !text.trim()} className="text-xs text-white bg-blue-600 rounded px-2 py-0.5 disabled:opacity-40">追加</button>
            <button type="button" onClick={() => { setAdding(false); setText(''); setError('') }} className="text-xs text-gray-400 px-1">取消</button>
          </form>
        )}
      </div>
      <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-400 mt-0.5`}>
        {linked.length}/{max}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </div>
    </div>
  )
}
