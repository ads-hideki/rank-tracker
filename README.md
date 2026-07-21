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

## 現在の運用：Windows タスクスケジューラ

社内 PC のタスクスケジューラ `AnnekorRankTracker` で **毎日 10:00** に実行している。

```powershell
# 状態確認
Get-ScheduledTask -TaskName 'AnnekorRankTracker' | Get-ScheduledTaskInfo

# 一時停止 / 再開（管理者権限が必要）
Disable-ScheduledTask -TaskName 'AnnekorRankTracker'
Enable-ScheduledTask  -TaskName 'AnnekorRankTracker'
```

登録内容は `scraper/setup_task_scheduler.ps1` を参照。

### 既知の課題

実行中（従来は約40分）は帯域と CPU を消費し、同じ PC での他作業が重くなる。
100位打ち切りの導入で短縮されたが、根本的には社外実行へ移すのが望ましい。

## GitHub Actions での自動実行（準備済み・未使用）

`.github/workflows/daily-rank-tracker.yml` を用意してあるが、**現在は使っていない**。
リポジトリを GitHub に push していないため、このファイルは動作しない。

社外実行へ移行する場合に以下の手順で有効化できる。移行後は
タスクスケジューラ側を必ず停止すること（二重実行になるため）。

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
