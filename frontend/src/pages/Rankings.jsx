import { useState } from 'react'
import { useKeywords } from '../hooks/useKeywords'
import { useKeywordHistory, useLatestRankings } from '../hooks/useRankings'
import { STORES } from '../lib/stores'
import RankChart from '../components/RankChart'
import RankTable from '../components/RankTable'

export default function Rankings() {
  const { keywords, loading: kwLoading } = useKeywords()
  const { rankings: latestRankings, loading: latestLoading } = useLatestRankings()

  const [selectedKeywordId, setSelectedKeywordId] = useState('')
  const [selectedStoreId, setSelectedStoreId]   = useState('')
  const [days, setDays] = useState(30)

  const { rankings: history, loading: historyLoading } = useKeywordHistory(selectedKeywordId, days)

  const filteredKeywords = selectedKeywordId
    ? keywords.filter(k => k.id === selectedKeywordId)
    : keywords

  const filteredRankings = selectedStoreId
    ? latestRankings.filter(r => r.storeId === selectedStoreId)
    : latestRankings

  const chartRankings = selectedStoreId
    ? history.filter(r => r.storeId === selectedStoreId)
    : history

  return (
    <div className="p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-6">順位詳細</h2>

      {/* フィルターバー */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-end">
        <FilterSelect
          label="キーワード"
          value={selectedKeywordId}
          onChange={setSelectedKeywordId}
          placeholder="すべて"
        >
          {keywords.map(kw => (
            <option key={kw.id} value={kw.id}>{kw.text}</option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="店舗"
          value={selectedStoreId}
          onChange={setSelectedStoreId}
          placeholder="すべて"
        >
          {STORES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="期間（グラフ）"
          value={days}
          onChange={v => setDays(Number(v))}
        >
          <option value={7}>7日間</option>
          <option value={30}>30日間</option>
          <option value={90}>90日間</option>
        </FilterSelect>
      </div>

      {/* 順位推移グラフ（キーワード選択時のみ表示） */}
      {selectedKeywordId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            順位推移 — {keywords.find(k => k.id === selectedKeywordId)?.text}
          </h3>
          {historyLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>
          ) : (
            <RankChart
              rankings={chartRankings}
              storeIds={selectedStoreId ? [selectedStoreId] : undefined}
            />
          )}
        </div>
      )}

      {/* 順位一覧テーブル */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">順位一覧（最新）</h3>
          <span className="text-xs text-gray-400">{filteredKeywords.length}件</span>
        </div>
        {kwLoading || latestLoading ? (
          <p className="px-6 py-10 text-center text-gray-400 text-sm">読み込み中...</p>
        ) : filteredKeywords.length === 0 ? (
          <p className="px-6 py-10 text-center text-gray-400 text-sm">
            {keywords.length === 0 ? 'キーワードが登録されていません' : '条件に一致するキーワードがありません'}
          </p>
        ) : (
          <RankTable keywords={filteredKeywords} rankings={filteredRankings} />
        )}
      </div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, placeholder, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
    </div>
  )
}
