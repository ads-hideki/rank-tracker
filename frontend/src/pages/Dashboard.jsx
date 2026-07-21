import { Fragment } from 'react'
import { useKeywords } from '../hooks/useKeywords'
import { useProducts } from '../hooks/useProducts'
import { useTodayRankings, localDateString } from '../hooks/useRankings'
import { useScrapeRequest } from '../hooks/useScrapeRequest'
import { STORES } from '../lib/stores'

export default function Dashboard() {
  const { keywords, loading: kwLoading } = useKeywords()
  const { products, loading: prodLoading } = useProducts()
  const { rankings, loading: todayLoading } = useTodayRankings()
  const { request } = useScrapeRequest()

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

      {/* 自動取得ステータス */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 mb-1.5">自動取得ステータス</p>
            <ScrapeStatus request={request} />
          </div>
          <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
            毎日 10:00 自動実行
          </span>
        </div>
      </div>

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
