# Data Model: Fila de Demandas

MySQL 8, InnoDB. O esquema abaixo é **fixo** (definido pela prova): não acrescentar colunas,
índices nem chaves estrangeiras. Definição em `/db/schema.sql`.

## Esquema

```sql
CREATE TABLE app_user (
  id   INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE demand (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  queue          VARCHAR(40)  NOT NULL,
  status         TINYINT      NOT NULL DEFAULT 1,
  worker_id      INT          NULL,
  outcome        ENUM('success','failure') NULL,
  failure_reason VARCHAR(40)  NULL,
  note           VARCHAR(500) NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_queue_status (queue, status)
);

CREATE TABLE demand_trace (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  demand_id  INT         NOT NULL,
  user_id    INT         NOT NULL,
  action     VARCHAR(20) NOT NULL,
  note       VARCHAR(500) NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Significado dos campos

- `demand.status`: 1 aberta, 2 reservada, 3 encerrada.
- `demand.worker_id`: usuário que reservou; nulo enquanto aberta.
- `demand.outcome`: `success` ou `failure`; só com status 3.
- `demand.failure_reason`: motivo do insucesso, até **40** caracteres; nulo no sucesso.
- `demand.updated_at`: o próprio MySQL atualiza em toda alteração da linha (`ON UPDATE`).
- `demand_trace.action`: `reservada` ou `encerrada`.
- `demand_trace.note`: observação informada no encerramento; nula na reserva.

## Invariantes

Sem `CHECK` nem FK no banco (esquema fixo); as regras ficam nos casos de uso e são cobertas
por teste de integração:

- status 1 → `worker_id`, `outcome`, `failure_reason` nulos.
- status 2 → `worker_id` preenchido; `outcome` nulo.
- status 3 → `outcome` preenchido; `failure_reason` preenchido se e somente se `failure`.
- Toda mudança de `demand` grava uma linha em `demand_trace` na mesma transação.
- `demand_trace` é imutável: o código nunca faz UPDATE nem DELETE nele.

Como não há FK, `worker_id` e `user_id` só apontam para `app_user` por convenção: o caso de uso
sempre grava o id de um usuário já validado na autenticação.

## Transições de estado

```text
1 aberta ──reservar──▶ 2 reservada ──encerrar──▶ 3 encerrada
              │
              └─ reservar de novo pelo mesmo usuário: sem mudança (sucesso)
```

Sem volta nem liberação de reserva nesta versão.

## Índice e consultas

O único índice é `ix_queue_status (queue, status)`. Ordenar por `updated_at` ou por `id` com
filtro usa esse índice só para filtrar; a ordenação é feita em memória (*filesort*). Com 5 mil
linhas isso é aceitável; conferir com `EXPLAIN` na implementação, sem criar índice novo.

## Seed (`/db/seed.sql`)

- 5 usuários de exemplo (operadores e um supervisor), nomes fictícios, ids explícitos
  (`app_user.id` não é auto incremento).
- 5.000 demandas em ~5 filas (`queue` até 40 caracteres), maioria no status 1, algumas nos
  status 2 e 3, coerentes com as invariantes. Nenhum dado pessoal real.
