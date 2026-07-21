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


def _update_request_status(status: str, message: str = '',
                           timestamp_field: str = 'completedAt'):
    """
    system/scrapeRequest の status を更新する。失敗しても無視。

    ダッシュボードはこのドキュメントを購読して実行状況を表示している。
    ドキュメントが存在しない場合もあるため update ではなく set(merge=True) を使う。
    """
    try:
        from firebase_client import get_db
        from firebase_admin import firestore as fs
        get_db().collection('system').document('scrapeRequest').set({
            'status':        status,
            timestamp_field: fs.SERVER_TIMESTAMP,
            'message':       message,
        }, merge=True)
    except Exception as e:
        logger.warning(f'scrapeRequest 更新失敗（無視）: {e}')


def run(dry_run: bool = False):
    from firebase_client import get_active_keywords, get_active_products

    config    = load_config()
    today     = date.today().isoformat()
    s_cfg     = config['search']
    stores    = config['stores']
    store_map = {s['id']: s for s in stores}

    keywords    = get_active_keywords()
    products    = get_active_products()
    product_map = {p['id']: p for p in products}

    logger.info(f"=== スクレイピング開始: {today} ===")
    logger.info(f"キーワード {len(keywords)}件 / 商品 {len(products)}件 / 同時実行数 {MAX_WORKERS}")
    if dry_run:
        logger.info("【DRY RUN】Firestoreには保存しません")
    else:
        # ダッシュボードに「実行中」を表示させる
        _update_request_status('running', '', 'startedAt')

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
            _update_request_status('done', msg)

    except Exception as e:
        logger.error(f"致命的エラー: {e}", exc_info=True)
        if not dry_run:
            _update_request_status('error', str(e)[:200])
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Firestoreに保存せずテスト実行')
    args = parser.parse_args()
    run(dry_run=args.dry_run)
