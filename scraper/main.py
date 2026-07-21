"""
検索順位スクレイパー メインスクリプト

Usage:
  python main.py
  python main.py --dry-run    # Firestoreに保存せず結果だけ表示
"""
import argparse
import json
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(
            os.path.join(LOG_DIR, f"{date.today()}.log"),
            encoding='utf-8'
        ),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')
MAX_WORKERS = 3


def load_config() -> dict:
    with open(CONFIG_PATH, encoding='utf-8') as f:
        return json.load(f)


def _scrape_one(kw_text, kw_id, store, store_id, item_id, product_id,
                s_cfg, today, dry_run) -> bool:
    """1店舗×1キーワードを実行。成功なら True を返す。"""
    from rakuten_scraper import get_rakuten_rank
    from yahoo_scraper import get_yahoo_rank
    from firebase_client import save_ranking

    label = f"{store['name']}({store['platform']})"
    try:
        if store['platform'] == 'rakuten':
            rank = get_rakuten_rank(
                kw_text, store['shop_id'], item_id,
                max_pages=s_cfg['rakuten_max_pages'],
                interval=s_cfg['request_interval_sec'],
            )
        elif store['platform'] == 'yahoo':
            rank = get_yahoo_rank(
                kw_text, store['shop_id'], item_id,
                max_pages=s_cfg['yahoo_max_pages'],
                interval=s_cfg['request_interval_sec'],
            )
        else:
            logger.warning(f"  [{label}] 未対応のプラットフォーム")
            return True
        logger.info(f"  [{label}] → {f'{rank}位' if rank else '圏外'}")
        if not dry_run:
            save_ranking(kw_id, store_id, rank, today, product_id)
        return True
    except Exception as e:
        logger.error(f"  [{label}] エラー: {e}", exc_info=True)
        return False


def _update_platform_status(platforms, status: str, message: str = '',
                            timestamp_field: str = 'completedAt'):
    """
    system/scrapeStatus のプラットフォーム別ステータスを更新する。失敗しても無視。

    楽天はPC、YahooはGitHub Actionsと実行場所が分かれたため、
    ダッシュボードには楽天/Yahooを別軸で表示する。ドキュメント構造:
      { rakuten: {status, startedAt, completedAt, message},
        yahoo:   {status, startedAt, completedAt, message} }
    set(merge=True) はマップを再帰的にマージするため、
    自分のプラットフォームのフィールドだけを安全に更新できる。
    """
    try:
        from firebase_client import get_db
        from firebase_admin import firestore as fs
        entry = {'status': status, timestamp_field: fs.SERVER_TIMESTAMP, 'message': message}
        if timestamp_field == 'startedAt':
            entry['completedAt'] = None  # 前回の完了時刻をクリアする
        payload = {p: dict(entry) for p in platforms}
        get_db().collection('system').document('scrapeStatus').set(payload, merge=True)
    except Exception as e:
        logger.warning(f'scrapeStatus 更新失敗（無視）: {e}')


def run(dry_run: bool = False, platform: str = 'all'):
    from firebase_client import get_active_keywords, get_active_products

    config    = load_config()
    today     = date.today().isoformat()
    s_cfg     = config['search']

    # プラットフォーム絞り込み（rakuten / yahoo / all）。
    # store_map を絞ると、商品のstoreItemsも全店舗ループも自動的に対象外になる。
    all_stores = config['stores']
    stores     = [s for s in all_stores if platform == 'all' or s['platform'] == platform]
    store_map  = {s['id']: s for s in stores}
    run_platforms = sorted({s['platform'] for s in stores})

    if not stores:
        logger.error(f"platform={platform!r} に該当する店舗がありません")
        return

    keywords    = get_active_keywords()
    products    = get_active_products()
    product_map = {p['id']: p for p in products}

    logger.info(f"=== スクレイピング開始: {today} (platform={platform}) ===")
    logger.info(f"キーワード {len(keywords)}件 / 商品 {len(products)}件 / 対象店舗 {len(stores)}件 / 同時実行数 {MAX_WORKERS}")
    if dry_run:
        logger.info("【DRY RUN】Firestoreには保存しません")
    else:
        # ダッシュボードに「実行中」を表示させる
        _update_platform_status(run_platforms, 'running', '', 'startedAt')

    total  = 0
    errors = 0

    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            for kw_idx, kw in enumerate(keywords, 1):
                product_ids = kw.get('productIds') or []

                if product_ids:
                    # 商品紐づきあり：商品×店舗を並列実行
                    for pid in product_ids:
                        product = product_map.get(pid)
                        if not product:
                            logger.warning(f"商品が見つかりません: pid={pid}")
                            continue

                        jobs = [
                            (store_map[sid], sid, iid)
                            for sid, iid in (product.get('storeItems') or {}).items()
                            if iid and sid in store_map
                        ]
                        if not jobs:
                            continue

                        logger.info(
                            f"[{kw_idx}/{len(keywords)}] [{product['name']}] "
                            f"「{kw['text']}」 ({len(jobs)}店舗 並列実行)"
                        )
                        futures = {
                            executor.submit(
                                _scrape_one,
                                kw['text'], kw['id'], store, sid, iid, pid,
                                s_cfg, today, dry_run,
                            ): sid
                            for store, sid, iid in jobs
                        }
                        for future in as_completed(futures):
                            total += 1
                            if not future.result():
                                errors += 1

                else:
                    # 商品紐づきなし：全店舗を並列実行
                    logger.info(
                        f"[{kw_idx}/{len(keywords)}] 「{kw['text']}」"
                        f" ({len(stores)}店舗 並列実行)"
                    )
                    futures = {
                        executor.submit(
                            _scrape_one,
                            kw['text'], kw['id'], store, store['id'], None, None,
                            s_cfg, today, dry_run,
                        ): store['id']
                        for store in stores
                    }
                    for future in as_completed(futures):
                        total += 1
                        if not future.result():
                            errors += 1

        msg = f"成功 {total - errors}件 / エラー {errors}件"
        logger.info(f"=== 完了: {msg} ===")
        if not dry_run:
            _update_platform_status(run_platforms, 'done', msg)

    except Exception as e:
        logger.error(f"致命的エラー: {e}", exc_info=True)
        if not dry_run:
            _update_platform_status(run_platforms, 'error', str(e)[:200])
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Firestoreに保存せずテスト実行')
    parser.add_argument(
        '--platform', choices=['rakuten', 'yahoo', 'all'], default='all',
        help='対象プラットフォーム。楽天=PC、Yahoo=GitHub Actions で分担実行する',
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, platform=args.platform)
