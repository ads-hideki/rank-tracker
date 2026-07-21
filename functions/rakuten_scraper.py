"""
楽天市場 検索順位取得
- 検索結果ページをスクレイピングし、指定ショップIDの商品が何位に出るか返す
- 見つからない場合は None を返す
"""
import time
import logging
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'ja-JP,ja;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
}

def get_rakuten_rank(keyword: str, shop_id: str, item_id: str = None, max_pages: int = 5, interval: int = 3) -> int | None:
    """
    楽天市場でキーワード検索し、shop_id の商品の最初の掲載順位を返す。
    item_id を指定すると特定商品のURLを照合する（より正確）。
    """
    session = requests.Session()
    session.headers.update(_HEADERS)
    global_rank = 0

    for page in range(1, max_pages + 1):
        url = f"https://search.rakuten.co.jp/search/mall/{quote(keyword)}/?p={page}&s=2"
        logger.debug(f"  GET {url}")
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"楽天リクエスト失敗 page={page}: {e}")
            break

        soup = BeautifulSoup(resp.text, 'lxml')

        items = soup.select('div.searchresultitem')
        if not items:
            items = soup.select('section.item')

        if not items:
            logger.warning(f"商品リストが見つかりません page={page} keyword={keyword!r}")
            break

        for item in items:
            global_rank += 1
            link = item.select_one('a[href*="item.rakuten.co.jp"]')
            if link:
                href = link.get('href', '')
                target = (
                    f'item.rakuten.co.jp/{shop_id}/{item_id}'
                    if item_id
                    else f'item.rakuten.co.jp/{shop_id}/'
                )
                if target in href:
                    logger.info(f"  → {shop_id}/{item_id or '*'} を {global_rank}位 で発見 (page {page})")
                    return global_rank

        if page < max_pages:
            time.sleep(interval)

    logger.info(f"  → {shop_id}/{item_id or '*'} は上位 {global_rank} 件に見つからず (keyword={keyword!r})")
    return None
