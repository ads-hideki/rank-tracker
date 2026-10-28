import { Fragment, useState, useEffect } from 'react'
import { useKeywords } from '../hooks/useKeywords'
import { useProducts } from '../hooks/useProducts'
import { useTodayRankings, localDateString } from '../hooks/useRankings'
import { useScrapeRequest } from '../hooks/useScrapeRequest'
import { useSettings } from '../hooks/useSettings'
import { STORES } from '../lib/stores'
import { estimateJobs, estimateMinutes, unlinkedCount } from '../lib/limits'

export default function Dashboard() {
  const { keywords, loading: kwLoading } = useKeywords()
  const { products, loading: prodLoading } = useProducts()
  const { rankings, loading: todayLoading } = useTodayRankings()
  const { status } = useScrapeRequest()
  const { limits, loaded: limitsLoaded, updateLimits } = useSettings()

  const today         = localDateString()
  const todayRankings = rankings.filter(r => r.date === today)
  const todayCount    = todayRankings.length
  const todayOutCount = todayRankings.filter(r => r.rank == null).length

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">ダッシュボード</h2>
        <span className="text-sm text-gray-400">
          {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard label="登録キーワード" value={kwLoading ? null : keywords.length} unit="件" />
        <StatCard label="本日取得済み"   value={todayLoading ? null : todayCount}    unit="件" color="green" />
        <StatCard label="圏外・未取得"   value={todayLoading ? null : todayOutCount}  unit="件" color="red" />
      </div>

      {/* 自動取得ステータス（楽天・Yahoo 別軸）*/}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 mb-6">
        <p className="text-xs font-medium text-gray-500 mb-3">自動取得ステータス</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlatformStatus
            title="楽天"
            place="VPS自動実行"
            request={status === undefined ? undefined : status?.rakuten ?? null}
          />
          <PlatformStatus
            title="Yahoo"
            place="VPS自動実行"
            request={status === undefined ? undefined : status?.yahoo ?? null}
          />
        </div>
      </div>

      {/* 取得設定（登録上限） */}
      <LimitsCard
        keywords={keywords}
        products={products}
        limits={limits}
        loaded={limitsLoaded}
        onSave={updateLimits}
      />

      {/* 本日の順位サマリー */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">本日の順位サマリー</h3>
          {!todayLoading && todayCount > 0 && (
            <span className="text-xs text-gray-400">{todayCount}件取得済み</span>
          )}
        </div>
        {prodLoading || kwLoading || todayLoading ? (
          <TableSkeleton />
        ) : products.length === 0 ? (
          <p className="px-6 py-12 text-center text-gray-400 text-sm">
            商品が登録されていません。<br />
            「商品マスタ」から追加してください。
          </p>
        ) : todayCount === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm mb-1">本日の順位はまだ取得されていません。</p>
            <p className="text-gray-300 text-xs">毎日 10:00 の自動取得をお待ちください。</p>
          </div>
        ) : (
          <ProductSummaryTable
            products={products}
            rankings={todayRankings}
            keywords={keywords}
          />
        )}
      </div>
    </div>
  )
}

