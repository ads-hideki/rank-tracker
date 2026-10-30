import { STORES } from './stores'

/**
 * 登録上限と実行時間の見積もり。
 *
 * 「ジョブ」= キーワード × 商品 × 店舗 の1回の検索。
 *   - 商品に紐づいたキーワード: その商品に商品コードが入っている店舗の数ぶん
 *   - 紐づけなしのキーワード  : 全店舗ぶん（店舗単位の一致で探す）
 * この計算は scraper/main.py のループと同じにしてある。
 *
 * 1ジョブ約7.5秒は 2026-10-28 のVPS実測（209ジョブ=26分、3並列）。
 */
export const SECONDS_PER_JOB = 7.5

export const DEFAULT_LIMITS = {
  maxKeywordsPerProduct: 3,   // 商品1つに紐づけられるキーワード数
  maxUnlinkedKeywords:   20,  // 商品に紐づけないキーワードの総数
  maxTotalJobs:          1000, // 全体のジョブ数（0 = 無制限）
  maxRank:               50,  // 追跡する順位の上限（これを超えたら「圏外」）。scraper/main.py が参照
}

const isActive = x => x?.active !== false

/** 商品1件で検索対象になる店舗数（商品コードが入っている店舗のみ） */
export function storeCountOf(storeItems) {
  return STORES.filter(s => (storeItems?.[s.id] || '').trim()).length
}

/** キーワード1件が消費するジョブ数 */
export function jobsForKeyword(kw, productMap) {
  const ids = kw.productIds || []
  if (ids.length === 0) return STORES.length
  return ids.reduce((sum, pid) => {
    const p = productMap[pid]
    return p && isActive(p) ? sum + storeCountOf(p.storeItems) : sum
  }, 0)
}

/** 全キーワードの合計ジョブ数 */
export function estimateJobs(keywords, products) {
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  return keywords.filter(isActive).reduce((sum, kw) => sum + jobsForKeyword(kw, productMap), 0)
}

export function estimateMinutes(jobs) {
  return Math.round(jobs * SECONDS_PER_JOB / 60)
}

/** 商品IDごとの紐づきキーワード数 */
export function keywordCountByProduct(keywords, excludeKeywordId = null) {
  const counts = {}
  for (const kw of keywords) {
    if (!isActive(kw) || kw.id === excludeKeywordId) continue
    for (const pid of kw.productIds || []) counts[pid] = (counts[pid] || 0) + 1
  }
  return counts
}

/** 紐づけなしキーワードの数 */
export function unlinkedCount(keywords, excludeKeywordId = null) {
  return keywords.filter(kw => isActive(kw) && kw.id !== excludeKeywordId && !(kw.productIds?.length)).length
}

/**
 * キーワードを productIds に紐づけて保存してよいか判定する。
 * keywordId が null なら新規追加、指定があればそのキーワードの編集。
 * 戻り値 { ok: true } または { ok: false, reason: '...' }
 */
export function checkKeywordAssignment({ keywords, products, limits, keywordId = null, productIds }) {
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const ids = productIds || []

  if (ids.length === 0) {
    const n = unlinkedCount(keywords, keywordId)
    if (n + 1 > limits.maxUnlinkedKeywords) {
      return { ok: false, reason: `商品に紐づけないキーワードは ${limits.maxUnlinkedKeywords} 件までです（現在 ${n} 件）` }
    }
  } else {
    const counts = keywordCountByProduct(keywords, keywordId)
    for (const pid of ids) {
      const n = counts[pid] || 0
      if (n + 1 > limits.maxKeywordsPerProduct) {
        const name = productMap[pid]?.name ?? pid
        return { ok: false, reason: `「${name}」のキーワードは ${limits.maxKeywordsPerProduct} 個までです（現在 ${n} 個）` }
      }
    }
  }

  if (limits.maxTotalJobs > 0) {
    const others = keywords.filter(kw => kw.id !== keywordId)
    const total  = estimateJobs(others, products) + jobsForKeyword({ productIds: ids }, productMap)
    if (total > limits.maxTotalJobs) {
      return { ok: false, reason: `全体のジョブ数が上限 ${limits.maxTotalJobs} を超えます（登録後 ${total} 件・約${estimateMinutes(total)}分）` }
    }
  }
  return { ok: true }
}

/** 新規商品に keywordIds を紐づけて登録してよいか判定する。 */
export function checkNewProduct({ keywords, products, limits, storeItems, keywordIds }) {
  const n = keywordIds.length
  if (n > limits.maxKeywordsPerProduct) {
    return { ok: false, reason: `商品1つに紐づけられるキーワードは ${limits.maxKeywordsPerProduct} 個までです（${n} 個選択中）` }
  }
  if (limits.maxTotalJobs > 0 && n > 0) {
    const total = estimateJobs(keywords, products) + n * storeCountOf(storeItems)
    if (total > limits.maxTotalJobs) {
      return { ok: false, reason: `全体のジョブ数が上限 ${limits.maxTotalJobs} を超えます（登録後 ${total} 件・約${estimateMinutes(total)}分）` }
    }
  }
  return { ok: true }
}

/** CSV 一括登録（紐づけなし）で受け付けられる件数 */
export function unlinkedCapacity({ keywords, products, limits }) {
  const byUnlinked = Math.max(0, limits.maxUnlinkedKeywords - unlinkedCount(keywords))
  if (limits.maxTotalJobs <= 0) return byUnlinked
  const byJobs = Math.max(0, Math.floor((limits.maxTotalJobs - estimateJobs(keywords, products)) / STORES.length))
  return Math.min(byUnlinked, byJobs)
}
