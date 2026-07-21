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

def get_active_keywords():
    docs = get_db().collection('keywords').where('active', '==', True).stream()
    return [{'id': d.id, **d.to_dict()} for d in docs]

def get_active_products():
    docs = get_db().collection('products').where('active', '==', True).stream()
    return [{'id': d.id, **d.to_dict()} for d in docs]

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
