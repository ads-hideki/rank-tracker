import { Fragment, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useProducts } from '../hooks/useProducts'
import { useKeywords } from '../hooks/useKeywords'
import { useProductRankings } from '../hooks/useRankings'
import { STORES, STORE_COLORS } from '../lib/stores'

// rankings（30日分）からグラフ用データを生成
// [{ date: '2026-05-01', annekor: 5, annekor22: null, annekor_yahoo: 12 }, ...]
function buildChartData(kwRankings, activeStores) {
  const byDate = {}
  for (const r of kwRankings) {
    if (!byDate[r.date]) byDate[r.date] = {}
    byDate[r.date][r.storeId] = r.rank ?? null
  }
  return Object.keys(byDate)
    .sort()
    .map(d => ({
      date: d,
      ...Object.fromEntries(activeStores.map(s => [s.id, byDate[d]?.[s.id] ?? null])),
    }))
}

function KeywordDetail({ kwId, rankings, activeStores }) {
  const kwRankings = rankings.filter(r => r.keywordId === kwId)
  const chartData = buildChartData(kwRankings, activeStores)

  if (chartData.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-gray-400 text-sm bg-gray-50">
        過去30日間のデータがありません
      </div>
    )
  }

  const tableRows = [...chartData].reverse()

  return (
    <div className="px-4 sm:px-6 py-5 bg-gray-50 border-t border-gray-100">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={d => d.slice(5)}
          />
          <YAxis
            reversed
            domain={[1, 'auto']}
            tickFormatter={v => `${v}位`}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={42}
          />
          <Tooltip
            formatter={(value, name) => [
              value != null ? `${value}位` : '圏外',
              STORES.find(s => s.id === name)?.label ?? name,
            ]}
          />
          <Legend
            formatter={name => STORES.find(s => s.id === name)?.label ?? name}
            wrapperStyle={{ fontSize: 11 }}
          />
          {activeStores.map(s => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              stroke={STORE_COLORS[s.id]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-5 text-left text-gray-500 font-medium">日付</th>
              {activeStores.map(s => (
                <th key={s.id} className="py-2 px-4 text-center font-medium" style={{ color: STORE_COLORS[s.id] }}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableRows.map(row => (
              <tr key={row.date} className="hover:bg-white">
                <td className="py-1.5 pr-5 text-gray-500 font-mono">{row.date}</td>
                {activeStores.map(s => (
                  <td key={s.id} className="py-1.5 px-4 text-center font-mono text-gray-700">
                    {row[s.id] != null ? `${row[s.id]}位` : <span className="text-gray-300">-</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Diff({ value }) {
  if (value == null) return <span className="text-gray-300">-</span>
  if (value === 0)   return <span className="text-gray-400 text-xs">変動なし</span>
  if (value < 0)     return <span className="text-green-600 font-semibold text-xs">▲{Math.abs(value)}</span>
  return               <span className="text-red-500 font-semibold text-xs">▼{value}</span>
}

export default function ProductRankings() {
  const { products, loading: prodLoading } = useProducts()
  const { keywords, loading: kwLoading } = useKeywords()
  const [selectedProductId, setSelectedProductId] = useState('')
  const [expandedKwId, setExpandedKwId] = useState(null)

  const sortedProducts = [...products].sort((a, b) => {
    if (!a.sku && !b.sku) return 0
    if (!a.sku) return 1
    if (!b.sku) return -1
    return a.sku.localeCompare(b.sku, 'ja')
  })
  const selectedProduct = products.find(p => p.id === selectedProductId)
  const { rankings, loading: rankLoading, error: rankError } = useProductRankings(selectedProductId)

  const linkedKeywords = keywords.filter(k => k.productIds?.includes(selectedProductId))
  const activeStores = STORES.filter(s => selectedProduct?.storeItems?.[s.id])

  const sorted = [...rankings].sort((a, b) => b.date.localeCompare(a.date))
  const latestMap = {}
  const prevMap = {}
  for (const r of sorted) {
    const key = `${r.keywordId}_${r.storeId}`
    if (!latestMap[key]) { latestMap[key] = r; continue }
    if (!prevMap[key])     prevMap[key] = r
  }

  const toggleExpand = (kwId) => {
    setExpandedKwId(prev => prev === kwId ? null : kwId)
  }

  const totalCols = 1 + activeStores.length * 2

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-6">商品別順位確認</h2>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <label className="block text-xs font-medium text-gray-500 mb-1">商品を選択</label>
        <select
          value={selectedProductId}
          onChange={e => { setSelectedProductId(e.target.value); setExpandedKwId(null) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-72"
        >
          <option value="">商品を選択してください</option>
          {sortedProducts.map(p => (
            <option key={p.id} value={p.id}>
              {p.sku ? `[${p.sku}] ` : ''}{p.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedProductId && !prodLoading && (
        <div className="text-center py-20 text-gray-400 text-sm">
          上から商品を選択してください
        </div>
      )}

      {selectedProductId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{selectedProduct?.name}</h3>
              {selectedProduct?.sku && (
                <p className="text-xs text-gray-400 mt-0.5">SKU: {selectedProduct.sku}</p>
              )}
            </div>
            <span className="text-xs text-gray-400">{linkedKeywords.length}件のキーワード</span>
          </div>

          {rankError ? (
            <p className="px-6 py-10 text-center text-red-500 text-sm">
              データ取得エラー: {rankError}
            </p>
          ) : rankLoading || kwLoading ? (
            <p className="px-6 py-10 text-center text-gray-400 text-sm">読み込み中...</p>
          ) : linkedKeywords.length === 0 ? (
            <p className="px-6 py-10 text-center text-gray-400 text-sm">
              この商品に紐づくキーワードがありません。<br />
              「キーワード管理」でキーワード登録時に商品を紐づけてください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[560px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      キーワード
                    </th>
                    {activeStores.map(s => (
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
                    <th className="px-5 py-2 text-left text-xs text-gray-400 font-normal">
                      行をクリックで推移を表示
                    </th>
                    {activeStores.map(s => (
                      <Fragment key={s.id}>
                        <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal border-l border-gray-200">順位</th>
                        <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal">前日比</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linkedKeywords.map(kw => {
                    const isOpen = expandedKwId === kw.id
                    return (
                      <Fragment key={kw.id}>
                        <tr
                          className="hover:bg-blue-50 transition-colors cursor-pointer border-b border-gray-100"
                          onClick={() => toggleExpand(kw.id)}
                        >
                          <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              <span
                                className="text-gray-400 text-[10px] transition-transform duration-150 inline-block"
                                style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                              >
                                ▶
                              </span>
                              {kw.text}
                            </span>
                          </td>
                          {activeStores.map(s => {
                            const key  = `${kw.id}_${s.id}`
                            const l    = latestMap[key]
                            const p    = prevMap[key]
                            const rank = l?.rank ?? null
                            const diff = rank != null && p?.rank != null ? rank - p.rank : null
                            return (
                              <Fragment key={s.id}>
                                <td className="px-3 py-3 text-center text-gray-900 font-mono border-l border-gray-100">
                                  {rank != null ? `${rank}位` : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <Diff value={diff} />
                                </td>
                              </Fragment>
                            )
                          })}
                        </tr>

                        {isOpen && (
                          <tr className="border-b border-gray-200">
                            <td colSpan={totalCols} className="p-0">
                              <KeywordDetail
                                kwId={kw.id}
                                rankings={rankings}
                                activeStores={activeStores}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
