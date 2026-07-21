"""
Cloud Functions エントリーポイント
- run_scraper: 毎日 Cloud Scheduler から HTTP リクエストで呼ばれる
- suggest_keywords: フロントエンドから呼ばれる AIキーワード提案
"""
import json
import logging
import os
import sys
from datetime import date

import functions_framework

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')


def load_config() -> dict:
    with open(CONFIG_PATH, encoding='utf-8') as f:
        return json.load(f)


@functions_framework.http
def run_scraper(request):
    from firebase_client import get_active_keywords, get_active_products, save_ranking
    from rakuten_scraper import get_rakuten_rank
    from yahoo_scraper import get_yahoo_rank

    config    = load_config()
    today     = date.today().isoformat()
    s_cfg     = config['search']
    stores    = config['stores']
    store_map = {s['id']: s for s in stores}

    keywords    = get_active_keywords()
    products    = get_active_products()
    product_map = {p['id']: p for p in products}

    logger.info(f"=== スクレイピング開始: {today} ===")
    logger.info(f"キーワード {len(keywords)}件 / 商品 {len(products)}件")

    done   = 0
    errors = 0

    for kw in keywords:
        product_ids = kw.get('productIds') or []

        if product_ids:
            for pid in product_ids:
                product = product_map.get(pid)
                if not product:
                    logger.warning(f"商品が見つかりません: pid={pid}")
                    continue
                store_items = product.get('storeItems') or {}
                for store_id, item_id in store_items.items():
                    if not item_id:
                        continue
                    store = store_map.get(store_id)
                    if not store:
                        logger.warning(f"店舗設定が見つかりません: store_id={store_id}")
                        continue
                    done += 1
                    logger.info(
                        f"[{done}] [{store['name']}({store['platform']})] "
                        f"[{product['name']}] 「{kw['text']}」"
                    )
                    try:
                        if store['platform'] == 'rakuten':
                            rank = get_rakuten_rank(
                                kw['text'], store['shop_id'], item_id,
                                max_pages=s_cfg['rakuten_max_pages'],
                                interval=s_cfg['request_interval_sec'],
                            )
                        elif store['platform'] == 'yahoo':
                            rank = get_yahoo_rank(
                                kw['text'], store['shop_id'], item_id,
                                max_pages=s_cfg['yahoo_max_pages'],
                                interval=s_cfg['request_interval_sec'],
                            )
                        else:
                            logger.warning(f"未対応のプラットフォーム: {store['platform']}")
                            continue
                        logger.info(f"  → {f'{rank}位' if rank else '圏外'}")
                        save_ranking(kw['id'], store_id, rank, today, pid)
                    except Exception as e:
                        errors += 1
                        logger.error(f"  エラー: {e}", exc_info=True)
        else:
            for store in stores:
                done += 1
                logger.info(f"[{done}] [{store['name']}({store['platform']})] 「{kw['text']}」")
                try:
                    if store['platform'] == 'rakuten':
                        rank = get_rakuten_rank(
                            kw['text'], store['shop_id'],
                            max_pages=s_cfg['rakuten_max_pages'],
                            interval=s_cfg['request_interval_sec'],
                        )
                    elif store['platform'] == 'yahoo':
                        rank = get_yahoo_rank(
                            kw['text'], store['shop_id'],
                            max_pages=s_cfg['yahoo_max_pages'],
                            interval=s_cfg['request_interval_sec'],
                        )
                    else:
                        logger.warning(f"未対応のプラットフォーム: {store['platform']}")
                        continue
                    logger.info(f"  → {f'{rank}位' if rank else '圏外'}")
                    save_ranking(kw['id'], store['id'], rank, today)
                except Exception as e:
                    errors += 1
                    logger.error(f"  エラー: {e}", exc_info=True)

    result_msg = f"完了: 成功 {done - errors}件 / エラー {errors}件"
    logger.info(f"=== {result_msg} ===")
    return result_msg, 200


@functions_framework.http
def suggest_keywords(request):
    """商品名・カテゴリを受け取り、Claude API でキーワードを10件提案する。"""
    import anthropic

    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }

    if request.method == 'OPTIONS':
        return ('', 204, cors_headers)

    data = request.get_json(silent=True) or {}
    product_name = (data.get('productName') or '').strip()
    category = (data.get('category') or '').strip()

    if not product_name:
        return (
            json.dumps({'error': 'productName is required'}, ensure_ascii=False),
            400,
            {**cors_headers, 'Content-Type': 'application/json'},
        )

    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return (
            json.dumps({'error': 'ANTHROPIC_API_KEY not set'}, ensure_ascii=False),
            500,
            {**cors_headers, 'Content-Type': 'application/json'},
        )

    client = anthropic.Anthropic(api_key=api_key)

    cat_text = f'（カテゴリ：{category}）' if category else ''
    prompt = (
        f'楽天市場・Yahoo!ショッピングで「{product_name}」{cat_text}を販売する際に、'
        '検索順位を獲得しやすい複合キーワードを10件提案してください。\n\n'
        '条件：\n'
        '- 実際に消費者が検索しそうな2〜4語の複合キーワード\n'
        '- 楽天・Yahoo両方で効果的なキーワード\n'
        '- 競合が多すぎない適度な検索ボリュームのキーワード\n\n'
        '回答形式：キーワードを1行1件で10件のみ出力してください。番号・説明文は不要です。'
    )

    message = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=512,
        messages=[{'role': 'user', 'content': prompt}],
    )

    raw = message.content[0].text.strip()
    suggestions = []
    for line in raw.split('\n'):
        line = line.strip()
        if not line:
            continue
        # 先頭の番号・記号を除去
        for prefix in ('1234567890', '.）) '):
            line = line.lstrip(prefix).strip()
        if line:
            suggestions.append(line)
    suggestions = suggestions[:10]

    return (
        json.dumps({'suggestions': suggestions}, ensure_ascii=False),
        200,
        {**cors_headers, 'Content-Type': 'application/json'},
    )
