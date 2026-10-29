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
 * 店舗2（annekor22）の商品管理番号を rakuten2_sku から導く。
 * rakuten2_sku は「ページの管理番号 + バリエーション記号」の形（例: ads_001A, ads_058A_l, ads_007c）なので、
 * 末尾の大文字のバリエーション記号とそれ以降（_l など）を落とす。
 *   ads_001A → ads_001 / ads_058A_l → ads_058 / ads_060A_3 → ads_060 / ads_007c → ads_007
 * ※ annekor（店舗1）の manage_number とは別物。店舗1だけ ads_sn21008_m / ads_002_l / ads_051_1 の
 *   ような独自コードになっている商品があり、その場合 annekor22 は素の ads_NNN になる（2026-10-29 実URLで検証）。
 */
export function stemRakuten2(sku) {
  const s = clean(sku)
  if (!s) return ''
  const upper = s.replace(/[A-Z]+[A-Za-z0-9_]*$/, '')
  if (upper !== s) return upper
  return s.replace(/(?<=\d)[a-z]$/, '')   // 小文字1文字のバリエーション記号（ads_007c）
}

/**
 * SKU の一覧 → 商品候補の一覧。
 * 対象外: deleted / hidden、楽天・Yahoo どちらのコードも無いもの。
 * 名前に「旧」を含むものは old: true を付けて返す（取り込み側で除外する）。
 *
 * annekor22 は rakuten2_sku の stem を使う。manage_number と食い違う場合は両方を
 * annekor22Candidates に入れて needsReview: true を付け、取り込み画面で選べるようにする
 * （201-a / 201-b のように店舗2でもページが分かれている商品はデータだけでは判別できないため）。
 * 店舗2の SKU が1つも無い商品は annekor22 を空欄にする（その店舗は取得対象外）。
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
    if (!groups.has(key)) groups.set(key, { mn, pc, names: new Map(), skus: [], r2: new Map(), r2sales: false })
    const g = groups.get(key)
    const name = clean(x.name)
    g.names.set(name, (g.names.get(name) || 0) + 1)
    g.skus.push(String(x._id))
    const stem = stemRakuten2(x.rakuten2_sku)
    if (stem) g.r2.set(stem, (g.r2.get(stem) || 0) + 1)
    if (x.rakuten2_30 != null) g.r2sales = true     // 店舗2に30日売上の記録がある＝出品されている
  }

  const mostCommon = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const bare = s => s.replace(/_/g, '').toLowerCase()   // ads059 と ads_059 を同一視するため

  return [...groups.values()].map(g => {
    const tepsName = mostCommon(g.names)
    const code = g.pc || g.mn
    const num  = code.replace(/^ads_?/i, '')
    const stem = mostCommon(g.r2)                       // '' = 店舗2の SKU が未登録

    // annekor22 の決め方（2026-10-29 に 93 商品を実URLで検証して決めたルール）
    //  1. stem と manage_number が下線の有無だけの違いなら manage_number（店舗コードは ads_NNN 形式で統一されている）
    //  2. stem が無ければ manage_number を仮置きし「要確認」
    //  3. stem と manage_number が違えば stem を既定にして「要確認」（201-a/201-b のように店舗2でもページが分かれる商品がある）
    //  4. 店舗2の売上記録が1つも無い商品は出品されていない可能性があるので「要確認」
    let annekor22, needsReview
    if (stem && bare(stem) === bare(g.mn)) { annekor22 = g.mn;  needsReview = false }
    else if (!stem)                        { annekor22 = g.mn;  needsReview = true }
    else                                   { annekor22 = stem;  needsReview = stem !== g.mn }
    if (!g.r2sales) needsReview = true
    const candidates = [...new Set([annekor22, stem, g.mn].filter(Boolean))]

    return {
      sku: code,
      name: `${num} ${tepsName}`.trim(),
      tepsName,
      storeItems: { annekor: g.mn, annekor22, annekor_yahoo: g.pc },
      annekor22Candidates: candidates,
      needsReview,
      reviewNote: !g.r2sales ? '店舗2の売上記録なし（出品されていない可能性）' : (!stem ? '店舗2のSKU未登録' : '候補が複数'),
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
