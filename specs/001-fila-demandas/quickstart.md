# Quickstart: validar a Fila de Demandas

Pré-requisitos: Docker (só para o MySQL), Node 22+ e npm. API e front rodam direto no Node local. Detalhes de contrato em [contracts/api.md](contracts/api.md)
e de dados em [data-model.md](data-model.md). Os comandos abaixo dependem de os scripts serem
criados na implementação (`/speckit-tasks` → `/speckit-implement`).

## 1. Subir o banco

```bash
docker compose up -d
```

Esperado: MySQL 8 saudável, com as tabelas criadas e 5.000 linhas em `demand`.

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
6. Como outro operador, tentar encerrar demanda alheia → recusado (403); como supervisor → aceito.

## 4. Testes automatizados

```bash
cd api && npm test      # Vitest contra o MySQL do compose
```

O front não tem testes automatizados nesta entrega; é conferido pelo roteiro manual da seção 3.

Esperado: todos verdes, incluindo o teste de concorrência (25 rodadas, cada uma com
exatamente um 200 e um 409 e um único `demand_trace`).

## 5. Verificações pontuais

- Sem `x-user-id` → 401; com `x-scopes` vazio ou sem `demands`/`demands:supervise` → 403.
- `GET /demands?sort=nome` → 400; `GET /demands?foo=1` → 400.
- `POST /demands/:id/finish` com `failure` sem motivo → 400; com `success` e motivo → 400.
- Encerrar demanda aberta → 409; inexistente → 404 (antes de qualquer 403).
- Em `demand_trace`: uma linha por reserva efetiva e por encerramento; nenhuma por recusa.
