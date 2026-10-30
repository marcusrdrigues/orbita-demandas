---

description: "Tarefas da Fila de Demandas"
---

# Tasks: Fila de Demandas

**Input**: Documentos de `/specs/001-fila-demandas/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: pedidos pela spec (FR-017) e pela constituição v1.1.0 (princípio VI). Backend: testes de integração com Vitest + `fastify.inject` contra o MySQL real do compose. **Frontend: `ng build` e checagem de tipos obrigatórios; sem testes de componente nesta entrega** (opcionais pela constituição); o comportamento do front é conferido pelo roteiro manual do quickstart.

**Organization**: tarefas agrupadas por história de usuário (US1 a US4 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história da spec (US1 consultar a fila, US2 reservar, US3 encerrar, US4 histórico)
- Caminhos relativos à raiz do repositório (`api/`, `web/`, `db/`)

## Regras que valem para todas as tarefas

- Camadas da API: `api/src/domain`, `application` (casos de uso + portas), `infra`, `http`. Dependência aponta para dentro; SQL só em `infra/mysql`.
- SQL à mão com `mysql2/promise`, sempre com valores vinculados (`?`). Nunca concatenar entrada em SQL. Ordenação só por mapa fixo.
- Nomes de domínio em português; termos técnicos em inglês. Mensagens ao usuário em pt-BR, sem stack trace nem detalhe interno.
- Esquema do banco fixo (data-model.md): não criar colunas, índices nem FKs.
- Dependência fora das listadas no plan.md exige aprovação antes de instalar.
- Commit só quando o Marcus pedir.

---

## Phase 1: Setup

**Purpose**: estrutura do repositório, banco e projetos.

- [X] T001 Criar as pastas `api/`, `web/`, `db/` na raiz e um `.gitignore` na raiz com `node_modules/`, `dist/`, `.angular/`, `.env` e `*.log`
- [X] T002 Criar `docker-compose.yml` na raiz com **somente** o MySQL 8: volume nomeado, `healthcheck`, banco `orbita` e usuário `orbita` (`MYSQL_DATABASE`, `MYSQL_USER`, senhas lidas de variáveis de ambiente, sem valor no arquivo), porta publicada só em `127.0.0.1`, e montagem em `/docker-entrypoint-initdb.d/` nesta ordem: `db/00-banco-teste.sql` → `00-banco-teste.sql`, `db/schema.sql` → `01-schema.sql`, `db/seed.sql` → `02-seed.sql`. Criar `db/00-banco-teste.sql` com `CREATE DATABASE IF NOT EXISTS orbita_teste;` e `GRANT ALL PRIVILEGES ON orbita_teste.* TO 'orbita'@'%';`. Criar `.env.example` na raiz com os nomes das variáveis (sem segredo). Observação: os scripts de init só rodam na primeira criação do volume
- [X] T003 [P] Criar `db/schema.sql` com o DDL **exatamente** como em data-model.md: `app_user (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL)`; `demand (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, queue VARCHAR(40) NOT NULL, status TINYINT NOT NULL DEFAULT 1, worker_id INT NULL, outcome ENUM('success','failure') NULL, failure_reason VARCHAR(40) NULL, note VARCHAR(500) NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY ix_queue_status (queue, status))`; `demand_trace (id INT AUTO_INCREMENT PRIMARY KEY, demand_id INT NOT NULL, user_id INT NOT NULL, action VARCHAR(20) NOT NULL, note VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`. Sem colunas, índices nem FKs extras
- [X] T004 [P] Criar `db/seed.sql`: 5 usuários fictícios com ids explícitos (4 operadores e 1 supervisor; `name` até 100 caracteres) e 5.000 demandas geradas por SQL (por exemplo CTE recursiva): as 4 filas fixas `suporte`, `vendas`, `financeiro` e `retencao` (`queue` até 40 caracteres), `title` até 200 caracteres, maioria `status=1`; as com `status=2` têm `worker_id`; as com `status=3` têm `worker_id`, `outcome` e, se `failure`, `failure_reason` com até 40 caracteres. Sem dado pessoal real
- [X] T005 Criar o projeto `api/`: `api/package.json` (`"type": "module"`, `engines.node ">=22"`, scripts `dev`, `build`, `start`, `test`), `api/tsconfig.json` (strict) e `api/vitest.config.ts`; dependências nas versões do plan.md: `fastify@5`, `zod@4`, `fastify-type-provider-zod@6.1.0`, `mysql2`; dev: `typescript@5`, `vitest@4.1`, `tsx`. Depois do install, rodar `npm ls @fastify/swagger` e **informar o resultado ao Marcus** (ver research.md)
- [X] T006 [P] Criar o projeto `web/` com `npx @angular/cli@21 new web` sem arquivos de teste (`--skip-tests`), CSS, sem SSR, sem rotas se desnecessárias; conferir que é zoneless (não usar `provideZoneChangeDetection`) e criar `web/proxy.conf.json` encaminhando `/demands` para a API, ligado ao `start` em `web/package.json`

---

## Phase 2: Foundational (bloqueia todas as histórias)

**Purpose**: domínio, portas, infraestrutura MySQL, autenticação e tratamento central de erros.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [X] T007 [P] Criar `api/src/domain/demanda.ts`: tipos `Demanda` (id, title, queue, status, workerId, workerName, outcome, failureReason, note, updatedAt), `StatusDemanda` (1 aberta, 2 reservada, 3 encerrada) e `Resultado` (`success` | `failure`)
- [X] T008 [P] Criar `api/src/domain/erros.ts` com erros de domínio nomeados: `DemandaNaoEncontrada`, `DemandaJaReservada` (carrega `holder {id,name}` e a `demanda` atual), `DemandaEncerrada` (carrega a `demanda`), `DemandaNaoReservada`, `SemPermissao`, `NaoAutenticado`
- [X] T009 Criar as portas na pasta `api/src/application/portas/` (um arquivo por porta: `repositorio-demandas.ts`, `repositorio-trace.ts`, `repositorio-usuarios.ts`, `unidade-de-trabalho.ts`): `RepositorioDemandas` (listar, reservarSeAberta, buscarPorId com nome do dono, buscarParaAtualizar com lock, encerrar), `RepositorioTrace` (registrar), `RepositorioUsuarios` (buscarPorId) e `UnidadeDeTrabalho` (executa uma função numa transação com os repositórios ligados a ela)
- [X] T010 [P] Criar `api/src/infra/config.ts` (variáveis de ambiente: host, porta, usuário, senha e banco do MySQL; porta HTTP; falha clara se faltar variável) e `api/src/infra/mysql/pool.ts` (pool `mysql2/promise` com `connectionLimit` ≥ 5 e timeout de conexão)
- [X] T011 Criar `api/src/infra/mysql/unidade-de-trabalho.ts`: pega uma conexão do pool, `BEGIN`, executa, `COMMIT` ou `ROLLBACK` em erro, e sempre devolve a conexão; transação curta, sem espera de usuário (constituição, princípio IV)
- [X] T012 [P] Criar `api/src/infra/mysql/repositorio-usuarios.ts` (busca `app_user` por id com SQL parametrizado)
- [X] T013 Criar `api/src/http/autenticacao.ts`: lê `x-user-id` (inteiro) e `x-scopes` (separados por vírgula, sem espaços significativos), resolve o usuário pela porta (401 se ausente, inválido ou inexistente) e exige `demands` **ou** `demands:supervise` (403 `SEM_PERMISSAO` se nenhum); expõe `usuario` e `ehSupervisor` na requisição
- [X] T014 Criar `api/src/http/erros.ts` e o error handler central: erro de domínio → status e corpo `{ code, message }` do contrato (404, 409, 403, 401); validação Zod (`hasZodFastifySchemaValidationErrors`) → 400 `REQUISICAO_INVALIDA` com `details [{field, message}]` em pt-BR; falha de serialização e erro desconhecido → 500 genérico, sem stack nem nome de classe; log sem corpo da requisição
- [X] T015 Criar `api/src/http/esquemas.ts` com o esquema Zod de `Demanda` (resposta) e o de erro, e `api/src/http/app.ts` com `construirApp(dependencias)`: Fastify com `setValidatorCompiler`/`setSerializerCompiler`, `ZodTypeProvider`, hook de autenticação, error handler; as dependências (repositórios, unidade de trabalho) entram por parâmetro para os testes poderem trocá-las
- [X] T016 Criar os **esqueletos** dos adaptadores que as histórias vão preencher, para o build fechar no checkpoint: `api/src/infra/mysql/repositorio-demandas.ts` e `api/src/infra/mysql/repositorio-trace.ts`, implementando as portas de T009 com métodos que lançam "não implementado"; criar `api/src/infra/mysql/index.ts` que fabrica todos os adaptadores e `api/src/servidor.ts` (monta o pool, as implementações de `infra` e sobe o app). As histórias substituem os corpos dos métodos (T021, T030, T037)
- [X] T017 Criar o ambiente de teste: `api/tests/integracao/ambiente.ts` e `api/tests/globalSetup.ts`, que **não** criam o banco (`orbita_teste` e o `GRANT` vêm de `db/00-banco-teste.sql`, T002) mas recriam as tabelas a partir de `db/schema.sql` nele, e expõem helpers para inserir usuários e demandas com status/dono/fila e limpar as tabelas entre testes; **editar** (não recriar) `api/vitest.config.ts` do T005 para acrescentar `fileParallelism: false` e o `globalSetup`. Os testes **não** tocam no banco de desenvolvimento seedado

**Checkpoint**: `npm run build` na API compila; `docker compose up -d` sobe o MySQL com 5.000 demandas.

---

## Phase 3: User Story 1 - Consultar a fila de demandas (Priority: P1) 🎯 MVP

**Goal**: listar demandas com paginação no servidor, filtro por `queue` e `status`, ordenação por `id`/`updated_at` e total.

**Independent Test**: com o seed, abrir a lista, paginar, filtrar e ordenar; total e conteúdo batem; parâmetro desconhecido devolve 400.

### Tests for User Story 1

- [X] T018 [US1] Criar `api/tests/integracao/listar-demandas.test.ts` cobrindo: total sem filtro e só a primeira página; filtro por `queue` e `status` e total filtrado; ordenação por `id` e `updated_at` nos dois sentidos com desempate estável entre páginas; página além do fim (`items: []`, total correto); `pageSize` 0 e 101 → 400; `page` 0 → 400; parâmetro desconhecido, `sort=nome` e `status=9` → 400; sem `x-user-id` → 401; sem `demands`/`demands:supervise` → 403; `demands:supervise` sozinho → 200; todo corpo de erro tem `message` em pt-BR e **não** contém `stack` nem nome de classe (por exemplo `Error`, `at `, `.ts`)

### Implementation for User Story 1

- [X] T019 [P] [US1] Criar `api/src/application/casos-de-uso/listar-demandas.ts` (recebe `page`, `pageSize`, `queue?`, `status?`, `sort`, `order`; devolve `items`, `total`, `page`, `pageSize` pela porta)
- [X] T020 [P] [US1] Criar o esquema de query em `api/src/http/esquemas.ts` com `z.strictObject`: `page` inteiro ≥ 1 (padrão 1), `pageSize` inteiro 1–100 (padrão 20), `queue` texto 1–40, `status` 1|2|3, `sort` `id`|`updated_at` (padrão `id`), `order` `asc`|`desc` (padrão `asc`); valores vêm como texto na query, converter com Zod
- [X] T021 [US1] Implementar `listar` em `api/src/infra/mysql/repositorio-demandas.ts`: `COUNT(*)` e `SELECT` com `LEFT JOIN app_user` para `workerName`, `WHERE` montado só com condições fixas e valores vinculados, `ORDER BY <coluna do mapa fixo> <direção do mapa fixo>, id <mesma direção>`, `LIMIT ? OFFSET ?`. Usar `pool.query` (com `?`) na listagem, porque `LIMIT`/`OFFSET` parametrizados não são confiáveis com `execute`; os valores continuam vinculados, nunca interpolados
- [X] T022 [US1] Criar `api/src/http/rotas/demandas.ts` com `GET /demands` (esquemas de query e de resposta, chama o caso de uso) e registrá-la em `api/src/http/app.ts`
- [X] T023 [P] [US1] Criar em `web/src/app/core/`: `demandas.service.ts` (`listar` com `HttpClient`, tipos da resposta), `usuario-atual.ts` (signal com id, nome e escopos do usuário simulado), `usuarios-simulados.ts` (lista dos 5 usuários do seed, com escopos; um é supervisor) e `cabecalhos.interceptor.ts` (`HttpInterceptorFn` que adiciona `x-user-id` e `x-scopes`)
- [X] T024 [P] [US1] Criar `web/src/app/demandas/seletor-usuario.component.ts`: seletor "Entrando como", standalone, `OnPush`, atualiza o signal de `usuario-atual.ts`
- [X] T025 [US1] Criar `web/src/app/demandas/lista-demandas.component.ts` (+ `.html`): standalone, `OnPush`, signals; formulário reativo de filtros (fila como `<select>` com a lista fixa `suporte`, `vendas`, `financeiro`, `retencao` definida como constante em `web/src/app/core/filas.ts`, mais a opção "todas"; e status), ordenação por `id`/`updated_at`, paginação com total, `@for`/`@if`, estados de carregando, vazio e erro (texto em pt-BR, `role="alert"` no erro); recarrega ao mudar filtro, ordenação, página ou usuário
- [X] T026 [US1] Ligar tudo em `web/src/app/app.config.ts` (`provideHttpClient(withInterceptors([...]))`, sem `provideZoneChangeDetection`) e `web/src/app/app.ts`/`app.html` (seletor + lista)

**Checkpoint**: US1 funcional e testável; `npm test` da API passa em `listar-demandas.test.ts`.

---

## Phase 4: User Story 2 - Reservar sem disputa (Priority: P1)

**Goal**: reservar com `UPDATE` condicional; quem perde recebe 409 com o dono; reserva repetida do mesmo usuário é sucesso.

**Independent Test**: duas reservas simultâneas da mesma demanda → um 200 e um 409 com o nome do vencedor; a tela atualiza a linha sem recarregar.

### Tests for User Story 2

- [X] T027 [US2] Criar `api/tests/integracao/reservar-demanda.test.ts`: reserva ok (200, `status=2`, `workerId` e `workerName` corretos); inexistente → 404; reservada por outro → 409 `DEMANDA_JA_RESERVADA` com `message`, `holder {id,name}` e `demanda` atual; encerrada → 409 `DEMANDA_ENCERRADA` com `demanda`; mesmo usuário reservando de novo → 200 sem alterar a demanda; `id` inválido (`abc`, `0`) → 400; sem escopo → 403; `demands:supervise` sozinho reserva com sucesso
- [X] T028 [US2] Criar `api/tests/integracao/reserva-concorrente.test.ts` (**exigência FR-017**): repete **25 vezes**; em cada rodada cria uma demanda aberta nova e dispara com `Promise.all` duas chamadas `inject` de `POST /demands/:id/reserve` por usuários diferentes; exige exatamente um 200 e um 409, que o `holder` do 409 seja o vencedor, e exatamente uma linha em `demand_trace` para a demanda. O pool de teste precisa ter ≥ 2 conexões

### Implementation for User Story 2

- [X] T029 [US2] Criar `api/src/application/casos-de-uso/reservar-demanda.ts`: dentro da unidade de trabalho, `reservarSeAberta`; se afetou 1 linha, registra o trace `reservada` e devolve a demanda; se afetou 0, desfaz a transação e consulta a demanda **fora** dela: não existe → `DemandaNaoEncontrada`; `workerId` igual ao usuário → sucesso sem trace; reservada por outro → `DemandaJaReservada`; encerrada → `DemandaEncerrada`
- [X] T030 [US2] Preencher no esqueleto `api/src/infra/mysql/repositorio-demandas.ts` (T016): `reservarSeAberta` com `UPDATE demand SET status = 2, worker_id = ? WHERE id = ? AND status = 1` e `affectedRows`, e `buscarPorId` com `LEFT JOIN app_user` para o nome do dono; e preencher `registrar` no esqueleto `api/src/infra/mysql/repositorio-trace.ts` (T016) (`INSERT INTO demand_trace (demand_id, user_id, action, note)`, `action` até 20 caracteres, `note` até 500 caracteres ou nulo)
- [X] T031 [US2] Adicionar `POST /demands/:id/reserve` em `api/src/http/rotas/demandas.ts` (params `id` inteiro positivo; respostas 200 `Demanda` e 409 com `code`, `message`, `holder`, `demanda`; contrato em contracts/api.md)
- [X] T032 [P] [US2] Adicionar `reservar(id)` em `web/src/app/core/demandas.service.ts`, tipando o corpo do 409 (`message`, `holder`, `demanda`)
- [X] T033 [US2] Em `web/src/app/demandas/lista-demandas.component.ts`/`.html`: botão **Reservar** nas demandas abertas; no sucesso, atualiza a linha; no 409, mostra a `message` (com `role="alert"`) e **substitui a linha** pela `demanda` do corpo, sem recarregar a página nem refazer a listagem; desabilita o botão da linha enquanto a chamada está em andamento

**Checkpoint**: US1 e US2 funcionam e os testes de reserva, incluindo as 25 corridas, passam.

---

## Phase 5: User Story 3 - Encerrar uma demanda (Priority: P2)

**Goal**: encerrar com `SELECT ... FOR UPDATE` em transação curta, na ordem 404 → 409 → 403.

**Independent Test**: dono e supervisor encerram; outro operador recebe 403; corpo inválido recebe 400; o formulário valida o motivo e desabilita o botão.

### Tests for User Story 3

- [X] T034 [US3] Criar `api/tests/integracao/encerrar-demanda.test.ts`: sucesso do dono (200, `status=3`, `outcome=success`, `failure_reason` nulo); insucesso com motivo (`failureReason` de 1 a 40 caracteres); 400 para: insucesso sem motivo, motivo de 41 caracteres, sucesso com motivo, `note` de 501 caracteres, `outcome` desconhecido, campo extra, corpo vazio; `note` de 500 caracteres aceita; **ordem das checagens**: inexistente → 404 (mesmo sem ser dono), aberta → 409 `DEMANDA_NAO_RESERVADA`, encerrada → 409, reservada por outro sem supervisão → 403, com `demands:supervise` → 200; sem escopo → 403; dois encerramentos simultâneos da mesma demanda → um 200 e um 409; todo corpo de erro tem `message` em pt-BR e **não** contém `stack` nem nome de classe

### Implementation for User Story 3

- [X] T035 [P] [US3] Criar o esquema do corpo em `api/src/http/esquemas.ts` com `z.strictObject`: `outcome` `success`|`failure`; `failureReason` texto 1–40 (obrigatório se `failure`, **proibido** se `success`, validado com `superRefine` e mensagens em pt-BR); `note` opcional até 500 caracteres
- [X] T036 [US3] Criar `api/src/application/casos-de-uso/encerrar-demanda.ts`: na unidade de trabalho, `buscarParaAtualizar` (lock); inexistente → `DemandaNaoEncontrada`; `status` diferente de 2 → `DemandaNaoReservada`; não é o dono e não é supervisor → `SemPermissao`; senão `encerrar` + trace `encerrada` com a `note` informada; devolve a demanda atualizada
- [X] T037 [US3] Implementar em `api/src/infra/mysql/repositorio-demandas.ts`: `buscarParaAtualizar` (`SELECT ... FROM demand WHERE id = ? FOR UPDATE`) e `encerrar` (`UPDATE demand SET status = 3, outcome = ?, failure_reason = ?, note = ? WHERE id = ?`), tudo na conexão da transação
- [X] T038 [US3] Adicionar `POST /demands/:id/finish` em `api/src/http/rotas/demandas.ts` (params `id`, corpo do T035, respostas 200/400/403/404/409 conforme contracts/api.md)
- [X] T039 [P] [US3] Adicionar `encerrar(id, corpo)` em `web/src/app/core/demandas.service.ts`
- [X] T040 [US3] Criar `web/src/app/demandas/form-encerramento.component.ts` (+ `.html`): standalone, `OnPush`, formulário reativo com `outcome`, `failureReason` e `note`; `failureReason` com `required` e `maxLength(40)` **somente** quando `outcome` é `failure`; ao trocar de insucesso para sucesso, **limpa o motivo** e remove os validadores; `note` com `maxLength(500)`; botão de confirmar **desabilitado enquanto o formulário for inválido** (e durante o envio); mensagens de erro de campo em pt-BR; trata 403 e 409 mostrando a mensagem
- [X] T041 [US3] Integrar o formulário em `web/src/app/demandas/lista-demandas.component.html`: ação "Encerrar" visível (`@if`) para o dono da reserva ou para quem tem `demands:supervise`; ao concluir, atualiza a linha com a demanda devolvida

**Checkpoint**: US1 a US3 funcionam; testes de encerramento passam.

---

## Phase 6: User Story 4 - Histórico de cada mudança (Priority: P2)

**Goal**: provar que `demand_trace` é gravado na mesma transação e só quando há mudança.

**Independent Test**: reservar e encerrar geram uma linha cada; recusas não geram; uma falha ao gravar o trace desfaz a mudança.

### Tests for User Story 4

- [ ] T042 [US4] Criar `api/tests/integracao/demand-trace.test.ts`: reserva efetiva grava 1 linha (`demand_id`, `user_id`, `action='reservada'`, `note` nula, `created_at` preenchido); encerramento grava 1 linha (`action='encerrada'`, `note` igual à informada); reserva repetida do dono, 404, 409, 403 e 400 **não** gravam linha; **atomicidade**: construir o app com um `RepositorioTrace` que lança erro e provar que, na reserva e no encerramento, a demanda continua como estava (status, `worker_id`, `outcome`) e a resposta é 500 genérico
- [ ] T043 [P] [US4] Criar `api/tests/unidade/trace-imutavel.test.ts`: falha se algum arquivo em `api/src` contiver `UPDATE demand_trace` ou `DELETE FROM demand_trace` (garante a imutabilidade do histórico)

### Implementation for User Story 4

- [ ] T044 [US4] Rodar `api/tests/integracao/demand-trace.test.ts` (T042) e corrigir as falhas encontradas em `api/src/application/casos-de-uso/` e `api/src/infra/mysql/` (trace fora da transação, trace em caminho de recusa ou em reserva repetida); registrar no resumo da entrega o resultado do teste

**Checkpoint**: as quatro histórias completas e testadas.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T045 Rodar `EXPLAIN` das consultas da listagem (com e sem filtro, ordenando por `updated_at`) no banco seedado, registrar o resultado em `specs/001-fila-demandas/research.md` e conferir que uma página responde bem abaixo de 2 s (SC-002); **não** criar índice (esquema fixo)
- [ ] T046 Revisão de segurança do código: nenhuma consulta com interpolação ou template string com entrada (`rg` em `api/src/infra/mysql`); ordenação só pelo mapa fixo; nenhuma senha ou segredo no repositório; resposta de erro e log sem stack, nome de classe ou corpo da requisição
- [ ] T047 [P] Criar `README.md` na raiz em pt-BR: pré-requisitos, `.env` a partir do `.env.example`, subir o banco, rodar API e web, rodar os testes, usuários simulados e o aviso de que a autenticação por cabeçalho é só para esta versão mínima
- [ ] T048 Rodar `npm test` em `api/` e colar no resumo a saída real (contagem de testes e resultado); se algo falhar, mostrar a falha
- [ ] T049 Rodar `npx ng build` em `web/` (build e checagem de tipos, exigidos pela constituição, princípio VI) e colar no resumo a saída real; se falhar, corrigir os erros antes do roteiro manual
- [ ] T050 Executar o roteiro manual do `quickstart.md` (seções 3 e 5) com a API e o front no ar e registrar o que foi conferido; dizer explicitamente o que **não** foi conferido

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → histórias → **Polish (7)**.
- T003 e T004 antes de T002 funcionar de ponta a ponta; T005 antes de qualquer tarefa em `api/`; T006 antes de qualquer tarefa em `web/`.

### User Story Dependencies

- **US1**: depende só da fase 2.
- **US2**: depende da fase 2; compartilha `repositorio-demandas.ts` e `rotas/demandas.ts` com US1 (editar em sequência, não em paralelo).
- **US3**: depende da fase 2 e, no front, do botão/linha de US2 (T041 usa a lista de T025/T033).
- **US4**: depende de US2 e US3 (testa o que elas gravam).

### Dentro de cada história

- Teste antes da implementação (deve falhar primeiro) → caso de uso → repositório → rota → front.

### Parallel Opportunities

- Setup: T003, T004 e T006 em paralelo.
- Fundacional: T007, T008, T010 e T012 em paralelo.
- US1: T019 e T020 em paralelo; T023 e T024 (front) em paralelo com o backend.
- US2: T032 em paralelo com T029–T031.
- US3: T035 e T039 em paralelo.
- API e web podem ser feitos por frentes diferentes depois do contrato (contracts/api.md) fixado.

## Parallel Example: User Story 1

```text
Em paralelo: T019 (caso de uso), T020 (esquema de query), T023 (serviço e interceptor no web), T024 (seletor de usuário)
Depois em sequência: T021 (repositório) → T022 (rota) → T025 (lista) → T026 (ligação)
```

## Implementation Strategy

### MVP (US1 + US2)

1. Fases 1 e 2.
2. US1 (listar) e US2 (reservar), com o teste das 25 corridas passando.
3. **Parar e validar**: a corrida é o requisito de maior risco.

### Entrega incremental

1. US3 (encerrar) e depois US4 (prova do histórico).
2. Polish: EXPLAIN, revisão de segurança, README, testes e roteiro manual.

### Observações

- Frontend: o gate é `ng build` (T049) e o roteiro manual; testes de componente são opcionais (constituição v1.1.0).
- Autenticação por cabeçalho é falsificável: aceito só nesta versão mínima.
