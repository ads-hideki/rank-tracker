"""
過去の rankings から日次サマリー daily/{date} を作る（一度だけ実行する補助スクリプト）。

ダッシュボードは以前 rankings を直接読んでいた（8日分 ≒ 3,000〜4,000 ドキュメント/表示）ため、
Firestore 無料枠の読み取り上限（5万/日）を使い切った。main.py が毎日 daily/{date} に
その日の全結果を1ドキュメントにまとめて書くようにし、ダッシュボードはそれを読む（8日で8読み取り）。
このスクリプトは、その仕組みを入れる前の日付ぶんを埋めるためのもの。

使い方（VPS）: ../.venv/bin/python backfill_daily.py --days 10 [--dry-run]
"""
import argparse, sys, io, warnings
warnings.filterwarnings("ignore")
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from datetime import datetime, timezone, timedelta
from firebase_client import get_db, build_daily_entries, write_daily_summary

p = argparse.ArgumentParser()
p.add_argument("--days", type=int, default=10)
p.add_argument("--dry-run", action="store_true")
a = p.parse_args()

db = get_db()
JST = timezone(timedelta(hours=9))
today = datetime.now(JST).date()
for i in range(a.days):
    d = (today - timedelta(days=i)).isoformat()
    rows = [x.to_dict() for x in db.collection("rankings").where("date", "==", d).stream()]
    entries = build_daily_entries(rows)
    print(f"{d}: rankings {len(rows)} 件 → entries {len(entries)} 件" + ("（dry-run）" if a.dry_run else ""))
    if rows and not a.dry_run:
        write_daily_summary(d, entries, note="backfill")
print("完了")
