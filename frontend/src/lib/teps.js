/**
 * TēPs（売上・在庫管理 https://teps-2.web.app）の商品マスタ sku_master から
 * 検索順位トラッカーの商品候補を作る。
 *
 * TēPs は色・サイズ単位（SKU）だが、楽天・Yahoo の検索順位はページ単位なので
 * 以下の2項目の組でまとめる（実URLで確認済み 2026-10-29）:
 *   manage_number … 楽天の商品管理番号 = item.rakuten.co.jp/{店舗}/{manage_number}/（annekor / annekor22 共通）
 *   product_code  … Yahoo の商品コード   = store.shopping.yahoo.co.jp/annekor1/{product_code}.html
 *
 * 品番は product_code（今の商品マスタの品番と同じ形式: ads001, ads060-5, ads201-a）、
 * 商品名は「番号 TēPsの商品名」（例: 060-5 引っ越しギフト）。
 *
 * TēPs の Firestore は sku_master が読み取り公開されているため、ブラウザから REST で直接読める。
 * apiKey は Firebase の Web 用キー（TēPs のバンドルにも含まれる公開値）だが、
 * 公開リポジトリのソースには置かず .env.local（VITE_TEPS_API_KEY、Git 管理外）から読む。
 * GCP 側ではこのキーに HTTP リファラ制限（teps-2.web.app / annekor-rank-tracker.web.app）をかけること。
 */
export const TEPS = {
  projectId: 'teps-2',
  apiKey: import.meta.env.VITE_TEPS_API_KEY || '',
  url: 'https://teps-2.web.app/',
}

const BASE = `https://firestore.googleapis.com/v1/projects/${TEPS.projectId}/databases/(default)/documents/sku_master`

/** Firestore REST の値表現を素の JS 値に */
function val(v) {
  if (!v || typeof v !== 'object') return v
  if ('stringValue' in v)    return v.stringValue
  if ('integerValue' in v)   return parseInt(v.integerValue, 10)
  if ('doubleValue' in v)    return v.doubleValue
  if ('booleanValue' in v)   return v.booleanValue
  if ('nullValue' in v)      return null
  if ('timestampValue' in v) return v.timestampValue
  if ('mapValue' in v)       return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)]))
  if ('arrayValue' in v)     return (v.arrayValue.values || []).map(val)
  return v
}

/** sku_master を全件取得（ページング）。 */
export async function fetchTepsSkuMaster() {
  if (!TEPS.apiKey) throw new Error('TēPs の API キーが設定されていません（frontend/.env.local の VITE_TEPS_API_KEY）')
  const docs = []
  let token = null
  do {
    const url = `${BASE}?pageSize=300&key=${TEPS.apiKey}` + (token ? `&pageToken=${encodeURIComponent(token)}` : '')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TēPs の読み込みに失敗しました (HTTP ${res.status})`)
    const data = await res.json()
    for (const d of data.documents || []) {
      docs.push({ _id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)])) })
    }
    token = data.nextPageToken || null
  } while (token)
  return docs
}

const clean = s => (s == null ? '' : String(s)).trim()

/**
 * SKU の一覧 → 商品候補の一覧。
 * 対象外: deleted / hidden、楽天・Yahoo どちらのコードも無いもの。
 * 名前に「旧」を含むものは old: true を付けて返す（取り込み側で除外する）。
 */
export function buildCandidates(docs) {
  const live = docs
    .filter(x => !x.deleted && !x.hidden)
    .sort((a, b) => String(a._id).localeCompare(String(b._id), 'ja'))

  const groups = new Map()
  for (const x of live) {
    const mn = clean(x.manage_number)
    const pc = clean(x.product_code)
    if (!mn && !pc) continue
    const key = `${mn}|${pc}`
    if (!groups.has(key)) groups.set(key, { mn, pc, names: new Map(), skus: [] })
    const g = groups.get(key)
    const name = clean(x.name)
    g.names.set(name, (g.names.get(name) || 0) + 1)
    g.skus.push(String(x._id))
  }

  return [...groups.values()].map(g => {
    const tepsName = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    const code = g.pc || g.mn
    const num  = code.replace(/^ads_?/i, '')
    return {
      sku: code,
      name: `${num} ${tepsName}`.trim(),
      tepsName,
      storeItems: { annekor: g.mn, annekor22: g.mn, annekor_yahoo: g.pc },
      variants: g.skus,
      old: /旧/.test(tepsName),
    }
  })
}

const norm = s => clean(s).toLowerCase()
const codeKey = si => `${norm(si?.annekor)}|${norm(si?.annekor22)}|${norm(si?.annekor_yahoo)}`

/**
 * 候補を「新規」と「登録済み」に分ける。
 * 品番が一致するか、3店舗の商品コードがすべて一致すれば登録済みとみなす
 * （例: 既存の品番 ads060 は Yahoo コード ads060-5 を持つので、候補 ads060-5 と同一扱い）。
 */
export function splitNewAndExisting(candidates, products) {
  const skus  = new Set(products.map(p => norm(p.sku)).filter(Boolean))
  const codes = new Set(products.map(p => codeKey(p.storeItems)))
  const fresh = [], existing = []
  for (const c of candidates) {
    if (skus.has(norm(c.sku)) || codes.has(codeKey(c.storeItems))) existing.push(c)
    else fresh.push(c)
  }
  return { fresh, existing }
}
