# Research: Fila de Demandas

Versões conferidas em 2026-10-30 (`npm view` e documentação oficial via Context7).

## Versões

| Item | Decisão | Observação |
|---|---|---|
| Node | 22+ | Roda no Node local (24 nesta máquina); `engines: ">=22"`. Sem container para API/web; não testei no 22 |
| TypeScript | 5.9.x | `latest` é 7.x; não adotado nesta entrega |
| Fastify | 5.x (5.12.7) | |
| Zod | 4.x (4.6.7) | |
| fastify-type-provider-zod | 6.1.0 | decisão do Marcus (a 7.0.0 é a `latest`); peers: `zod >=4.1.5`, `fastify ^5.5.0` |
| mysql2 | 3.x | usar `mysql2/promise` |
| Vitest | 4.1.x (4.1.12 existe no npm) | decisão do Marcus |
| Angular | 21.2.x | `latest` do npm é 22; instalar com `@angular/cli@21` |

## Decisões

### Zod 4 + fastify-type-provider-zod
- **Decision**: `app.setValidatorCompiler(validatorCompiler)` e `setSerializerCompiler(serializerCompiler)`;
  rotas com `withTypeProvider<ZodTypeProvider>()`. Esquemas `z.strictObject` na querystring.
- **Rationale**: validação e tipos vêm do mesmo esquema; falha de validação vira
  `FST_ERR_VALIDATION` (400), tratado no error handler central com `hasZodFastifySchemaValidationErrors`.
  Resposta é serializada contra o esquema (`isResponseSerializationError` → 500 genérico).
- **Alternatives**: validação manual nos casos de uso (mais código, tipos duplicados).
- **A verificar na instalação**: o `npm view` da 6.1.0 lista `@fastify/swagger >=9.5.1` em
  `peerDependencies` e não mostrou `peerDependenciesMeta`. Se não for opcional, o npm 7+ o
  instala sozinho. Conferir `npm ls @fastify/swagger` após o `npm install`; se aparecer,
  avisar antes de manter a dependência.

### Reserva por UPDATE condicional
- **Decision**: `UPDATE demand SET status=2, worker_id=?, updated_at=NOW(3) WHERE id=? AND status=1`
  e `affectedRows`.
- **Rationale**: o InnoDB serializa os dois UPDATEs na mesma linha; só um vê `status=1`.
  Zero lock mantido além do commit.
- **Alternatives**: SELECT + UPDATE (corrida); `SELECT FOR UPDATE` na reserva (funciona, mas
  segura lock sem necessidade).
- **Cuidado**: no `mysql2`, `affectedRows` conta as linhas *encontradas* pelo `WHERE` (flag
  `FOUND_ROWS`), não as alteradas. Como o `WHERE` exige `status = 1`, encontrada implica alterada
  (o status passa de 1 para 2). Premissa informada pelo Marcus; não conferi na documentação do
  `mysql2`, mas o teste das 25 corridas (T028) a exercita.

### Encerramento com FOR UPDATE
- **Decision**: transação curta: `SELECT ... FOR UPDATE`, decide 404/409/403, `UPDATE`, `INSERT trace`, commit.
- **Rationale**: a decisão depende de status e dono; travar a linha garante que não mudam
  entre a checagem e a escrita. A transação vive só dentro da requisição.
- **Alternatives**: UPDATE condicional também no encerramento (exigiria um SELECT depois para
  diferenciar 404/409/403, e o dono pode mudar no meio).

### Isolamento de transação
- **Decision**: manter o padrão do MySQL (REPEATABLE READ). O `UPDATE` condicional e o
  `SELECT ... FOR UPDATE` usam leitura corrente (*locking read*), então não dependem do snapshot.
  A leitura de diagnóstico após `affectedRows=0` deve ser feita **fora** da transação de
  escrita (ou em transação nova), para ver o dado confirmado.

### Listagem
- **Decision**: `COUNT(*)` + `SELECT ... ORDER BY <coluna> <dir>, id <dir> LIMIT ? OFFSET ?`.
  Coluna e direção vêm de mapa fixo (Zod enum → fragmento SQL); valores via `?`.
- **Índices**: só o `ix_queue_status` do esquema fixo; não criar outros. A ordenação por
  `updated_at` é *filesort*; com 5 mil linhas, `OFFSET` é suficiente (conferir com `EXPLAIN`).
