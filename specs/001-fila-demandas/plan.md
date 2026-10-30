# Implementation Plan: Fila de Demandas

**Branch**: `001-fila-demandas` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-fila-demandas/spec.md`

## Summary

Fila de demandas com listagem paginada no servidor, reserva segura contra concorrência,
encerramento com regras de dono/supervisão e histórico (`demand_trace`) atômico com cada
mudança. API em Fastify + TypeScript com SQL à mão (`mysql2`), front em Angular 21 zoneless.

Decisões de concorrência (a parte crítica):

- **Reserva**: `UPDATE demand SET status=2, worker_id=? WHERE id=? AND status=1` e leitura de
  `affectedRows`. Uma instrução atômica; não há SELECT antes. Descartei SELECT + UPDATE porque
  abre uma janela entre a leitura e a escrita em que duas pessoas passam na checagem.
- **Encerramento**: `SELECT ... FOR UPDATE` numa transação curta (dentro da requisição, sem
  espera do usuário). Aqui a regra depende do estado e do dono, então ler travando é a forma
  direta de decidir 404 → 409 → 403 sobre um estado que não muda no meio.

## Technical Context

**Language/Version**: Node.js 22+ (`engines: ">=22"`), rodando direto no Node local (que aqui é
o 24; não testei no 22), TypeScript 5.9 (`typescript@5`). O `latest` do npm é 7.x; fixei na 5.x.

**Primary Dependencies (api)**: `fastify@5`, `zod@4`, `fastify-type-provider-zod@6.1.0`
(`validatorCompiler`/`serializerCompiler`), `mysql2` (API `mysql2/promise`). Sem ORM.

**Primary Dependencies (web)**: `@angular/*@21` (21.2.x), RxJS, standalone, zoneless
(padrão no v21; não usar `provideZoneChangeDetection`), signals, formulários reativos,
`HttpClient` com interceptor funcional.

**Storage**: MySQL 8 (docker-compose), carga inicial por `/db/schema.sql` + `/db/seed.sql`.
Esquema fixo, definido pela prova (ver [data-model.md](data-model.md)).

**Testing**: Vitest 4.1.x (`vitest@4.1`) com `fastify.inject` contra o MySQL real do
docker-compose; teste de concorrência repete a corrida 25 vezes. Front: sem testes
automatizados nesta entrega (ver Complexity Tracking); o runner do Angular não é configurado.

**Target Platform**: Docker apenas para o MySQL. API e web rodam com `npm` direto no Node
local; não há container para eles.

**Project Type**: Aplicação web (api + web + db).

**Performance Goals**: qualquer página da lista em até 2 s com 5 mil demandas (SC-002);
meta interna bem menor, com índices.

**Constraints**: nenhuma trava de banco atravessando espera do usuário; transações curtas;
SQL sempre parametrizado; ordenação por lista fechada (nunca interpolar entrada).

**Scale/Scope**: 5 mil demandas de exemplo, poucos usuários; 3 endpoints + 1 tela.

## Constitution Check

*GATE: passa antes da pesquisa; reavaliado após o design.*

| Princípio | Como o plano atende | Status |
|---|---|---|
| I. Clean Architecture enxuta | `api/src/{domain,application,infra,http}`; portas em `application/portas` | OK |
| II. Regra nos casos de uso | Reservar/Encerrar/Listar em `application/casos-de-uso`; rotas só traduzem | OK |
| III. SQL à mão, parametrizado | `mysql2` nos repositórios de `infra`; ordenação via mapa fixo | OK |
| IV. Sem trava durante a interação | `FOR UPDATE` só dentro de uma requisição curta; reserva sem lock explícito | OK |
| V. `demand_trace` na mesma transação | Porta `UnidadeDeTrabalho` abre a transação; mudança + trace no mesmo commit | OK |
| VI. Integração contra MySQL real | Vitest + `inject` + MySQL do compose; corrida repetida 25× | OK no backend; **desvio no frontend** (sem testes), registrado em Complexity Tracking |
| VII. Angular moderno | standalone, OnPush, signals, reactive forms, `@if`/`@for` | OK |
| VIII. pt-BR e simplicidade | domínio e mensagens em pt-BR; sem camadas extras | OK |

Uma exceção, no frontend, registrada em Complexity Tracking.

## Decisões aprovadas

1. **Escopos.** Listar, reservar e encerrar exigem `demands` **ou** `demands:supervise`; sem
   nenhum dos dois, 403. `demands:supervise` amplia só o encerramento. Spec ajustada
   (FR-005, FR-012).
2. **Esquema do banco fixo** (definido pela prova), sem colunas, índices nem FKs extras;
   `failure_reason` tem no máximo 40 caracteres (refletido em FR-009 e FR-016).
3. **409 da reserva** devolve `demanda` atual, `message` e `holder {id, name}`.
4. **Parâmetros da listagem**: `page` (base 1), `pageSize` (1–100, padrão 20), `queue`,
   `status` (1|2|3), `sort` (`id`|`updated_at`), `order` (`asc`|`desc`). Qualquer parâmetro fora
   dessa lista, ou valor inválido, devolve 400 (esquema `strict`).

## Project Structure

### Documentation (this feature)

```text
specs/001-fila-demandas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md             # /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
docker-compose.yml          # só o MySQL 8 (+ volume), carrega /db
db/
├── schema.sql              # app_user, demand, demand_trace + índices
└── seed.sql                # usuários de exemplo + 5.000 demandas

api/
├── package.json
├── tsconfig.json
├── src/
│   ├── domain/             # Demanda, StatusDemanda, regras puras, erros de domínio
│   ├── application/
│   │   ├── portas/         # RepositorioDemandas, UnidadeDeTrabalho, RepositorioUsuarios
│   │   └── casos-de-uso/   # listar-demandas, reservar-demanda, encerrar-demanda
│   ├── infra/
│   │   ├── mysql/          # pool, repositórios, unidade de trabalho
│   │   └── config.ts       # variáveis de ambiente
│   ├── http/
│   │   ├── app.ts          # monta o Fastify, compilers Zod, error handler central
│   │   ├── autenticacao.ts # lê x-user-id / x-scopes
│   │   ├── erros.ts        # erro de domínio → status HTTP
│   │   └── rotas/demandas.ts
│   └── servidor.ts
└── tests/
    ├── integracao/         # listagem, reserva, concorrência (25×), encerramento, trace
    └── unidade/            # regras de domínio

web/
├── package.json
├── proxy.conf.json         # /demands → API
└── src/app/
    ├── core/               # interceptor, serviço de usuário atual, API client
    ├── demandas/           # lista, linha, formulário de encerramento
    └── app.config.ts
```

**Structure Decision**: três pastas na raiz (`/api`, `/web`, `/db`) como você definiu, com
`docker-compose.yml` na raiz. Dentro da API, as quatro camadas da constituição; sem camada
extra de "repository" além das portas já declaradas.

## Fluxos críticos

**Reservar** (`POST /demands/:id/reserve`)
1. Abre transação. `UPDATE ... WHERE id=? AND status=1`.
2. `affectedRows=1` → insere `demand_trace(action='reservada')`, commit, 200.
3. `affectedRows=0` → rollback; lê a demanda com o nome do dono (fora da transação de escrita):
   não existe → 404; `worker_id` = usuário → 200 sem trace (idempotente);
   reservada por outro → 409 com `demanda`, `message` e `holder`; encerrada → 409.

**Encerrar** (`POST /demands/:id/finish`)
1. Confere o escopo (403) e valida o corpo com Zod (400). Abre transação; `SELECT ... FOR UPDATE`.
2. Ordem: não existe → 404; status ≠ 2 → 409; não é dono e sem `demands:supervise` → 403.
3. `UPDATE` (status=3, outcome, failure_reason, note) + `INSERT demand_trace` + commit.

**Erros**: erros de domínio com nome claro (`DemandaNaoEncontrada`, `DemandaEmConflito`,
`SemPermissao`, …) lançados nos casos de uso e traduzidos num único error handler; o 400 de
validação do Zod é tratado no mesmo handler. Resposta nunca expõe stack nem detalhe interno.

## Complexity Tracking

| Violação | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Princípio VI exige teste também no frontend; a entrega não terá testes no Angular | Decisão do Marcus: testes do front não são exigidos e o runner não é configurado, para caber nas 4h | Testes de componente (formulário de encerramento, tratamento do 409) foram descartados por custo de tempo; o comportamento é conferido no roteiro manual do quickstart |

Sugestão: se o desvio for permanente, emendar o princípio VI da constituição (PATCH/MINOR) em
vez de manter uma exceção por feature.
