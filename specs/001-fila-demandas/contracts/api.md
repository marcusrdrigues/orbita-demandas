# Contrato da API: Fila de Demandas

Base: `http://localhost:<porta>` (o web usa proxy do dev server). JSON, UTF-8.

## Autenticação e escopos (simplificado)

| Cabeçalho | Valor |
|---|---|
| `x-user-id` | id inteiro de `app_user` (obrigatório) |
| `x-scopes` | escopos separados por vírgula (ex.: `demands,demands:supervise`) |

- Sem `x-user-id`, inválido ou usuário inexistente → **401**.
- Listar, reservar e encerrar exigem o escopo `demands` **ou** `demands:supervise`; sem nenhum
  dos dois → **403** `SEM_PERMISSAO`. Essa checagem vem antes de qualquer outra regra da rota.
- `demands:supervise` amplia o encerramento: permite encerrar demanda reservada por outro.

## Formato de erro (todos os casos)

```json
{ "code": "DEMANDA_JA_RESERVADA", "message": "Demanda já reservada por Maria Souza." }
```

`message` em pt-BR, sem stack trace nem detalhe interno. Erros de validação (400) trazem
também `details`: lista de `{ field, message }`.

## Representação de Demanda

```json
{
  "id": 42, "title": "…", "queue": "suporte", "status": 2,
  "workerId": 3, "workerName": "Maria Souza",
  "outcome": null, "failureReason": null, "note": null,
  "updatedAt": "2026-10-30T12:00:00.000Z"
}
```

`workerName` vem de `app_user.name` (nulo se não há `workerId`).

## GET /demands

Query (esquema estrito; qualquer outro parâmetro → 400):

| Parâmetro | Tipo | Padrão |
|---|---|---|
| `page` | inteiro ≥ 1 | 1 |
| `pageSize` | inteiro 1–100 | 20 |
| `queue` | texto, 1–40 | — |
| `status` | 1, 2 ou 3 | — |
| `sort` | `id` \| `updated_at` | `id` |
| `order` | `asc` \| `desc` | `asc` |

**200**: `{ "items": [Demanda], "total": 5000, "page": 1, "pageSize": 20 }`
(`total` considera os filtros). Página além do fim → `items: []` com `total` correto.
**400** filtro/ordenação/paginação desconhecidos ou fora do intervalo. **401**, **403**.

## POST /demands/:id/reserve

Sem corpo. `:id` inteiro positivo.

| Resultado | Quando |
|---|---|
| **200** `Demanda` | reservou, ou o mesmo usuário já era o dono (sem novo trace) |
| **404** `DEMANDA_NAO_ENCONTRADA` | não existe |
| **409** `DEMANDA_JA_RESERVADA` | reservada por outro (corpo abaixo) |
| **409** `DEMANDA_ENCERRADA` | já encerrada; corpo com `code`, `message` e `demanda` |
| **401** / **403** | autenticação / escopo |

Corpo do 409 de reserva por outro:

```json
{
  "code": "DEMANDA_JA_RESERVADA",
  "message": "Demanda já reservada por Maria Souza.",
  "holder": { "id": 3, "name": "Maria Souza" },
  "demanda": { "id": 42, "status": 2, "workerId": 3, "workerName": "Maria Souza", "…": "…" }
}
```

O front usa `demanda` para atualizar a linha sem nova consulta e `message` para o aviso.

## POST /demands/:id/finish

Corpo (estrito):

```json
{ "outcome": "success" | "failure", "failureReason": "texto (1–40)", "note": "até 500" }
```

- `failureReason` obrigatório se `outcome="failure"` (1 a 40 caracteres); **proibido** se
  `success` (→ 400).
- `note` opcional, até 500 caracteres.

Ordem das checagens: escopo (403) → validação do corpo (400) → **404** → **409** → **403**.
O 403 de escopo ausente vem primeiro; o 403 de "não é o dono" vem por último.

| Resultado | Quando |
|---|---|
| **200** `Demanda` | encerrada |
| **400** `REQUISICAO_INVALIDA` | corpo inválido |
| **404** `DEMANDA_NAO_ENCONTRADA` | não existe |
| **409** `DEMANDA_NAO_RESERVADA` | está aberta ou já encerrada |
| **403** `SEM_PERMISSAO` | sem escopo, ou não é o dono e não tem `demands:supervise` |
| **401** | autenticação |

## Garantias

- Toda mudança (reserva efetiva, encerramento) grava `demand_trace` na mesma transação.
- Reserva repetida pelo dono: 200, sem trace. Recusas não alteram nada nem gravam trace.
