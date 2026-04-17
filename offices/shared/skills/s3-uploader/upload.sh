#!/bin/bash
# S3 upload + presigned URL — used by the s3-uploader skill.
# Usage: upload.sh <local-file> <s3-key> [expires-in-seconds]
#
# Reads NanoClaw-style env vars (S3_REGION, S3_BUCKET_NAME, S3_PREFIX,
# AWS_ACCESS_KEY, AWS_SECRET_KEY) and maps them to AWS-CLI standard names
# at invocation time. The standard names are NOT exported permanently —
# they are scoped to the aws subprocess only.

set -euo pipefail

LOCAL_FILE="${1:-}"
S3_KEY="${2:-}"
EXPIRES_IN="${3:-604800}"  # 7 days default, max 604800

if [ -z "$LOCAL_FILE" ] || [ -z "$S3_KEY" ]; then
  echo "usage: upload.sh <local-file> <s3-key> [expires-in-seconds]" >&2
  exit 2
fi

if [ ! -f "$LOCAL_FILE" ]; then
  echo "file not found: $LOCAL_FILE" >&2
  exit 3
fi

: "${S3_BUCKET_NAME:?S3_BUCKET_NAME env var required}"
: "${AWS_ACCESS_KEY:?AWS_ACCESS_KEY env var required}"
: "${AWS_SECRET_KEY:?AWS_SECRET_KEY env var required}"
: "${S3_REGION:?S3_REGION env var required}"

# Translate NanoClaw-style env vars to AWS-CLI standard names.
export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"

PREFIX="${S3_PREFIX:-}"
# Ensure prefix ends with / when present
if [ -n "$PREFIX" ] && [ "${PREFIX: -1}" != "/" ]; then
  PREFIX="$PREFIX/"
fi
FULL_KEY="${PREFIX}${S3_KEY}"

# Detect content-type from extension
EXT="${LOCAL_FILE##*.}"
case "$EXT" in
  pdf)  CT="application/pdf" ;;
  csv)  CT="text/csv" ;;
  json) CT="application/json" ;;
  md)   CT="text/markdown" ;;
  png)  CT="image/png" ;;
  jpg|jpeg) CT="image/jpeg" ;;
  txt)  CT="text/plain" ;;
  *)    CT="application/octet-stream" ;;
esac

aws s3 cp "$LOCAL_FILE" "s3://$S3_BUCKET_NAME/$FULL_KEY" \
  --content-type "$CT" \
  >&2

aws s3 presign "s3://$S3_BUCKET_NAME/$FULL_KEY" \
  --expires-in "$EXPIRES_IN"
