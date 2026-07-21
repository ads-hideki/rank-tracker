#!/bin/bash
# Cloud Functions + Cloud Scheduler デプロイスクリプト
# 実行前に: gcloud auth login && gcloud config set project annekor-rank-tracker

set -e

PROJECT_ID="annekor-rank-tracker"
REGION="asia-northeast1"
FUNCTION_NAME="run-scraper"
SCHEDULER_SA="scheduler-invoker"
SCHEDULER_JOB="daily-rank-scraper"

echo "=== [1/4] Cloud Functions をデプロイ ==="
gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=python312 \
  --region="$REGION" \
  --source=. \
  --entry-point=run_scraper \
  --trigger-http \
  --no-allow-unauthenticated \
  --timeout=3600s \
  --memory=512Mi \
  --project="$PROJECT_ID"

# デプロイ完了後に Function の URL を取得
FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(serviceConfig.uri)")
echo "Function URL: $FUNCTION_URL"

echo ""
echo "=== [2/4] Scheduler 用サービスアカウントを作成 ==="
# すでに存在する場合はエラーを無視
gcloud iam service-accounts create "$SCHEDULER_SA" \
  --display-name="Cloud Scheduler Invoker" \
  --project="$PROJECT_ID" 2>/dev/null || echo "（サービスアカウントは既存）"

SCHEDULER_SA_EMAIL="${SCHEDULER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "=== [3/4] Cloud Function の呼び出し権限を付与 ==="
gcloud functions add-invoker-policy-binding "$FUNCTION_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${SCHEDULER_SA_EMAIL}" \
  --project="$PROJECT_ID"

echo ""
echo "=== [4/4] Cloud Scheduler ジョブを作成（毎日 JST 9:00）==="
# すでに存在する場合は update
if gcloud scheduler jobs describe "$SCHEDULER_JOB" \
  --location="$REGION" \
  --project="$PROJECT_ID" &>/dev/null; then
  gcloud scheduler jobs update http "$SCHEDULER_JOB" \
    --location="$REGION" \
    --schedule="0 9 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="$FUNCTION_URL" \
    --http-method=GET \
    --oidc-service-account-email="$SCHEDULER_SA_EMAIL" \
    --project="$PROJECT_ID"
  echo "Scheduler ジョブを更新しました"
else
  gcloud scheduler jobs create http "$SCHEDULER_JOB" \
    --location="$REGION" \
    --schedule="0 9 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="$FUNCTION_URL" \
    --http-method=GET \
    --oidc-service-account-email="$SCHEDULER_SA_EMAIL" \
    --project="$PROJECT_ID"
  echo "Scheduler ジョブを作成しました"
fi

echo ""
echo "=== デプロイ完了 ==="
echo "Function URL : $FUNCTION_URL"
echo "Scheduler    : 毎日 JST 09:00 に自動実行"
echo ""
echo "手動テスト実行:"
echo "  gcloud scheduler jobs run $SCHEDULER_JOB --location=$REGION --project=$PROJECT_ID"
