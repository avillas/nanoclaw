# NanoClaw Multi-Office AI Agent System

Sistema de escritorios de agentes IA com Mission Control Dashboard, integracao Telegram e pipeline de producao.

## Escritorios

| Escritorio | Agentes | Orcamento |
|------------|---------|-----------|
| Marketing | 10 | $10/day, $175/month |
| Development | 13 | $10/day, $350/month |
| Innovation | 6 | $10/day, $20/month |

Detalhes dos pipelines completos em `docs/INSTALL.md`.

Novos escritorios podem ser criados pelo Dashboard ou copiando `_template/`.

## Estrutura

```
offices/
├── marketing/          # 10 agentes, 8 skills, 1 pipeline
├── development/        # 13 agentes, 7 skills, 1 pipeline
├── innovation/         # 6 agentes, 5 skills, 1 pipeline
├── shared/skills/      # 10 skills compartilhadas
├── _template/          # Templates para novos escritorios
├── dashboard/          # Mission Control (Next.js 16)
└── docs/               # Documentacao e script de instalacao
```

## Mission Control Dashboard

Painel web para monitorar e gerenciar o sistema NanoClaw.

### Funcionalidades

- Dashboard com KPIs em tempo real (agentes, containers, escritorios)
- Visualizacao de pipelines com stages e quality gates
- Monitoramento de custos com alertas de orcamento
- Timeline de atividade com mensagens do Telegram
- **Criar novos agentes** direto pelo dashboard (wizard de 4 passos)
- **Criar novos escritorios** direto pelo dashboard (gera toda a estrutura)
- **Configurar bot Telegram** por escritorio (validacao, deteccao de grupo, registro automatico)
- Indicador de status Telegram na sidebar por escritorio
- Descoberta dinamica de escritorios via filesystem

### Stack

- Next.js 16.1 + React 19
- NextAuth 5 (autenticacao JWT)
- better-sqlite3 (leitura do banco do NanoClaw)
- Tailwind CSS
- Dados reais via filesystem reader (`.md` files) com cache de 30s

### Rodar

```bash
cd offices/dashboard
npm install
cp .env.example .env   # editar com suas credenciais
npm run dev             # desenvolvimento
npm run build && npm start  # producao
```

## Deploy na EC2

Scripts de deploy disponiveis (executar do WSL):

```bash
chmod +x update-dashboard-v3.sh
./update-dashboard-v3.sh
```

O script envia todos os arquivos do dashboard para a EC2 via SCP, faz rebuild e reinicia via PM2.

## Documentacao completa

Consulte `docs/INSTALL.md` para o guia completo de instalacao, configuracao de container runtime, Telegram, troubleshooting e convencoes.
