import { Fragment } from 'react'
import { useKeywords } from '../hooks/useKeywords'
import { useProducts } from '../hooks/useProducts'
import { useDashboardRankings } from '../hooks/useRankings'
import { STORES } from '../lib/stores'

/** 'YYYY-MM-DD' → 'M/D' */
const fmtDate = d => (d ? `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8, 10), 10)}` : '')

export default function Dashboard() {
  const { keywords, loading: kwLoading } = useKeywords()
  const { products, loading: prodLoading } = useProducts()
  const { rankings, today, weekAgo, loading: rankLoading } = useDashboardRankings()

  const todayRankings = rankings.filter(r => r.date === today)
  const weekRankings  = rankings.filter(r => r.date === weekAgo)
  const todayCount    = todayRankings.length
  const todayOutCount = todayRankings.filter(r => r.rank == null).length
  const loading       = prodLoading || kwLoading || rankLoading

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
        <StatCard label="本日取得済み"   value={rankLoading ? null : todayCount}    unit="件" color="green" />
        <StatCard label="圏外・未取得"   value={rankLoading ? null : todayOutCount}  unit="件" color="red" />
      </div>

      {/* 順位一覧（全キーワード・本日 vs 7日前） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-800 text-sm">順位一覧（全キーワード）</h3>
          <div className="text-xs text-gray-400 flex flex-wrap gap-x-3">
            <span>本日 {fmtDate(today)}</span>
            <span>7日前 {fmtDate(weekAgo)}</span>
            {!rankLoading && todayCount > 0 && weekRankings.length === 0 && (
              <span className="text-yellow-600">7日前（{fmtDate(weekAgo)}）のデータはありません</span>
            )}
          </div>
        </div>
        {loading ? (
          <TableSkeleton />
        ) : keywords.length === 0 ? (
          <p className="px-6 py-12 text-center text-gray-400 text-sm">
            キーワードが登録されていません。<br />
            「キーワード管理」から追加してください。
          </p>
        ) : todayCount === 0 && weekRankings.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm mb-1">本日の順位はまだ取得されていません。</p>
            <p className="text-gray-300 text-xs">毎日 07:00 の自動取得をお待ちください（実行状況は「設定」タブ）。</p>
          </div>
        ) : (
          <AllKeywordsTable
            products={products}
            keywords={keywords}
            todayRankings={todayRankings}
            weekRankings={weekRankings}
          />
        )}
      </div>
    </div>
  )
}

/**
 * 商品ごとに紐づく全キーワードを1行ずつ、店舗ごとに「本日（7日前比）」「7日前」を表示する。
 * 商品に紐づけないキーワード（店舗単位の検索）は末尾に別グループで出す。
 */
function AllKeywordsTable({ products, keywords, todayRankings, weekRankings }) {
  const sortedProducts = [...products].sort((a, b) => {
    if (!a.sku && !b.sku) return 0
    if (!a.sku) return 1
    if (!b.sku) return -1
    return a.sku.localeCompare(b.sku, 'ja')
  })

  // keywordId | storeId | productId('' = 紐づけなし) → ranking
  const keyOf = (kwId, storeId, productId) => `${kwId}|${storeId}|${productId || ''}`
  const todayMap = Object.fromEntries(todayRankings.map(r => [keyOf(r.keywordId, r.storeId, r.productId), r]))
  const weekMap  = Object.fromEntries(weekRankings.map(r => [keyOf(r.keywordId, r.storeId, r.productId), r]))

  const unlinked = keywords.filter(k => !(k.productIds?.length))
  const totalCols = 2 + STORES.length * 2

  const renderStoreCells = (kwId, productId, storeItems) => STORES.map(s => {
    // 商品に紐づく行で、その店舗に商品コードが無ければ対象外
    const inactive = productId && !(storeItems?.[s.id] || '').trim()
    if (inactive) {
      return (
        <Fragment key={s.id}>
          <td className="px-3 py-2.5 text-center border-l border-gray-100"><span className="text-gray-200">-</span></td>
          <td className="px-3 py-2.5 text-center"><span className="text-gray-200">-</span></td>
        </Fragment>
      )
    }
    const t = todayMap[keyOf(kwId, s.id, productId)]
    const w = weekMap[keyOf(kwId, s.id, productId)]
    return (
      <Fragment key={s.id}>
        <td className="px-3 py-2.5 text-center border-l border-gray-100 whitespace-nowrap">
          <Rank r={t} />
          <Diff today={t} week={w} />
        </td>
        <td className="px-3 py-2.5 text-center whitespace-nowrap">
          <Rank r={w} muted />
        </td>
      </Fragment>
    )
  })

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">SKU</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">商品 / キーワード</th>
            {STORES.map(s => (
              <th key={s.id} colSpan={2} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider border-l border-gray-200">
                {s.label}
              </th>
            ))}
          </tr>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th colSpan={2} />
            {STORES.map(s => (
              <Fragment key={s.id}>
                <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal border-l border-gray-200">本日</th>
                <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal">7日前</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedProducts.map(p => {
            const linked = keywords.filter(k => k.productIds?.includes(p.id))
            return (
              <Fragment key={p.id}>
                <tr className="bg-blue-50/40 border-t border-gray-200">
                  <td className="px-4 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                    {p.sku || <span className="text-gray-200">-</span>}
                  </td>
                  <td colSpan={totalCols - 1} className="px-4 py-2 font-medium text-gray-800">
                    {p.name}
                    <span className="ml-2 text-xs font-normal text-gray-400">{linked.length}キーワード</span>
                  </td>
                </tr>
                {linked.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    <td />
                    <td colSpan={totalCols - 1} className="px-4 py-2 text-xs text-gray-300">紐づくキーワードがありません</td>
                  </tr>
                ) : linked.map(kw => (
                  <tr key={kw.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td />
                    <td className="px-4 py-2.5 pl-8 text-gray-700 whitespace-nowrap">{kw.text}</td>
                    {renderStoreCells(kw.id, p.id, p.storeItems)}
                  </tr>
                ))}
              </Fragment>
            )
          })}

          {unlinked.length > 0 && (
            <Fragment>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2 text-xs text-gray-400 font-mono">-</td>
                <td colSpan={totalCols - 1} className="px-4 py-2 font-medium text-gray-600">
                  商品に紐づけないキーワード
                  <span className="ml-2 text-xs font-normal text-gray-400">店舗単位の順位・{unlinked.length}キーワード</span>
                </td>
              </tr>
              {unlinked.map(kw => (
                <tr key={kw.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td />
                  <td className="px-4 py-2.5 pl-8 text-gray-700 whitespace-nowrap">{kw.text}</td>
                  {renderStoreCells(kw.id, null, null)}
                </tr>
              ))}
            </Fragment>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** 順位。データ無し＝薄い「-」、圏外＝「圏外」。 */
function Rank({ r, muted = false }) {
  if (!r) return <span className="text-gray-300">-</span>
  if (r.rank == null) return <span className={`text-xs ${muted ? 'text-gray-400' : 'text-gray-500'}`}>圏外</span>
  return <span className={`font-mono ${muted ? 'text-gray-500' : 'text-gray-900'}`}>{r.rank}位</span>
}

/** 7日前との変動。順位が小さくなれば改善（▲緑）。 */
function Diff({ today, week }) {
  if (!today || !week) return null
  const t = today.rank, w = week.rank
  let node = null
  if (t != null && w != null) {
    const d = t - w
    if (d === 0)      node = <span className="text-gray-400">→ 変動なし</span>
    else if (d < 0)   node = <span className="text-green-600 font-semibold">▲{Math.abs(d)}</span>
    else              node = <span className="text-red-500 font-semibold">▼{d}</span>
  } else if (t != null && w == null) {
    node = <span className="text-green-600">圏外 → 圏内</span>
  } else if (t == null && w != null) {
    node = <span className="text-red-500">圏内 → 圏外</span>
  }
  return node ? <div className="text-[11px] leading-tight mt-0.5">{node}</div> : null
}

function TableSkeleton() {
  return (
    <div className="px-6 py-5 space-y-3.5" aria-busy="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-5 animate-pulse">
          <div className="h-3.5 bg-gray-100 rounded w-16" />
          <div className="h-3.5 bg-gray-100 rounded w-40" />
          <div className="h-3.5 bg-gray-100 rounded w-12" />
          <div className="h-3.5 bg-gray-100 rounded w-12" />
          <div className="h-3.5 bg-gray-100 rounded w-12" />
          <div className="h-3.5 bg-gray-100 rounded w-12" />
          <div className="h-3.5 bg-gray-100 rounded w-12" />
          <div className="h-3.5 bg-gray-100 rounded w-12" />
        </div>
      ))}
    </div>
  )
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
