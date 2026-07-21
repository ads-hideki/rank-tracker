import { Fragment } from 'react'
import { STORES } from '../lib/stores'

function Diff({ value }) {
  if (value == null) return <span className="text-gray-300">-</span>
  if (value === 0)   return <span className="text-gray-400 text-xs">変動なし</span>
  if (value < 0)     return <span className="text-green-600 font-semibold text-xs">▲{Math.abs(value)}</span>
  return               <span className="text-red-500 font-semibold text-xs">▼{value}</span>
}

export default function RankTable({ keywords, rankings }) {
  // Step1: keywordId+storeId+date ごとに最良順位（rank が最小）を選ぶ
  // 同じキーワード×店舗に複数商品がある場合、最も順位が高い（数字が小さい）ものを採用
  const bestByDateKey = {}
  for (const r of rankings) {
    const key = `${r.keywordId}_${r.storeId}_${r.date}`
    const cur = bestByDateKey[key]
    if (!cur) {
      bestByDateKey[key] = r
    } else if (r.rank != null && (cur.rank == null || r.rank < cur.rank)) {
      bestByDateKey[key] = r
    }
  }

  // Step2: keywordId+storeId ごとに日付降順で最新・前日を取得
  const sortedBest = Object.values(bestByDateKey).sort((a, b) => b.date.localeCompare(a.date))
  const latest = {}
  const prev   = {}
  for (const r of sortedBest) {
    const key = `${r.keywordId}_${r.storeId}`
    if (!latest[key]) { latest[key] = r; continue }
    if (!prev[key])     prev[key] = r
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              キーワード
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
            <th />
            {STORES.map(s => (
              <Fragment key={s.id}>
                <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal border-l border-gray-200">順位</th>
                <th className="px-3 py-2 text-center text-xs text-gray-400 font-normal">前日比</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {keywords.map(kw => (
            <tr key={kw.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">{kw.text}</td>
              {STORES.map(s => {
                const key  = `${kw.id}_${s.id}`
                const l    = latest[key]
                const p    = prev[key]
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
