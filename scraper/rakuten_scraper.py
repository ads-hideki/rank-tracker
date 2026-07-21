"""
楽天市場 検索順位取得
- 検索結果ページをスクレイピングし、指定ショップIDの商品が何位に出るか返す
- PR（広告）枠を除外してオーガニック順位のみカウントする
- 見つからない場合は None を返す

【PR枠の識別方法】
楽天の広告枠は2種類存在する:
  1. categoryWordBanner セクション: div.searchresultitem とは別コンテナに配置される
     バナー形式のPR枠で、div.searchresultitem を選択するだけで自動的に除外される。
  2. searchresultitem グリッド内の RPP 広告（将来対応用）:
     data-track-card="rpp"、data-rpp-links-overrides が 'null' 以外、
     または子要素に pr-label-- クラスを持つ場合に識別できる。
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

_PR_LABEL_RE = re.compile(r'^pr-label--')

# 追跡対象は100位まで。これを超えた時点で圏外（None）として打ち切る
_MAX_RANK = 100


def _is_pr_item(item) -> bool:
    """
    searchresultitem 要素が PR（広告）枠かどうか判定する。

    判定基準:
    - data-track-card が 'search' 以外（'rpp' 等）
    - data-rpp-links-overrides が 'null' 以外（RPP広告オーバーライドあり）
    - 子要素に pr-label--* クラスを持つ（PRバッジ表示）
    """
    if item.get('data-track-card', 'search') != 'search':
        return True
    if item.get('data-rpp-links-overrides', 'null') != 'null':
        return True
    if item.find('div', class_=_PR_LABEL_RE):
        return True
    return False


def get_rakuten_rank(keyword: str, shop_id: str, item_id: str = None, max_pages: int = 5, interval: int = 3) -> int | None:
    """
    楽天市場でキーワード検索し、shop_id の商品のオーガニック順位を返す。
    item_id を指定すると特定商品のURLを照合する（より正確）。
    PR枠はカウントせずオーガニック枠のみ順位に含める。
    """
    session = requests.Session()
    session.headers.update(_HEADERS)
    organic_rank = 0

    for page in range(1, max_pages + 1):
        url = f"https://search.rakuten.co.jp/search/mall/{quote(keyword)}/?p={page}"
        logger.debug(f"  GET {url}")
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"楽天リクエスト失敗 page={page}: {e}")
            break

        soup = BeautifulSoup(resp.text, 'lxml')

        # 商品リストのコンテナ（categoryWordBanner は別コンテナなので自動除外済み）
        items = soup.select('div.searchresultitem')
        if not items:
            items = soup.select('section.item')

        if not items:
            logger.warning(f"商品リストが見つかりません page={page} keyword={keyword!r}")
            break

        for item in items:
            # PR枠はオーガニック順位にカウントしない
            if _is_pr_item(item):
                logger.debug(f"  PR枠スキップ: track-card={item.get('data-track-card')}")
                continue

            organic_rank += 1
            if organic_rank > _MAX_RANK:
                logger.info(
                    f"  → {shop_id}/{item_id or '*'} は {_MAX_RANK}位以内に見つからず "
                    f"(keyword={keyword!r})"
                )
                return None

            link = item.select_one('a[href*="item.rakuten.co.jp"]')
            if link:
                href = link.get('href', '')
                target = (
                    f'item.rakuten.co.jp/{shop_id}/{item_id}'
                    if item_id
                    else f'item.rakuten.co.jp/{shop_id}/'
                )
                if target in href:
                    logger.info(f"  → {shop_id}/{item_id or '*'} をオーガニック {organic_rank}位 で発見 (page {page})")
                    return organic_rank

        if page < max_pages:
            time.sleep(interval)

    logger.info(f"  → {shop_id}/{item_id or '*'} は上位 {organic_rank} 件に見つからず (keyword={keyword!r})")
    return None
