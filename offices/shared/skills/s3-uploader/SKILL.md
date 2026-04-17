---
name: s3-uploader
description: Upload a local file to Amazon S3 and return a presigned HTTPS URL suitable for sharing in chat (Telegram/WhatsApp/Slack/Discord). Use for any deliverable that needs a shareable web link rather than a dashboard download. Requires AWS credentials via OneCLI or env vars.
---

# S3 Uploader

Faz upload de um arquivo local para um bucket S3 e devolve um **presigned URL** que qualquer pessoa com o link pode abrir — sem precisar de credenciais AWS no cliente (chat).

## Quando usar

- Relatório em PDF que precisa ser clicável direto no Telegram/WhatsApp
- CSV/JSON grande demais para colar no chat
- Arquivo temporário com TTL explícito (1-7 dias)

Se o arquivo só precisa aparecer na página de Reports do dashboard, **não use S3** — só escreva em `/workspace/reports/` e o dashboard serve local.

## Setup (uma vez por ambiente)

O skill depende de 5 env vars **no container** (forwarded por `container-runner.ts` a partir do `.env` da raiz do projeto):

```
S3_REGION           # ex: sa-east-1
S3_BUCKET_NAME      # nome do bucket (sem s3://)
S3_PREFIX           # opcional, ex: gorpo/
AWS_ACCESS_KEY      # NanoClaw-style; mapeado para AWS_ACCESS_KEY_ID em runtime
AWS_SECRET_KEY      # NanoClaw-style; mapeado para AWS_SECRET_ACCESS_KEY em runtime
```

A AWS CLI assina os próprios requests, então **não** vai pelo proxy do OneCLI — as credenciais são injetadas como env vars diretamente. O wrapper `upload.sh` traduz para os nomes padrão da AWS CLI no escopo do subprocesso (não exporta no shell pai).

Setup manual no host:

```bash
# Em /home/ubuntu/nanoclaw/.env
echo 'S3_REGION=sa-east-1' >> .env
echo 'S3_BUCKET_NAME=meu-bucket' >> .env
echo 'S3_PREFIX=meu-prefix/' >> .env
echo 'AWS_ACCESS_KEY=AKIA...' >> .env
echo 'AWS_SECRET_KEY=...' >> .env
# Depois: rebuild + restart pra container pegar
```

Bucket policy sugerida (privado, só acessível via presigned URL):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyPublic",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::meu-bucket-reports/*",
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
```

Habilite **lifecycle rule** pra deletar objects com prefixo `reports/` após 90 dias.

## Uso

### Script `upload.sh`

Chame o wrapper que faz upload + presign em um comando só:

```bash
bash /workspace/offices/shared/skills/s3-uploader/upload.sh \
  <arquivo-local> \
  <s3-key> \
  [expires-in-seconds]
```

- `<arquivo-local>` — caminho absoluto, tipicamente `/workspace/reports/foo.pdf`
- `<s3-key>` — caminho dentro do bucket (sem o `s3://bucket/`), ex.: `reports/sprint-status/2026-04-17.pdf`
- `[expires-in-seconds]` — opcional, default 604800 (7 dias); max 604800

**Saída:** o presigned URL em stdout, **só isso**. Erros vão pra stderr.

```bash
URL=$(bash /workspace/offices/shared/skills/s3-uploader/upload.sh \
  /workspace/reports/sprint-92-status.pdf \
  reports/sprint-status/2026-04-17.pdf)
echo "Link: $URL"
```

### Sem o wrapper (AWS CLI direto)

Se o wrapper não estiver disponível ou precisar customizar — lembre de exportar os nomes-padrão antes:

```bash
export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"

# Upload
aws s3 cp /workspace/reports/foo.pdf \
  "s3://$S3_BUCKET_NAME/${S3_PREFIX}reports/sprint/2026-04-17.pdf" \
  --content-type application/pdf

# Presigned URL (7 dias = 604800s)
aws s3 presign \
  "s3://$S3_BUCKET_NAME/${S3_PREFIX}reports/sprint/2026-04-17.pdf" \
  --expires-in 604800
```

## Política de TTL

| Tipo de conteúdo | TTL recomendado |
|------------------|-----------------|
| Report público dentro do time | 7 dias (default) |
| Dados com PII ou financeiros | 1 dia |
| Snapshot pontual "pra consultar hoje" | 4 horas (14400s) |
| Documento de referência estável | 30 dias (max presign = 7d — use copy+novo URL) |

## Convenção de paths no bucket

```
s3://<bucket>/<prefix>/
  ├── reports/
  │   ├── <template-slug>/
  │   │   └── YYYY-MM-DD-HHmm.pdf
  │   └── adhoc/
  │       └── <descritivo>-<timestamp>.pdf
  ├── exports/
  │   └── csv|json|...
  └── debug/
      └── <short-lived artifacts>
```

Descoberta por alguém que abra o bucket sem contexto é fácil.

## Teste antes de entregar

```bash
# Verifica que o link retorna 200 antes de mandar ao usuário
curl -sI "$URL" | head -1
# Deve ser: HTTP/1.1 200 OK  (ou HTTP/2 200)
```

Se vier 403, o bucket bloqueou ou a presign expirou — regenere.

## Limites

- **Max presign duration**: 7 dias (604800s) com credenciais IAM de longa duração. Se precisar mais, renove periodicamente.
- **Tamanho de arquivo**: PUT single-part até 5 GB; acima disso o `aws s3 cp` faz multipart automaticamente (não precisa fazer nada extra)
- **Content-Type**: o wrapper já detecta; se o cliente (ex.: Telegram) não abrir como PDF, force `--content-type application/pdf`
- **Charset**: caracteres especiais no `<s3-key>` podem quebrar o presign — use ASCII e hífens

## Troubleshooting

| Erro | Causa | Fix |
|------|-------|-----|
| `Unable to locate credentials` | Env vars não chegaram no container | `env \| grep -E '^(AWS_\|S3_)'` — checar `.env` da raiz e rebuild do container |
| `AccessDenied` no PUT | Policy bucket ou IAM user não permite | Checar policy do IAM user |
| `NoSuchBucket` | Nome errado ou região divergente | `aws s3 ls` para listar buckets visíveis |
| Link abre mas baixa em vez de exibir | Content-Type genérico | Forçar `--content-type application/pdf` |
| `SignatureDoesNotMatch` | Clock skew do container | `date -u` — sincronizar se >5min de desvio |