- **Alternatives**: paginação por cursor (não pedida; ordenação por dois campos complica).

### Testes de concorrência
- **Decision**: `Promise.all` de duas chamadas a `inject` com usuários diferentes, repetida 25×
  (uma demanda aberta nova por rodada). Esperado: exatamente um 200 e um 409, e um único
  `demand_trace` por rodada.
- **Rationale**: uma corrida só pode passar por sorte; 25 repetições dão confiança sem custo alto.
- **Nota**: `inject` roda no mesmo processo, com pool de conexões; precisa de pool com ≥ 2
  conexões para existir concorrência real no banco.

### Frontend
- **Decision**: interceptor funcional (`HttpInterceptorFn`) adiciona `x-user-id`/`x-scopes`
  a partir de um signal "entrando como"; `proxy.conf.json` encaminha `/demands` para a API;
  no 409, o componente exibe a mensagem e recarrega só a linha (`GET /demands?...` ou resposta
  do próprio erro com a demanda atual). Ao mudar o resultado de insucesso para sucesso, o
  formulário limpa o motivo (`valueChanges` do campo `outcome`).
- **A decidir em contracts**: o 409 de reserva devolve a demanda atual no corpo, para atualizar
  a linha sem nova requisição.
- **Testes do front**: não exigidos; o runner do Angular não é configurado (ao gerar o projeto,
  usar a opção de não criar arquivos de teste). A constituição v1.1.0 torna esses testes opcionais; o gate do front é `ng build`.
- **409 de reserva**: devolve `demanda`, `message` e `holder {id, name}` (ver contrato).

## Resultado do EXPLAIN da listagem (T045)

Medido em 2026-10-30 no banco de desenvolvimento seedado (MySQL 8.4.13, 5.000 demandas, só o
índice `ix_queue_status (queue, status)` do esquema fixo). As consultas são as geradas por
`RepositorioDemandasMysql.listar`, com valores literais no lugar dos `?`. `LIMIT 20`.

| # | Consulta | Plano | Linhas lidas | Observação |
|---|---|---|---|---|
| A | `COUNT(*)` sem filtro | `index` em `ix_queue_status` | ~5.051 | `Using index` (não toca a tabela) |
| B | `COUNT(*)` com `queue='vendas' AND status=1` | `ref` em `ix_queue_status` | 750 | `Using index` |
| C | página 1, sem filtro, `ORDER BY d.id ASC` | `index` na `PRIMARY` | 20 | para no 20º; `LEFT JOIN app_user` por `eq_ref` |
| D | página 1, `queue` + `status`, `ORDER BY d.id ASC` | `ref` em `ix_queue_status` | 750 | já sai ordenado por id dentro do índice, sem `filesort` |
| E | página 250 (a última), sem filtro, `ORDER BY d.updated_at DESC, d.id DESC` | `ALL` (varredura) | 5.051 | **`Using filesort`** |
| F | página 1, `queue` + `status`, `ORDER BY d.updated_at ASC, d.id ASC` | `ref` em `ix_queue_status` | 750 | **`Using filesort`**, só sobre as 750 do filtro |

`EXPLAIN ANALYZE` dos dois casos com `filesort`:

- **E (pior caso):** 15,3 ms no MySQL (5.000 linhas lidas e ordenadas; `Sort ... limit input to
  5000 row(s) per chunk`).
- **F:** 0,73 ms (750 linhas do filtro; ordena só até 20 por chunk).

**Conclusão.** Ordenar por `id` é barato em qualquer filtro (usa a chave primária ou o índice).
Ordenar por `updated_at` faz `filesort`, mas com 5 mil linhas custa ~15 ms no pior caso, bem
abaixo dos 2 s de SC-002. **Nenhum índice foi criado**, porque o esquema é fixo (data-model.md).
Se a tabela crescesse para centenas de milhares de linhas, o primeiro passo seria um índice
`(queue, status, updated_at, id)` e, para páginas profundas, paginação por cursor em vez de
`OFFSET`. Isso só vale medir fora desta versão mínima.

## Riscos e pendências

- Autenticação por cabeçalhos é falsificável: aceito e documentado na spec (versão mínima).
- Esquema do banco fixo e sem FKs: a integridade de `worker_id`/`user_id` depende do código.
- `note` livre pode conter dado pessoal de cliente: sem log do corpo em claro; revisitar
  retenção fora do ambiente de exemplo.
