import os
import firebase_admin
from firebase_admin import credentials, firestore

_db = None

def get_db():
    global _db
    if _db is None:
        key_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
        else:
            # Cloud Functions / Cloud Run: Application Default Credentials を使用
            firebase_admin.initialize_app()
        _db = firestore.client()
    return _db

DEFAULT_SETTINGS = {
    'maxKeywordsPerProduct': 3,
    'maxUnlinkedKeywords':   20,
    'maxTotalJobs':          1000,  # 0 = 無制限
    'maxRank':               50,    # 追跡する順位の上限。これを超えたら「圏外」として打ち切る
}

def get_settings() -> dict:
    """system/settings（ダッシュボードの取得設定）。無ければ既定値。"""
    try:
        snap = get_db().collection('system').document('settings').get()
        data = snap.to_dict() if snap.exists else {}
    except Exception:
        data = {}
    return {**DEFAULT_SETTINGS, **(data or {})}

def get_active_keywords():
    docs = get_db().collection('keywords').where('active', '==', True).stream()
    return [{'id': d.id, **d.to_dict()} for d in docs]

def get_active_products():
    docs = get_db().collection('products').where('active', '==', True).stream()
    return [{'id': d.id, **d.to_dict()} for d in docs]

def daily_key(keyword_id: str, store_id: str, product_id) -> str:
    """daily/{date}.entries のキー。ダッシュボード側（useRankings.js）と同じ形式にすること。"""
    return f"{keyword_id}|{store_id}|{product_id or ''}"


def build_daily_entries(rows) -> dict:
    """rankings のドキュメント（dict の列）→ daily/{date}.entries 用の {key: rank}。"""
    return {daily_key(r.get('keywordId'), r.get('storeId'), r.get('productId')): r.get('rank') for r in rows}


def write_daily_summary(date_str: str, entries: dict, note: str = ''):
    """
    その日の全結果を1ドキュメント daily/{date} にまとめて書く。
    ダッシュボードはこれを読む（8日分で8読み取り）。以前は rankings を直接読んでいて
    1回の表示で3,000読み取り超になり、Firestore 無料枠（5万/日）を使い切ったため。
    rankings（1件1ドキュメント）は商品別の30日推移などのためにそのまま残す。
    """
    get_db().collection('daily').document(date_str).set({
        'date':      date_str,
        'count':     len(entries),
        'entries':   entries,
        'updatedAt': firestore.SERVER_TIMESTAMP,
        'note':      note,
    }, merge=True)


def save_ranking(keyword_id: str, store_id: str, rank, date_str: str, product_id: str = None):
    parts = [date_str, store_id, keyword_id]
    if product_id:
        parts.append(product_id)
    doc_id = '_'.join(parts)
    data = {
        'keywordId': keyword_id,
        'storeId':   store_id,
        'rank':      rank,
        'date':      date_str,
        'scrapedAt': firestore.SERVER_TIMESTAMP,
    }
    if product_id:
        data['productId'] = product_id
    get_db().collection('rankings').document(doc_id).set(data)
