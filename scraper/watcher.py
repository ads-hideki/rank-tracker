"""
Firestore の system/scrapeRequest を監視し、
status='pending' を検知したら main.py を起動して即終了する。

Windows Task Scheduler で 2 分ごとに起動する想定。
完了通知は main.py 自身が Firestore に書き込む。
"""
import os
import sys
import subprocess
import logging
from firebase_admin import firestore as fs

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

SCRAPER_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_PY     = os.path.join(SCRAPER_DIR, 'main.py')
PYTHON_EXE  = sys.executable


def main():
    from firebase_client import get_db

    db  = get_db()
    ref = db.collection('system').document('scrapeRequest')
    doc = ref.get()

    if not doc.exists:
        logger.info('リクエストなし')
        return

    status = doc.to_dict().get('status')

    if status != 'pending':
        logger.info(f'スキップ: status={status}')
        return

    logger.info('pending を検知 → main.py を起動します')

    # running に更新
    ref.update({
        'status':    'running',
        'startedAt': fs.SERVER_TIMESTAMP,
        'message':   '',
    })

    # Popen で起動して即終了（完了通知は main.py が担当）
    subprocess.Popen(
        [PYTHON_EXE, MAIN_PY],
        cwd=SCRAPER_DIR,
        # Task Scheduler 環境でも安全に動くよう stdin/stdout/stderr を切り離す
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    logger.info('main.py を起動しました（watcher は終了）')


if __name__ == '__main__':
    main()
