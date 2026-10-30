# Quickstart: validar a Fila de Demandas

Pré-requisitos: Docker (só para o MySQL), Node 22+ e npm. API e front rodam direto no Node local. Detalhes de contrato em [contracts/api.md](contracts/api.md)
e de dados em [data-model.md](data-model.md). Os comandos abaixo dependem de os scripts serem
criados na implementação (`/speckit-tasks` → `/speckit-implement`).

## 1. Configurar o ambiente e subir o banco

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
docker compose up -d
```

Os valores do `.env.example` funcionam como estão (são só para desenvolvimento local; o MySQL
escuta apenas em `127.0.0.1:3307`). O `.env` fica fora do repositório.

Esperado: MySQL 8 saudável (`docker compose ps`), com as tabelas criadas e 5.000 linhas em
`demand`. Os scripts de `db/` só rodam na primeira criação do volume; para recarregar:
`docker compose down -v && docker compose up -d`.

## 2. Subir a API e o front

```bash
cd api && npm install && npm run dev      # API
cd web && npm install && npm start        # front, com proxy para a API
```

## 3. Roteiro manual

1. Abrir o front; escolher o usuário em "entrando como".
2. Listar: conferir total, trocar de página, filtrar por fila e status, ordenar por `updated_at`.
3. Reservar uma demanda aberta: a linha passa a "reservada" com o seu nome.
4. Trocar de usuário e tentar reservar a mesma demanda: aparece a mensagem com o nome de quem
   ficou, e a linha é atualizada sem recarregar a página.
5. Encerrar: escolher "insucesso" sem motivo → botão desabilitado; trocar para "sucesso" →
   o motivo é limpo e o botão habilita.
6. Como outro operador, a demanda alheia não mostra o botão **Encerrar** (a tela já esconde a
   ação); a recusa (403) é da API, conferida na seção 5. Como supervisor, o botão aparece e o
   encerramento é aceito.

## 4. Testes automatizados

```bash
cd api && npm test      # Vitest contra o MySQL do compose
cd web && npx ng build  # build e checagem de tipos do front
```

O front não tem testes de componente nesta entrega; além do build, é conferido pelo roteiro manual da seção 3.

Esperado: todos verdes, incluindo o teste de concorrência (25 rodadas, cada uma com
exatamente um 200 e um 409 e um único `demand_trace`).

## 5. Verificações pontuais

- Sem `x-user-id` → 401; com `x-scopes` vazio ou sem `demands`/`demands:supervise` → 403.
- `GET /demands?sort=nome` → 400; `GET /demands?foo=1` → 400.
- `POST /demands/:id/finish` com `failure` sem motivo → 400; com `success` e motivo → 400.
- Encerrar demanda aberta → 409; inexistente → 404 (antes de qualquer 403).
- Em `demand_trace`: uma linha por reserva efetiva e por encerramento; nenhuma por recusa.
