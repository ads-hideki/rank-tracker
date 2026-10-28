# 検索順位トラッカーシステム

楽天市場・Yahoo!ショッピングの検索結果から自社店舗商品のオーガニック検索順位を毎日取得し、
Firestore に保存して Web ダッシュボードで可視化するシステム。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `scraper/` | Python スクレイパー本体（毎日実行される） |
| `frontend/` | ダッシュボード（Vite + React + Tailwind） |
| `functions/` | Cloud Functions 版スクレイパー（オンデマンド実行用） |
| `public/` | frontend のビルド成果物（Firebase Hosting 配信、Git 管理外） |

### scraper の主なファイル

| ファイル | 役割 |
|---|---|
| `main.py` | エントリポイント。キーワード×商品×店舗を並列（3並列）で処理 |
| `rakuten_scraper.py` | 楽天の検索結果 HTML から順位を取得（PR枠を除外） |
| `yahoo_scraper.py` | Yahoo!ショッピングの検索結果 HTML から順位を取得 |
| `firebase_client.py` | Firestore 接続・キーワード/商品の取得・順位の保存 |
| `config.json` | 対象店舗と検索設定（取得ページ数、リクエスト間隔） |

## ローカル実行

```bash
cd scraper
pip install -r requirements.txt

# Firestore に保存せず結果だけ確認
python main.py --dry-run

# 本番実行
python main.py
```

ローカル実行には `scraper/serviceAccountKey.json`（Firebase サービスアカウント鍵）が必要。
このファイルは `.gitignore` で除外されており、**リポジトリには絶対にコミットしない**。

## 追跡範囲（100位まで）

順位の追跡対象は **100位以内**。101位以降は「圏外」として扱う（`rank: null` で保存）。

| 対象 | ページ数 | 走査件数 |
|---|---|---|
| 楽天 | 3ページ × 45件 | 135件（100位到達時点で打ち切り） |
| Yahoo | 4ページ × 30件 | 120件（同上） |

上限は各スクレイパーの `_MAX_RANK = 100` で制御している。
変更する場合は `_MAX_RANK` と `config.json` のページ数の**両方**を合わせること
（ページ数が足りないと 100位まで到達できない）。

## 登録上限（取得設定）

商品・キーワードが増えても実行時間が業務開始前に収まるよう、登録に上限を設けている。
上限はダッシュボードの「取得設定」カードから変更でき、Firestore `system/settings` に保存される。

| 設定 | 既定値 | 意味 |
|---|---|---|
| 商品あたりキーワード数 | 3 | 1商品に紐づけられるキーワードの数 |
| 紐づけなしキーワード数 | 20 | 商品に紐づけないキーワード（全店舗を店舗単位で検索、1件=3ジョブ）の総数 |
| 全体ジョブ数 | 1000（0=無制限） | 1回の実行で検索する回数の上限。約125分相当 |

- 「ジョブ」= キーワード × 商品 × 店舗（商品コードが入っている店舗のみ）の検索1回。1ジョブ約7.5秒（VPS実測）
- 判定は `frontend/src/lib/limits.js` に集約。キーワード追加・商品紐づけ編集・CSV一括登録・商品登録の各画面で保存前に判定し、超える場合は理由を表示して保存しない
- スクレイパー（`main.py`）も同じ計算で実行開始時に「想定◯件 / 約◯分」をログとダッシュボードに出す。上限超過は警告のみで実行は止めない（画面側で登録を止めているため）
- 商品100件 × 3キーワード × 3店舗 = 900ジョブ ≒ 約113分（07:00 開始なら 08:55 完了）

## 現在の運用：さくらVPS の cron（2026-10-28〜）

スクレイパーは **さくらVPS（ubuntu@153.126.152.122）** 上で `scraper/run_vps.sh` を cron から実行している。
PC には依存しない。

| 項目 | 内容 |
|---|---|
| 配置 | `~/rank-tracker`（このリポジトリの clone）、venv は `~/rank-tracker/.venv` |
| 鍵 | `~/rank-tracker/scraper/serviceAccountKey.json`（chmod 600、Git 管理外） |
| 実行 | `bash ~/rank-tracker/scraper/run_vps.sh >> ~/rank-tracker/cron.log 2>&1` |
| ログ | `~/rank-tracker/scraper/logs/<JST日付>.log`（30日で自動削除）、ラッパーは `~/rank-tracker/cron.log` |

`run_vps.sh` は毎回 `git pull` してから実行するので、**修正は GitHub に push すれば次回実行から反映される**。

```bash
# 手動実行（VPS 上で）
bash ~/rank-tracker/scraper/run_vps.sh

# cron の確認 / 編集
crontab -l
crontab -e
```

