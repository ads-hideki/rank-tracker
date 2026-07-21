import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { STORES, STORE_COLORS } from '../lib/stores'

export default function RankChart({ rankings, storeIds }) {
  const dateMap = {}
  for (const r of rankings) {
    if (!dateMap[r.date]) dateMap[r.date] = { date: r.date }
    if (r.rank != null) dateMap[r.date][r.storeId] = r.rank
  }
  const data = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  const activeStores = STORES.filter(s => !storeIds || storeIds.includes(s.id))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        データがありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickFormatter={d => d.slice(5)}
        />
        <YAxis
          reversed
          domain={[1, 'auto']}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          label={{ value: '順位', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#9ca3af' } }}
        />
        <Tooltip
          formatter={(val, name) => [`${val}位`, name]}
          labelFormatter={l => `日付: ${l}`}
        />
        <Legend />
        {activeStores.map(store => (
          <Line
            key={store.id}
            type="monotone"
            dataKey={store.id}
            name={store.label}
            stroke={STORE_COLORS[store.id]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
