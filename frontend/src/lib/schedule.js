/**
 * 自動取得の開始時刻（JST）。VPS の cron と合わせること（crontab: `0 3 * * *`）。
 *
 * 2026-10-30 に 07:00 → 03:00 へ変更。理由: VPS では 08:00 に TēPs の重い更新（約13分）が動き、
 * 商品・キーワードが増えて実行が長くなると 08:00 台に食い込むため。
 * 01〜05時は他のジョブがほぼ無く、上限いっぱい（約125分）でも 06:00 の同期に届かない。
 */
export const RUN_HOUR = 3
export const RUN_MINUTE = 0
export const RUN_TIME_LABEL = `${String(RUN_HOUR).padStart(2, '0')}:${String(RUN_MINUTE).padStart(2, '0')}`

/** 開始時刻から minutes 分後の時刻を「HH:MM」で返す。 */
export function endTimeAfter(minutes) {
  const total = RUN_HOUR * 60 + RUN_MINUTE + minutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
