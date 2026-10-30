"""
Yahoo!ショッピング 検索順位取得
- 検索結果ページをスクレイピングし、指定ショップIDの商品が何位に出るか返す
- 見つからない場合は None を返す

【実装方針】
Yahoo!ショッピングはSPA（React）のため商品リストのDOM要素は
JavaScriptで動的生成される。ただし検索結果の各商品リンク
（store.shopping.yahoo.co.jp/{shop_id}/{item_id}.html）は
初期HTMLの <a href> に埋め込まれているため、その出現順を順位とする。
"""
import re
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

_RESULTS_PER_PAGE = 30

# 追跡対象は100位まで。これを超えた時点で圏外（None）として打ち切る
_MAX_RANK = 100
_STORE_URL_RE = re.compile(r'store\.shopping\.yahoo\.co\.jp/([^/]+)/([^?&#"]+)')


def _extract_page_items(soup: BeautifulSoup) -> list[tuple[str, str]]:
    """
    ページHTMLから (shop_id, item_code) のリストを出現順で返す。
    item_code は .html サフィックスを除いた文字列。
    同一商品の重複リンク（tracking など）は除去する。
    """
    seen = set()
    items = []
    for a in soup.select('a[href*="store.shopping.yahoo.co.jp"]'):
        m = _STORE_URL_RE.search(a.get('href', ''))
        if not m:
            continue
        shop = m.group(1)
        item = m.group(2).rstrip('/').removesuffix('.html')
        key = (shop, item)
        if key not in seen:
            seen.add(key)
            items.append(key)
    return items


# 5xx や接続エラーは一時的なことが多いので、数秒待って最大2回まで再試行する
# （楽天側と同じ方針。rakuten_scraper.py の _get_with_retry と同じ実装）。
_RETRY_STATUSES = {500, 502, 503, 504}
_RETRY_WAITS = (5, 10)  # 秒


def _get_with_retry(session: requests.Session, url: str, label: str):
    """GET して Response を返す。再試行しても失敗したら None。4xx は再試行しない。"""
    for attempt, wait in enumerate((0,) + _RETRY_WAITS):
        if wait:
            logger.info(f"  {label} {wait}秒後に再試行 ({attempt}/{len(_RETRY_WAITS)})")
            time.sleep(wait)
        try:
            resp = session.get(url, timeout=20)
            if resp.status_code in _RETRY_STATUSES:
                logger.warning(f"{label}リクエスト失敗: HTTP {resp.status_code}")
                continue
            resp.raise_for_status()
            return resp
        except requests.HTTPError as e:
            logger.warning(f"{label}リクエスト失敗: {e}")
            return None
        except requests.RequestException as e:
            logger.warning(f"{label}リクエスト失敗: {e}")
    return None


def get_yahoo_rank(keyword: str, shop_id: str, item_id: str = None, max_pages: int = 5, interval: int = 3,
                   max_rank: int = _MAX_RANK) -> int | None:
    """
    Yahoo!ショッピングでキーワード検索し、shop_id の商品の最初の掲載順位を返す。
    item_id を指定すると特定商品コードで照合する（より正確）。
    """
    session = requests.Session()
    session.headers.update(_HEADERS)

    # item_id の .html を除いた比較用文字列
    target_item = item_id.removesuffix('.html') if item_id else None
    global_rank = 0

    for page in range(1, max_pages + 1):
        start = (page - 1) * _RESULTS_PER_PAGE + 1
        url = (
            f"https://shopping.yahoo.co.jp/search"
            f"?p={quote(keyword)}&b={start}&n={_RESULTS_PER_PAGE}&s=1"
        )
        logger.debug(f"  GET {url}")
        resp = _get_with_retry(session, url, f"Yahoo page={page}")
        if resp is None:
            break

        soup = BeautifulSoup(resp.text, 'lxml')
        page_items = _extract_page_items(soup)

        if not page_items:
            logger.warning(f"商品リストが見つかりません page={page} keyword={keyword!r}")
            break

        for shop, item in page_items:
            global_rank += 1
            if global_rank > max_rank:
                logger.info(
                    f"  → {shop_id}/{item_id or '*'} は {max_rank}位以内に見つからず "
                    f"(keyword={keyword!r})"
                )
                return None

            if target_item:
                matched = (shop == shop_id and item == target_item)
            else:
                matched = (shop == shop_id)
            if matched:
                logger.info(f"  → {shop_id}/{item_id or '*'} を {global_rank}位 で発見 (page {page})")
                return global_rank

        if page < max_pages:
            time.sleep(interval)

    logger.info(f"  → {shop_id}/{item_id or '*'} は上位 {global_rank} 件に見つからず (keyword={keyword!r})")
    return None
