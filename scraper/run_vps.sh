#!/usr/bin/env bash
# =====================================================================
# さくらVPS の cron から呼ばれる実行スクリプト
#
# 楽天・Yahoo ともデータセンター(GitHub Actions / GCP)のIPからは検索結果を
# 取得できない(全件「圏外」になる)ため、スクレイパーは VPS 上で直接動かす。
# VPS の IP からは社内PCと同じ結果が取れることを 2026-10-28 に確認済み。
#
# 配置: ~/rank-tracker (このリポジトリの clone)、venv は ~/rank-tracker/.venv
# 鍵  : ~/rank-tracker/scraper/serviceAccountKey.json (chmod 600、Git管理外)
# cron: bash ~/rank-tracker/scraper/run_vps.sh >> ~/rank-tracker/cron.log 2>&1
#
# 毎回 git pull するので、修正はこれまで通り GitHub に push すれば次回実行から反映される。
# =====================================================================
set -u
cd "$(dirname "$0")/.."

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 開始 ====="
git pull -q --ff-only || echo "git pull 失敗（前回のコードのまま続行）"
.venv/bin/pip install -q -r scraper/requirements.txt || echo "pip install 失敗（続行）"

cd scraper
../.venv/bin/python main.py --platform all
STATUS=$?

# 30日より古いログは削除
find logs -name '*.log' -mtime +30 -delete 2>/dev/null
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 終了 (exit=$STATUS) ====="
exit $STATUS
