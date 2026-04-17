---
name: purge
description: Weekly memory purge — archives memories/projects unused for >180 days with zero backlinks, hard-deletes archive items older than 365 days, and compacts ancient daily notes. Triggered by the scheduled "purge" task (Sunday 04:00 BRT) or manually via /purge.
---

# Purge (expurgo periódico de memórias)

Você é o ciclo de **expurgo** — o anti-sonho. Mantém o vault saudável removendo memória morta sem perder nada importante permanentemente. Soft archive primeiro, hard delete só no final do pipeline.

## Política de retenção

| Artefato | Soft archive em | Hard delete em | Condição extra |
|----------|------------------|-----------------|----------------|
| `journal/memories/*.md` | 180d sem access **E** 0 backlinks | 365d em `archive/` | — |
| `journal/projects/*.md` com `status: done` | 180d sem update | 365d em `archive/` | — |
| `journal/projects/*.md` com `status: active` | nunca | nunca | — |
| `journal/daily/YYYY-MM-DD.md` | nunca soft | 365d | compacta em semana após 90d (opcional) |
| `journal/dreams/*.md` | 90d → archive | 180d em archive | — |
| `journal/archive/**` | — | >365d em archive | hard delete direto |

**Dupla condição para memories:** precisa idade E ausência de backlinks. Uma memória referenciada por outras é "viva" mesmo sem acesso direto.

## Passo-a-passo

### 1. Scan memories

Para cada arquivo em `/workspace/global/journal/memories/*.md`:

```bash
for f in /workspace/global/journal/memories/*.md; do
  slug=$(basename "$f" .md)
  last_accessed=$(grep -m1 '^last_accessed:' "$f" | sed 's/^last_accessed: *//')
  # dias desde último acesso
  age_days=$(( ($(date +%s) - $(date -d "$last_accessed" +%s)) / 86400 ))
  # backlinks entrantes (de qualquer lugar do vault)
  backlinks=$(rg -l "\[\[memories/$slug\]\]|\[\[$slug\]\]" /workspace/global/ --type md | grep -v "memories/$slug.md" | wc -l)
  echo "$slug age=$age_days backlinks=$backlinks"
done
```

Se `age_days > 180` **E** `backlinks == 0` → candidato a archive.

### 2. Scan projects (só `status: done`)

```bash
for f in /workspace/global/journal/projects/*.md; do
  status=$(grep -m1 '^status:' "$f" | awk '{print $2}')
  [ "$status" = "done" ] || continue
  last_touched=$(grep -m1 '^last_touched:' "$f" | sed 's/^last_touched: *//')
  age_days=$(( ($(date +%s) - $(date -d "$last_touched" +%s)) / 86400 ))
  [ "$age_days" -gt 180 ] && echo "archive candidate: $(basename $f)"
done
```

Projects com `status: active` nunca arquiva — escreva comentário no purge log se um project `active` não tem update há 180d pedindo revisão humana.

### 3. Soft archive

Para cada candidato:

```bash
year=$(date +%Y)
mkdir -p /workspace/global/journal/archive/$year
git_mv_src=/workspace/global/journal/memories/$slug.md
dst=/workspace/global/journal/archive/$year/$slug.md
mv "$git_mv_src" "$dst"
```

Depois:
- Remova a entrada do `journal/index.md` (se listada lá)
- Registre em `journal/dreams/purge-$(date +%F).md`

### 4. Hard delete (archive >365d)

```bash
find /workspace/global/journal/archive/ -type f -name "*.md" -mtime +365 -print
# revisa lista, depois:
find /workspace/global/journal/archive/ -type f -name "*.md" -mtime +365 -delete
```

### 5. Compact daily notes antigas (opcional, se o folder ficar grande)

Daily notes são raw log — não arquiva, mas se há >365 dias de arquivos e o folder excede 100 arquivos:

- Para cada semana completa com >90d de idade, gere `journal/daily/archive/YYYY-Www.md` com resumo de 5-10 linhas dos 7 dias
- Mova os 7 dailies individuais pra `journal/archive/daily/YYYY/`
- **Só execute essa compactação se explicitamente instruído** — é destrutiva e requer julgamento humano.

### 6. Purge dreams antigos

Dreams/ de >90d vão pra `archive/YYYY/dreams/`. Archive de dreams >180d delete.

### 7. Hard-delete archive antigo

```bash
find /workspace/global/journal/archive/ -type f -mtime +365 -delete
```

## Log do purge

Escreva `/workspace/global/journal/dreams/purge-$(date +%F).md`:

```markdown
---
date: YYYY-MM-DD
type: purge
archived: N
hard_deleted: N
reviewed: N
---

# Purge de YYYY-MM-DD

## Arquivado (soft)

- [[memories/slug]] → archive/YYYY/ (idade: Xd, backlinks: 0)
- ...

## Hard deletado (archive >365d)

- archive/2025/slug.md
- ...

## Revisão humana solicitada

- [[projects/slug]] com status=active mas sem update há Xd — vale fechar ou reativar?
- [[memories/slug]] com baixa confidence e sem backlinks recentes — vale manter?

## Skipped

- Daily notes: não arquivadas (política de retenção total)
- Projects ativos: preservados
```

## Resumo matinal do purge

Mesmo regime do dream: respeita `morning_summary` em `.dream-config.json`. Mensagem:

```
🧹 Purge de YYYY-MM-DD
• Arquivei N memórias (>180d sem uso)
• Deletei M do archive antigo (>365d)
• K itens pedem revisão humana — veja dreams/purge-YYYY-MM-DD.md
```

## Safeguards

- **Soft antes de hard** — nunca delete diretamente de `memories/` ou `projects/`
- **Nunca delete daily notes** sem instrução explícita
- **Preservar backlinks** — se `memories/X` é referenciado por `projects/Y` (mesmo inativo), não arquive
- **Dry-run mental:** antes de mover, liste os candidatos. Se algo parece importante (título contém nomes de pessoas, decisões, etc.) — escreva em "Revisão humana solicitada" em vez de arquivar
- **Idempotente** — rodar duas vezes no mesmo dia não faz dano; cheque `dreams/purge-<data>.md` e pule se já rodou hoje

## Checklist

- [ ] Escaneei memories e projects `done` por idade + backlinks?
- [ ] Movi candidatos para `archive/YYYY/`, não deletei direto?
- [ ] Hard-deletei apenas archive >365d?
- [ ] Removi entradas arquivadas de `journal/index.md`?
- [ ] Escrevi `dreams/purge-<data>.md` com contagens?
- [ ] Respeitei config pra resumo matinal?
- [ ] Flaguei items ambíguos em "Revisão humana" em vez de decidir sozinho?
