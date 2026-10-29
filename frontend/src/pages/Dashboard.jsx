import { Fragment, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useKeywords } from '../hooks/useKeywords'
import { useProducts } from '../hooks/useProducts'
import { useDashboardRankings } from '../hooks/useRankings'
import { STORES, STORE_COLORS } from '../lib/stores'

/** 'YYYY-MM-DD' → 'M/D' */
const fmtDate = d => `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8, 10), 10)}`
const dayLabel = i => (i === 0 ? '本日' : `${i}日前`)

/** 画面幅が狭いか（スマホ）。狭いときは表示する日数を減らして横スクロールを出さない。 */
function useIsNarrow(maxWidth = 640) {
  const [narrow, setNarrow] = useState(() => window.matchMedia(`(max-width: ${maxWidth}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = e => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])
  return narrow
}

export default function Dashboard() {
  const { keywords, loading: kwLoading } = useKeywords()
  const { products, loading: prodLoading } = useProducts()
  const { rankings, dates, loading: rankLoading } = useDashboardRankings(8)
  const [storeFilter, setStoreFilter] = useState('all')
  const narrow = useIsNarrow()

  const shownDates    = narrow ? dates.slice(0, 4) : dates
  const today         = dates[0]
  const todayRankings = rankings.filter(r => r.date === today)
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

      {/* 順位一覧（全キーワード・直近8日） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-800 text-sm">順位一覧（全キーワード・直近{shownDates.length}日）</h3>
          <StoreFilter value={storeFilter} onChange={setStoreFilter} />
        </div>

        {loading ? (
          <TableSkeleton />
        ) : keywords.length === 0 ? (
          <p className="px-6 py-12 text-center text-gray-400 text-sm">
            キーワードが登録されていません。<br />
            「キーワード管理」から追加してください。
          </p>
        ) : rankings.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm mb-1">順位データがまだありません。</p>
            <p className="text-gray-300 text-xs">毎日 07:00 の自動取得をお待ちください（実行状況は「設定」タブ）。</p>
          </div>
        ) : (
          <>
            <RankGrid
              products={products}
              keywords={keywords}
              rankings={rankings}
              dates={shownDates}
              stores={storeFilter === 'all' ? STORES : STORES.filter(s => s.id === storeFilter)}
              showStoreColumn={storeFilter === 'all'}
              compact={narrow}
            />
            <Legend />
          </>
        )}
      </div>
    </div>
  )
}

/** 店舗の絞り込み。「全店舗」なら各キーワードの下に店舗を縦に積む。 */
function StoreFilter({ value, onChange }) {
  const opts = [{ id: 'all', label: '全店舗' }, ...STORES]
  return (
    <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            value === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {o.id !== 'all' && <span className="inline-block w-2 h-2 rounded-full" style={{ background: STORE_COLORS[o.id] }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * 商品 → キーワード → 店舗 の順に行を作り、列は日付（左が新しい）。
 * 全店舗表示のときはキーワードのセルを rowSpan で店舗数ぶん結合し、店舗を縦に積む。
 * 商品に紐づけないキーワードは末尾に別グループ（店舗単位の順位）。
 */
function RankGrid({ products, keywords, rankings, dates, stores, showStoreColumn, compact = false }) {
  const sortedProducts = [...products].sort((a, b) => {
    if (!a.sku && !b.sku) return 0
    if (!a.sku) return 1
    if (!b.sku) return -1
    return a.sku.localeCompare(b.sku, 'ja')
  })

  // keywordId | storeId | productId('' = 紐づけなし) | date → ranking
  const keyOf = (kwId, storeId, productId, date) => `${kwId}|${storeId}|${productId || ''}|${date}`
  const map = Object.fromEntries(rankings.map(r => [keyOf(r.keywordId, r.storeId, r.productId, r.date), r]))

  const unlinked  = keywords.filter(k => !(k.productIds?.length))
  const totalCols = 1 + (showStoreColumn ? 1 : 0) + dates.length

  /** 1キーワードぶんの行（店舗ごとに1行）。storeList は対象店舗。 */
  const keywordRows = (kw, productId, storeList) => {
    if (storeList.length === 0) {
      return (
        <tr key={kw.id} className="border-b border-gray-100">
          <td className="px-3 sm:px-4 py-2 sm:pl-8 text-gray-700 text-sm break-words">{kw.text}</td>
          {showStoreColumn && <td />}
          <td colSpan={dates.length} className="px-3 py-2 text-xs text-gray-300">この店舗の商品コードが未設定</td>
        </tr>
      )
    }
    return storeList.map((s, i) => (
      <tr key={`${kw.id}_${s.id}`} className={`hover:bg-gray-50 transition-colors ${i === storeList.length - 1 ? 'border-b border-gray-100' : ''}`}>
        {i === 0 && (
          <td rowSpan={storeList.length} className="px-3 sm:px-4 py-2 sm:pl-8 text-gray-700 text-sm break-words align-top border-r border-gray-50">
            {kw.text}
          </td>
        )}
        {showStoreColumn && (
          // スマホ幅では店舗名を省略して色の点だけにする（横スクロールを出さないため）
          <td className="px-2 sm:px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap" title={s.label}>
            <span className="inline-block w-2 h-2 rounded-full sm:mr-1.5 align-middle" style={{ background: STORE_COLORS[s.id] }} />
            {!compact && s.label}
          </td>
        )}
        {dates.map(d => <RankCell key={d} r={map[keyOf(kw.id, s.id, productId, d)]} />)}
      </tr>
    ))
  }

  return (
    <div>
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col />
          {showStoreColumn && <col className={compact ? 'w-[28px]' : 'w-[128px]'} />}
          {dates.map(d => <col key={d} className="w-[44px] sm:w-[54px]" />)}
        </colgroup>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 sm:px-4 py-2 text-left text-xs font-semibold text-gray-500">商品 / キーワード</th>
            {showStoreColumn && <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold text-gray-500">{compact ? '' : '店舗'}</th>}
            {dates.map((d, i) => (
              <th key={d} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-500 leading-tight">
                {dayLabel(i)}<br />
                <span className="font-normal text-gray-400">{fmtDate(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedProducts.map(p => {
            const linked = keywords.filter(k => k.productIds?.includes(p.id))
            const storeList = stores.filter(s => (p.storeItems?.[s.id] || '').trim())
            return (
              <Fragment key={p.id}>
                <tr className="bg-blue-50/40 border-t border-gray-200">
                  <td colSpan={totalCols} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {p.sku && <span className="text-[11px] font-mono text-gray-400 shrink-0">{p.sku}</span>}
                        <span className="font-medium text-gray-800 truncate">{p.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{linked.length}キーワード</span>
                      </div>
                      <Link
                        to={`/product-rankings?product=${p.id}`}
                        className="shrink-0 text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                      >
                        詳細 →
                      </Link>
                    </div>
                  </td>
                </tr>
                {linked.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    <td colSpan={totalCols} className="px-4 py-2 pl-8 text-xs text-gray-300">紐づくキーワードがありません</td>
                  </tr>
                ) : linked.map(kw => keywordRows(kw, p.id, storeList))}
              </Fragment>
            )
          })}

          {unlinked.length > 0 && (
            <Fragment>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={totalCols} className="px-4 py-2 font-medium text-gray-600">
                  商品に紐づけないキーワード
                  <span className="ml-2 text-xs font-normal text-gray-400">店舗単位の順位・{unlinked.length}キーワード</span>
                </td>
              </tr>
              {unlinked.map(kw => keywordRows(kw, null, stores))}
            </Fragment>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** 順位セル。順位帯で色分け：1〜10位=緑、11〜30位=黄、31位以降=無色、圏外=灰、データ無し=「-」 */
function RankCell({ r }) {
  if (!r) {
    return <td className="px-1 py-1.5 text-center text-gray-200 border-l border-gray-50">-</td>
  }
  if (r.rank == null) {
    return <td className="px-1 py-1.5 text-center text-[10px] text-gray-400 bg-gray-100/80 border-l border-gray-50">圏外</td>
  }
  const band = r.rank <= 10 ? 'bg-green-50 text-green-800 font-semibold'
    : r.rank <= 30 ? 'bg-yellow-50 text-yellow-800'
    : 'text-gray-700'
  return <td className={`px-1 py-1.5 text-center font-mono text-xs border-l border-gray-50 ${band}`}>{r.rank}</td>
}

function Legend() {
  return (
    <div className="px-4 sm:px-6 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
      <span>数字は順位</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-50 border border-green-100" />1〜10位</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-50 border border-yellow-100" />11〜30位</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" />圏外（101位以降）</span>
      <span>「-」はその日のデータなし</span>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="px-6 py-5 space-y-3.5" aria-busy="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-5 animate-pulse">
          <div className="h-3.5 bg-gray-100 rounded w-40" />
          <div className="h-3.5 bg-gray-100 rounded w-24" />
          <div className="h-3.5 bg-gray-100 rounded w-8" />
          <div className="h-3.5 bg-gray-100 rounded w-8" />
          <div className="h-3.5 bg-gray-100 rounded w-8" />
          <div className="h-3.5 bg-gray-100 rounded w-8" />
          <div className="h-3.5 bg-gray-100 rounded w-8" />
          <div className="h-3.5 bg-gray-100 rounded w-8" />
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
