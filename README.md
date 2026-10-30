# Órbita · Fila de Demandas

Versão mínima da fila de demandas da plataforma Órbita (operadora de telecom), com backend, frontend e banco.
Operadores listam as demandas, **reservam** uma para trabalhar nela e a **encerram** com sucesso ou insucesso.
Duas pessoas nunca ficam com a mesma demanda, e toda mudança deixa um registro de histórico.

## Visão geral

| Parte | Tecnologia | Pasta |
|---|---|---|
| API | Node, TypeScript, Fastify 5, Zod 4, `mysql2` (SQL escrito à mão, sem ORM) | [`api/`](api) |
| Web | Angular 21, standalone, zoneless, `OnPush`, signals, formulários reativos, ícones [`lucide-angular`](https://lucide.dev) | [`web/`](web) |
| Banco | MySQL 8.4 no Docker, com 5.000 demandas de exemplo | [`db/`](db) e [`docker-compose.yml`](docker-compose.yml) |

O que a aplicação faz:

- **Listar** (`GET /demands`): paginação no servidor, filtro por fila e status, ordenação por `id` ou `updated_at`, com o total. Parâmetro desconhecido devolve 400.
- **Reservar** (`POST /demands/:id/reserve`): seguro contra duas pessoas ao mesmo tempo. Quem perde recebe 409 com o nome de quem ficou. O mesmo usuário reservando de novo recebe sucesso.
- **Encerrar** (`POST /demands/:id/finish`): corpo validado (insucesso exige motivo de até 40 caracteres; observação de até 500). Só o dono da reserva, ou quem tem `demands:supervise`, pode encerrar.
- **Histórico**: cada reserva e cada encerramento grava uma linha em `demand_trace`, na mesma transação da mudança.

Os requisitos, o plano e as tarefas estão em [`specs/001-fila-demandas/`](specs/001-fila-demandas/).

## Como rodar do zero

**Pré-requisitos:** Docker (só para o MySQL), Node 22 ou mais novo e npm. Desenvolvi e testei no Node 24; não rodei no 22.

```bash
# 1. Variáveis de ambiente (os valores do exemplo funcionam como estão; são só para uso local)
cp .env.example .env            # PowerShell: Copy-Item .env.example .env

# 2. Banco: cria as tabelas e carrega as 5.000 demandas de exemplo
docker compose up -d
docker compose ps               # aguarde "healthy"

# 3. API (terminal 1), em http://127.0.0.1:3000
cd api
npm install
npm run dev

# 4. Web (terminal 2), em http://localhost:4200
cd web
npm install
npm run dev

# 5. Testes da API (precisam do banco no ar e do .env)
cd api
npm test
```

Notas:

- Abra **http://localhost:4200** (com `localhost`; em alguns ambientes o dev server não responde em `127.0.0.1`). O dev server encaminha `/demands` para a API.
- Os scripts de `db/` só rodam na primeira criação do volume. Para recarregar tudo do zero: `docker compose down -v && docker compose up -d`.
- Os testes usam o banco separado `orbita_teste` (criado por [`db/00-banco-teste.sql`](db/00-banco-teste.sql)); o banco de desenvolvimento não é tocado.
- O build do front (build e checagem de tipos): `cd web && npx ng build`.

### Usuários de exemplo

A autenticação desta versão é simplificada, só por cabeçalho (`x-user-id` e `x-scopes`). No front, o seletor **"Entrando como"** escolhe quem as requisições dizem ser.

| Id | Nome | Escopos |
|---|---|---|
| 1 | Ana Lima | `demands` |
| 2 | Bruno Costa | `demands` |
| 3 | Carla Souza | `demands` |
| 4 | Diego Alves | `demands` |
| 5 | Elisa Ramos (supervisão) | `demands`, `demands:supervise` |

Exemplo direto na API:

```bash
curl -X POST http://127.0.0.1:3000/demands/1/reserve -H 'x-user-id: 2' -H 'x-scopes: demands'
```

**Atenção:** esses cabeçalhos são falsificáveis. Servem só para esta versão mínima; em produção seriam substituídos por autenticação real. A API escuta apenas em `127.0.0.1` por isso. As senhas do `.env.example` também são só de desenvolvimento local (o MySQL do compose escuta apenas em `127.0.0.1`).

## Decisões tomadas

Resumo das principais. O raciocínio completo, com alternativas descartadas, está em [`plan.md`](specs/001-fila-demandas/plan.md) e [`research.md`](specs/001-fila-demandas/research.md); o contrato da API em [`contracts/api.md`](specs/001-fila-demandas/contracts/api.md); o esquema em [`data-model.md`](specs/001-fila-demandas/data-model.md); as regras do projeto na [constituição](.specify/memory/constitution.md).

1. **Reserva por `UPDATE` condicional.** `UPDATE demand SET status = 2, worker_id = ? WHERE id = ? AND status = 1` e leitura de `affectedRows`. Descartei `SELECT` + `UPDATE`, que deixa uma janela entre ler e gravar em que duas pessoas passam na checagem. Quem perde relê a demanda para dizer quem ficou.
2. **Encerramento com `SELECT ... FOR UPDATE` em transação curta.** A decisão depende do estado e do dono, então travar a linha garante que eles não mudam entre checar e gravar. A transação vive só dentro da requisição.
3. **Ordem das checagens no encerramento: 404 → 409 → 403.** Fixada na especificação e testada caso a caso. Antes delas, vêm o 401, o 403 de escopo e o 400 de corpo inválido.
4. **Nenhuma trava de banco enquanto o usuário pensa.** Nada fica aberto entre uma tela e outra. O conflito de edição aparece como 409 e a tela atualiza a linha.
5. **`demand_trace` na mesma transação da mudança.** Se o `INSERT` do histórico falha, a mudança é desfeita; recusas (400, 403, 404, 409) não gravam nada. O código só insere em `demand_trace`, e um teste garante isso.
6. **Clean Architecture enxuta.** `domain`, `application` (casos de uso e portas), `infra` (MySQL) e `http`. Regra de negócio fica nos casos de uso, nunca nas rotas. Só criei abstração onde há fronteira real (banco).
7. **SQL à mão com `mysql2`, sempre com valor vinculado.** O `ORDER BY` sai de um mapa fixo de quatro strings, nunca da entrada do usuário.
8. **Esquema do banco fixo.** Sem colunas, índices nem chaves estrangeiras além das definidas. Por isso ordenar por `updated_at` faz `filesort`; medi (~15 ms no pior caso com 5 mil linhas) e registrei em [`research.md`](specs/001-fila-demandas/research.md#resultado-do-explain-da-listagem-t045).
9. **Erros tratados num lugar só.** Erros de domínio com nome claro viram HTTP num único error handler; a resposta nunca expõe stack, SQL nem nome de classe, e as mensagens são em pt-BR.
10. **O 409 de reserva devolve a demanda atual** (`demanda`, `message`, `holder`), para o front atualizar só aquela linha, sem recarregar a lista.
11. **Interface com tokens de design e tema claro/escuro.** Cores, raios, sombras, espaçamento (escala de 4px) e tipografia ficam em variáveis CSS em [`web/src/styles.css`](web/src/styles.css); o tema escuro vem de `prefers-color-scheme`. Botão, pílula de status, aviso, esqueleto, estado vazio e modal são componentes reutilizáveis em [`web/src/app/ui/`](web/src/app/ui). O modal usa o `<dialog>` nativo (foco preso, Esc e fundo inerte vêm do navegador). Conferi o contraste (WCAG AA) dos pares de cor nos dois temas e a ausência de rolagem horizontal de 360px a 1280px.
12. **Frontend moderno e sem testes de componente.** O gate do front é o `ng build` (build e tipos). Os testes de componente ficaram de fora por prazo; a constituição (v1.1.0) os trata como opcionais.

## Como provei a concorrência

O requisito era provar que duas reservas simultâneas da mesma demanda dão **um sucesso e um 409**.

- **Teste das 25 rodadas** ([`reserva-concorrente.test.ts`](api/tests/integracao/reserva-concorrente.test.ts)). Em cada rodada cria uma demanda aberta nova e dispara duas reservas ao mesmo tempo com `Promise.all`, alternando quem sai primeiro. Exige exatamente um 200 e um 409, que o `holder` do 409 seja o vencedor, que a linha no banco tenha o vencedor como responsável e que exista **uma única** linha em `demand_trace`. Há também uma variante com 5 usuários ao mesmo tempo (um 200 e quatro 409). O pool de teste tem várias conexões, senão não haveria disputa real no banco.
- **Teste de mutação manual.** Para saber se o teste detecta o defeito, tirei o `AND status = 1` do `UPDATE` e rodei a corrida. Ela **falhou já na rodada 1**: `expected [ 200, 200 ] to deeply equal [ 200, 409 ]`, e com 5 usuários vieram cinco 200. Restaurei o código (conferido com `diff`) e os testes voltaram a passar.
- **Outros experimentos do mesmo tipo.** Removi a checagem de dono do encerramento (falharam exatamente os testes de 403), troquei o `rollback` por `commit` (falharam os de atomicidade) e fiz o caso de uso gravar histórico mesmo ao perder a reserva (o teste de unidade pegou). Também plantei um `UPDATE demand_trace` fora do repositório e o teste de imutabilidade o apontou.

Ressalva honesta: esses experimentos de mutação foram **feitos à mão e não rodam no CI**; o que fica no repositório são os testes que os detectam. Também não provei concorrência entre várias instâncias da API, só entre requisições concorrentes de um processo contra um MySQL (a garantia vem do banco, então deve valer, mas não medi).

Hoje são 112 testes da API em 9 arquivos, rodando contra o MySQL real (sem mock de banco).

## O que faria com mais tempo

- **Testes do front** (componentes e um fluxo ponta a ponta, por exemplo com Playwright). Hoje o front só tem `ng build` e verifiquei o comportamento à mão no navegador.
- **Autenticação real** (token assinado) no lugar dos cabeçalhos, e limite de requisições por usuário.
- **CI** com MySQL de serviço, rodando testes e build; e a mutação automatizada (Stryker) nas regras críticas.
- **Rodar no Node 22** (o mínimo declarado) e fixar a versão em um `.nvmrc`/CI.
- **Escala da listagem:** índice `(queue, status, updated_at, id)` e paginação por cursor se a tabela crescer muito (o esquema fixo me impediu agora).
- **Liberar reserva, reabrir demanda e expirar reservas esquecidas**; hoje uma reserva só termina com o encerramento.
- **Endpoint de filas** (hoje a lista de filas é uma constante no front) e observabilidade (identificador de requisição ligando log, erro e histórico).
- **Tratar deadlock do MySQL com nova tentativa** nas transações. Não vi acontecer nos testes, mas o caminho de reserva + histórico concorrente merece essa proteção.
- Auditoria de acessibilidade da tela.

## Uso de IA

Usei o **GitHub Spec Kit com o Claude Code** para a especificação, o plano, as tarefas e a implementação, no fluxo de Spec-Driven Development: constituição, `specify`, `clarify`, `plan`, `tasks`, `analyze` e `implement`, nessa ordem, e só então código. O Claude Code escreveu a maior parte do código e dos testes a partir dessas especificações.

Eu **revisei, decidi e commitei cada etapa**. As decisões de stack, o esquema do banco, a ordem 404 → 409 → 403 e as regras de escopo vieram de mim; o que a IA propôs e eu aceitei ou mudei está nos documentos da pasta [`specs/001-fila-demandas/`](specs/001-fila-demandas/).

Como não confiei na saída só porque estava escrita: pedi os experimentos de mutação descritos acima, rodei os testes e o build a cada fase, e conferi o comportamento da tela no navegador. O que **não** foi verificado está dito neste README (Node 22, front sem testes automatizados, mutação feita à mão).