// 商品×店舗ごとに最良キーワードと順位を表示
function ProductSummaryTable({ products, rankings, keywords }) {
  const kwMap = Object.fromEntries(keywords.map(k => [k.id, k.text]))
  const sorted = [...products].sort((a, b) => {
    if (!a.sku && !b.sku) return 0
    if (!a.sku) return 1
    if (!b.sku) return -1
    return a.sku.localeCompare(b.sku, 'ja')
  })

  // productId → storeId → best { rank, keywordId }
  const best = {}
  for (const r of rankings) {
    if (!r.productId) continue
    if (!best[r.productId]) best[r.productId] = {}
    const cur = best[r.productId][r.storeId]
    const better = r.rank != null && (cur == null || cur.rank == null || r.rank < cur.rank)
    if (!cur || better) best[r.productId][r.storeId] = r
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
              SKU
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              商品名
            </th>
            {STORES.map(s => (
              <th
                key={s.id}
                colSpan={2}
                className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider border-l border-gray-200"
              >
                {s.label}
              </th>
            ))}
          </tr>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th colSpan={2} />
            {STORES.map(s => (
              <Fragment key={s.id}>
                <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal border-l border-gray-200">
                  最良キーワード
                </th>
                <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal">
                  順位
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(p => (
            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                {p.sku || <span className="text-gray-200">-</span>}
              </td>
              <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                {p.name}
              </td>
              {STORES.map(s => {
                const r = best[p.id]?.[s.id]
                const kwText = r ? (kwMap[r.keywordId] ?? '-') : null
                return (
                  <Fragment key={s.id}>
                    <td className="px-3 py-3 text-center text-xs text-gray-600 border-l border-gray-100 max-w-[140px]">
                      {kwText
                        ? <span className="block truncate" title={kwText}>{kwText}</span>
                        : <span className="text-gray-300">-</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-gray-900 whitespace-nowrap">
                      {r?.rank != null
                        ? `${r.rank}位`
                        : <span className="text-gray-300">-</span>
                      }
                    </td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="px-6 py-5 space-y-3.5" aria-busy="true">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-5 animate-pulse">
          <div className="h-3.5 bg-gray-100 rounded w-16" />
          <div className="h-3.5 bg-gray-100 rounded w-32" />
          <div className="h-3.5 bg-gray-100 rounded w-20" />
          <div className="h-3.5 bg-gray-100 rounded w-10" />
          <div className="h-3.5 bg-gray-100 rounded w-20" />
          <div className="h-3.5 bg-gray-100 rounded w-10" />
          <div className="h-3.5 bg-gray-100 rounded w-20" />
          <div className="h-3.5 bg-gray-100 rounded w-10" />
        </div>
      ))}
    </div>
  )
}

/**
 * 取得設定カード。現在の登録量（想定ジョブ数・時間）と上限を表示し、上限を変更できる。
 * 上限は Firestore system/settings に保存され、キーワード・商品の登録画面とスクレイパーが参照する。
 */
function LimitsCard({ keywords, products, limits, loaded, onSave }) {
  const [form, setForm] = useState(limits)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Firestore 側の値が変わったら（他端末での変更など）フォームも追従させる
  useEffect(() => { setForm(limits) }, [limits])

  const jobs     = estimateJobs(keywords, products)
  const minutes  = estimateMinutes(jobs)
  const unlinked = unlinkedCount(keywords)
  const overJobs = limits.maxTotalJobs > 0 && jobs > limits.maxTotalJobs
  const dirty    = ['maxKeywordsPerProduct', 'maxUnlinkedKeywords', 'maxTotalJobs']
    .some(k => Number(form[k]) !== Number(limits[k]))

  const setNum = (key) => (e) => {
    const v = e.target.value
    setForm(f => ({ ...f, [key]: v === '' ? '' : Math.max(0, parseInt(v, 10) || 0) }))
  }

  const save = async () => {
    const next = {
      maxKeywordsPerProduct: Math.max(1, Number(form.maxKeywordsPerProduct) || 1),
      maxUnlinkedKeywords:   Math.max(0, Number(form.maxUnlinkedKeywords) || 0),
      maxTotalJobs:          Math.max(0, Number(form.maxTotalJobs) || 0),
    }
    setSaving(true)
    try {
      await onSave(next)
      setMsg('保存しました')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500">取得設定（登録上限）</p>
        <span className="text-[11px] text-gray-400">1ジョブ＝キーワード×商品×店舗の検索1回・約7.5秒</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 現在の登録量 */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">想定ジョブ数</span>
            <span className={`font-semibold ${overJobs ? 'text-red-600' : 'text-gray-800'}`}>
              {jobs} 件
              <span className="font-normal text-gray-400"> / {limits.maxTotalJobs > 0 ? `${limits.maxTotalJobs} 件` : '無制限'}</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">想定実行時間</span>
            <span className="font-semibold text-gray-800">約 {minutes} 分<span className="font-normal text-gray-400">（07:00 開始なら {endTime(minutes)} 完了）</span></span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">紐づけなしキーワード</span>
            <span className="font-semibold text-gray-800">{unlinked} 件<span className="font-normal text-gray-400"> / {limits.maxUnlinkedKeywords} 件</span></span>
          </div>
          {overJobs && (
            <p className="text-xs text-red-600 pt-1">上限を超えています。キーワードを減らすか上限を見直してください。</p>
          )}
        </div>

        {/* 上限の変更 */}
        <div className="text-sm space-y-2">
          <LimitInput label="商品あたりキーワード数" value={form.maxKeywordsPerProduct} onChange={setNum('maxKeywordsPerProduct')} unit="個" disabled={!loaded} />
          <LimitInput label="紐づけなしキーワード数" value={form.maxUnlinkedKeywords} onChange={setNum('maxUnlinkedKeywords')} unit="件" disabled={!loaded} />
          <LimitInput label="全体ジョブ数（0=無制限）" value={form.maxTotalJobs} onChange={setNum('maxTotalJobs')} unit="件" disabled={!loaded} />
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={!dirty || saving || !loaded}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function LimitInput({ label, value, onChange, unit, disabled }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
        <span className="text-xs text-gray-400 w-5">{unit}</span>
      </span>
    </label>
  )
}

/** 07:00 開始として minutes 分後の時刻を「HH:MM」で返す。 */
function endTime(minutes) {
  const total = 7 * 60 + minutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Firestore Timestamp を「7月21日 10:38」形式に整形する。当日なら時刻のみ。 */
function formatStamp(ts) {
  const d = ts?.toDate?.()
  if (!d) return null

  const time = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  const isToday = d.toDateString() === new Date().toDateString()
  if (isToday) return time

  const day = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  return `${day} ${time}`
}

/** 楽天 / Yahoo それぞれのステータスを1枠で表示する。 */
function PlatformStatus({ title, place, request }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-[11px] text-gray-400">{place}</span>
      </div>
      <ScrapeStatus request={request} />
    </div>
  )
}

function ScrapeStatus({ request }) {
  if (request === undefined) {
    return <div className="h-5 w-40 bg-gray-100 animate-pulse rounded" />
  }
  if (!request) {
    return <span className="text-sm text-gray-400">実行記録がありません</span>
  }

  const { status, startedAt, completedAt, message } = request

  // 実行中（main.py が開始時に書き込む）
  if (status === 'running') {
    const started = formatStamp(startedAt)
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-blue-600">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        実行中{started && <span className="font-normal text-gray-500">（{started} 開始）</span>}
      </span>
    )
  }

  // 完了
  if (status === 'done') {
    const done = formatStamp(completedAt)
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-green-700">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          {done ? `${done} 完了` : '完了'}
        </span>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    )
  }

  // エラー
  if (status === 'error') {
    const failed = formatStamp(completedAt)
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-red-600">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          {failed ? `${failed} エラー` : 'エラー'}
        </span>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    )
  }

  // pending は廃止した手動実行ボタンの名残。実行されることはない
  if (status === 'pending') {
    return <span className="text-sm text-gray-400">待機中（手動実行は廃止されました）</span>
  }

  return <span className="text-sm text-gray-400">状態不明</span>
}

function StatCard({ label, value, unit, color = 'blue' }) {
  const colors = { blue: 'text-blue-700', green: 'text-green-700', red: 'text-red-600' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      {value === null ? (
        <div className="h-9 w-20 bg-gray-100 animate-pulse rounded" />
      ) : (
        <p className={`text-3xl font-bold ${colors[color]}`}>
          {value}
          <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
        </p>
      )}
    </div>
  )
}
