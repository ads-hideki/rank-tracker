import { useState, useEffect } from 'react'
import { useKeywords } from '../hooks/useKeywords'
import { useProducts } from '../hooks/useProducts'
import { useSettings } from '../hooks/useSettings'
import { useScrapeRequest } from '../hooks/useScrapeRequest'
import { PlatformStatus } from '../components/ScrapeStatus'
import { estimateJobs, estimateMinutes, unlinkedCount, SECONDS_PER_JOB } from '../lib/limits'

/**
 * 設定ページ。自動取得の実行状況と、登録上限（取得設定）の表示・変更。
 * 上限は Firestore system/settings に保存され、キーワード・商品の登録画面とスクレイパーが参照する。
 */
export default function Settings() {
  const { keywords } = useKeywords()
  const { products } = useProducts()
  const { limits, loaded, updateLimits } = useSettings()
  const { status } = useScrapeRequest()

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
      await updateLimits(next)
      setMsg('保存しました')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h2 className="text-lg font-bold text-gray-900 mb-6">設定</h2>

      {/* 自動取得ステータス（楽天・Yahoo 別軸）*/}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">自動取得ステータス</h3>
          <span className="text-[11px] text-gray-400">毎日 07:00 にVPSで自動実行</span>
        </div>
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

      {/* 現在の登録量 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">現在の登録量</h3>
        <div className="text-sm space-y-2">
          <Row label="想定ジョブ数">
            <span className={`font-semibold ${overJobs ? 'text-red-600' : 'text-gray-800'}`}>
              {jobs} 件
              <span className="font-normal text-gray-400"> / {limits.maxTotalJobs > 0 ? `${limits.maxTotalJobs} 件` : '無制限'}</span>
            </span>
          </Row>
          <Row label="想定実行時間">
            <span className="font-semibold text-gray-800">
              約 {minutes} 分
              <span className="font-normal text-gray-400">（07:00 開始なら {endTime(minutes)} 完了）</span>
            </span>
          </Row>
          <Row label="紐づけなしキーワード">
            <span className="font-semibold text-gray-800">
              {unlinked} 件<span className="font-normal text-gray-400"> / {limits.maxUnlinkedKeywords} 件</span>
            </span>
          </Row>
          {overJobs && (
            <p className="text-xs text-red-600 pt-1">上限を超えています。キーワードを減らすか上限を見直してください。</p>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          1ジョブ＝キーワード×商品×店舗の検索1回（約{SECONDS_PER_JOB}秒・VPS実測）。
          商品に紐づけないキーワードは全店舗を検索するため1件で3ジョブ。
        </p>
      </div>

      {/* 上限の変更 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">登録上限</h3>
        <p className="text-xs text-gray-400 mb-4">
          キーワード・商品の登録画面で、この上限を超える操作は保存できません。
          変更は保存した時点から有効です（スクレイパーの再起動などは不要）。
        </p>
        <div className="text-sm space-y-3">
          <LimitInput label="商品あたりキーワード数" hint="1商品に紐づけられるキーワードの数" value={form.maxKeywordsPerProduct} onChange={setNum('maxKeywordsPerProduct')} unit="個" disabled={!loaded} />
          <LimitInput label="紐づけなしキーワード数" hint="商品に紐づけないキーワードの総数（CSV一括登録もここに含まれる）" value={form.maxUnlinkedKeywords} onChange={setNum('maxUnlinkedKeywords')} unit="件" disabled={!loaded} />
          <LimitInput label="全体ジョブ数" hint="1回の実行で検索する回数の上限。0 にすると無制限" value={form.maxTotalJobs} onChange={setNum('maxTotalJobs')} unit="件" disabled={!loaded} />
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={save}
            disabled={!dirty || saving || !loaded}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function LimitInput({ label, hint, value, onChange, unit, disabled }) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span>
        <span className="block text-gray-700">{label}</span>
        {hint && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min="0"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
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