### なぜ VPS か（経緯）

- 社内 PC のタスクスケジューラで動かすと、実行中（約33分）は帯域と CPU を消費して PC が重くなる
- **GitHub Actions / GCP などデータセンターの IP は楽天・Yahoo にブロックされる**（HTTP 200 だが商品リストが空で返り、
  全件「圏外」として保存されてしまう。エラーにならないので気づきにくい）
  - 楽天は最初から、Yahoo は 2026-09-11 からブロック
- さくらVPS の IP からは社内 PC と同じ結果が取れることを確認済み（2026-10-28）

## GitHub Actions ワークフロー（停止中）

`.github/workflows/daily-rank-tracker.yml` は上記の理由で **schedule を無効化**してあり、手動実行（workflow_dispatch）だけ残している。
データセンター IP では順位が取れないため、**手動実行しても全件「圏外」で上書きされる**。通常は使わないこと。

以下は参考として残している当時の手順。

> GitHub Actions のスケジュール実行は、混雑状況によって数分〜数十分遅れることがある。
> 「10:00 ちょうど」が要件の場合はこの仕組みでは満たせない。
>
> また Actions のランナーはデータセンター IP から通信するため、楽天・Yahoo 側に
> ブロックされて全件「圏外」になる可能性がある。移行前に必ず dry-run で
> 社内実行の結果と突き合わせて確認すること。

### セットアップ手順

#### 1. Secret を登録する

GitHub リポジトリの **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | `scraper/serviceAccountKey.json` の中身**全文**（`{` から `}` まで）をそのまま貼り付け |

貼り付け時の注意:
- 整形・改行の削除は不要。JSON をそのままコピーする
- 前後に余計な空白や引用符を付けない
- ワークフロー側で JSON の妥当性を検証しているので、貼り付けミスがあれば実行時にエラーになる

#### 2. 動作確認する

**Actions タブ → 「検索順位トラッカー（毎日実行）」→ Run workflow**

初回は `dry_run` に**チェックを入れて**実行し、Firestore に書き込まずに
スクレイピングが成功するかを確認することを推奨。
ログは実行結果画面の Artifacts（`scraper-logs-<run_id>`）からダウンロードできる。

#### 3. 既存の Windows タスクスケジューラを停止する

現在この処理は社内 PC のタスクスケジューラ（`AnnekorRankTracker`、毎日 10:00）で動いている。
GitHub Actions が安定稼働することを確認できたら、**二重実行を避けるため**タスクを無効化する。

```powershell
Disable-ScheduledTask -TaskName 'AnnekorRankTracker'
```

### 実行環境の違いに関する注意（重要）

スクレイパーは楽天・Yahoo の検索結果ページを直接取得している。
GitHub Actions のランナーは**データセンター IP**から通信するため、社内 PC からの実行とは
結果が変わる可能性がある:

- アクセスがブロックされ、全キーワードが「圏外」になる
- 検索結果の並び順・パーソナライズが社内 IP と異なる

順位が急に全滅した場合はスクレイパーの不具合ではなく IP ブロックを疑うこと。
その場合は社内 PC のタスクスケジューラ運用を継続する（またはセルフホストランナーを検討する）。

## 手動実行について

ダッシュボード上の手動実行ボタンは、`scraper/watcher.py` を
タスクスケジューラ `AnnekorWatcher` が2分ごとに起動し、
Firestore の `system/scrapeRequest` が `pending` になったのを検知して動く仕組み。

このボタンは**不要**との判断により `AnnekorWatcher` は廃止する方針。
廃止後はボタンを押しても反応しない（`pending` のまま誰も拾わない）。

```powershell
# 管理者権限の PowerShell で実行
Unregister-ScheduledTask -TaskName 'AnnekorWatcher' -Confirm:$false
```

手動で実行したい場合は、ローカルで `python main.py` を直接叩く。

## Firestore のデータ構造

| コレクション | 内容 |
|---|---|
| `keywords` | 監視キーワード。`active: true` のものが対象。`productIds` で商品と紐づく |
| `products` | 商品。`storeItems` で店舗IDごとの商品IDを保持 |
| `rankings` | 取得結果。ドキュメントID = `{日付}_{店舗ID}_{キーワードID}[_{商品ID}]` |
| `system/scrapeRequest` | オンデマンド実行のリクエスト/ステータス管理 |

## デプロイ（ダッシュボード）

```bash
cd frontend
npm install
npm run build      # public/ に出力される
cd ..
firebase deploy
```

> `.firebaserc` は Git 管理外のため、新しく clone した環境では
> `firebase use --add` でプロジェクトを再設定する必要がある。
