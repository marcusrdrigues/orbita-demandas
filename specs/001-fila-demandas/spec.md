# Feature Specification: Fila de Demandas

**Feature Branch**: `001-fila-demandas`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Versão mínima da fila de Demandas da plataforma Órbita (operadora de telecom), backend e frontend: listar demandas com paginação, filtro e ordenação; reservar uma demanda com segurança contra concorrência; encerrar com sucesso ou insucesso; rastrear toda mudança; base com 5 mil demandas de exemplo."

## Clarifications

### Session 2026-10-30

- Q: Todo operador autenticado pode ver e reservar demandas de qualquer fila, ou o acesso é limitado por escopo de fila? → A: Qualquer usuário autenticado vê e reserva demandas de todas as filas; não há escopo por fila nesta versão.
- Q (decisão do plano): Escopos exigidos nas rotas? → A: Listar, reservar e encerrar exigem `demands` ou `demands:supervise`; sem nenhum dos dois, negado.
- Q: Encerramento com "sucesso" e motivo de insucesso preenchido: recusar ou ignorar o motivo? → A: Recusar com erro de requisição inválida e não alterar a demanda.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar a fila de demandas (Priority: P1)

Um operador abre a fila e vê as demandas em páginas, filtrando por fila e por status (aberta, reservada, encerrada) e ordenando por número ou por data da última alteração. A tela informa o total de demandas que atendem ao filtro.

**Why this priority**: sem enxergar a fila não há como reservar nem encerrar nada; é a base de valor da funcionalidade.

**Independent Test**: com a base de exemplo (5 mil demandas), abrir a lista, trocar de página, filtrar por fila e status e mudar a ordenação; conferir que o total e o conteúdo de cada página batem com o filtro.

**Acceptance Scenarios**:

1. **Given** 5 mil demandas cadastradas, **When** o operador abre a lista sem filtro, **Then** vê somente a primeira página e o total geral de demandas.
2. **Given** demandas em várias filas e status, **When** o operador filtra por uma fila e por "aberta", **Then** vê apenas demandas dessa fila e status, e o total reflete o filtro.
3. **Given** uma lista exibida, **When** o operador ordena por data de alteração, **Then** as demandas aparecem na ordem pedida, de forma estável entre páginas.
4. **Given** um pedido com filtro ou ordenação que o sistema não reconhece, **When** a consulta é feita, **Then** o sistema recusa o pedido com erro de requisição inválida e mensagem clara, sem devolver dados.

---

### User Story 2 - Reservar uma demanda sem disputa (Priority: P1)

Um operador reserva uma demanda aberta para trabalhar nela. Se duas pessoas tentarem reservar a mesma demanda ao mesmo tempo, só uma consegue; a outra é informada de quem ficou com ela, e a linha na tela é atualizada sem recarregar a página.

**Why this priority**: evitar trabalho duplicado em duas pessoas na mesma demanda é o principal problema que a fila resolve.

**Independent Test**: disparar duas reservas simultâneas da mesma demanda por usuários diferentes; exatamente uma tem sucesso e a outra recebe conflito com o nome do vencedor.

**Acceptance Scenarios**:

1. **Given** uma demanda aberta, **When** um operador clica em Reservar, **Then** a demanda passa a reservada em nome dele e a linha reflete isso.
2. **Given** uma demanda aberta e dois operadores reservando no mesmo instante, **When** os dois pedidos chegam, **Then** um tem sucesso e o outro recebe conflito informando o nome de quem ficou com a demanda.
3. **Given** um operador que perdeu a disputa, **When** a mensagem de conflito é exibida, **Then** a linha daquela demanda é atualizada na tela mostrando o dono atual, sem recarregar a página.
4. **Given** uma demanda já reservada pelo próprio operador, **When** ele reserva de novo, **Then** o pedido tem sucesso e nada muda na demanda.

---

### User Story 3 - Encerrar uma demanda (Priority: P2)

O dono da reserva (ou um supervisor) encerra a demanda informando se terminou com sucesso ou insucesso. No insucesso, o motivo é obrigatório; uma observação de até 500 caracteres é opcional. O botão de confirmar fica desabilitado enquanto o formulário estiver inválido.

**Why this priority**: fecha o ciclo da demanda, mas depende de listar e reservar.

**Independent Test**: encerrar uma demanda reservada com sucesso, outra com insucesso (com e sem motivo) e tentar encerrar como um usuário sem relação com a reserva.

**Acceptance Scenarios**:

1. **Given** uma demanda reservada pelo operador, **When** ele a encerra com sucesso, **Then** a demanda passa a encerrada com o resultado registrado.
2. **Given** o formulário de encerramento, **When** o operador escolhe insucesso e não informa o motivo, **Then** o botão de confirmar permanece desabilitado e o campo indica que o motivo é obrigatório.
3. **Given** o formulário de encerramento, **When** a observação passa de 500 caracteres, **Then** o formulário fica inválido e o botão desabilitado.
4. **Given** uma demanda reservada por outra pessoa, **When** um operador sem perfil de supervisor tenta encerrá-la, **Then** o sistema nega a operação e a demanda não muda.
5. **Given** uma demanda reservada por outra pessoa, **When** um supervisor a encerra, **Then** o encerramento é aceito.

---

### User Story 4 - Histórico de cada mudança (Priority: P2)

Cada reserva e cada encerramento deixa um registro de quem fez, o quê, quando e com qual observação, de modo que a história da demanda possa ser auditada.

**Why this priority**: dá rastreabilidade e confiança nos dados; não é visível ao operador no dia a dia.

**Independent Test**: reservar e encerrar uma demanda e conferir que existe um registro para cada mudança; forçar uma falha no meio e conferir que nem a mudança nem o registro permanecem.

**Acceptance Scenarios**:

1. **Given** uma reserva bem-sucedida, **When** a operação termina, **Then** existe um registro com a demanda, o usuário, a ação e a data.
2. **Given** um encerramento, **When** a operação termina, **Then** existe um registro com a ação e a observação informada.
3. **Given** uma operação que falha ou é recusada (conflito, sem permissão), **When** o resultado é devolvido, **Then** a demanda não foi alterada e nenhum registro de mudança foi criado.

---

### Edge Cases

- Pedido sem identificação do usuário, ou com usuário inexistente: é recusado como não autenticado.
- Usuário autenticado sem nenhum dos escopos `demands` ou `demands:supervise`: é negado por falta de permissão em qualquer rota.
- Reservar uma demanda já encerrada: é recusado com conflito e mensagem clara.
- Encerrar uma demanda que não está reservada (aberta ou já encerrada): é recusado com conflito e mensagem clara.
- Demanda inexistente em reserva ou encerramento: resposta de não encontrado.
- Página pedida além do fim da lista: devolve página vazia com o total correto.
- Tamanho de página fora de um limite razoável ou número de página inválido: recusado como requisição inválida.
- Corpo de encerramento com resultado desconhecido, motivo junto com "sucesso" ou campos de tipo errado: recusado como requisição inválida, sem alterar a demanda.
- Reserva repetida do mesmo usuário não gera novo registro de histórico.
- Dois encerramentos simultâneos da mesma demanda: só um é aplicado; o outro recebe conflito.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST listar demandas com paginação feita no servidor, devolvendo a página pedida e o total de demandas que atendem ao filtro.
- **FR-002**: O sistema MUST permitir filtrar a lista por fila e por status (aberta, reservada, encerrada).
- **FR-003**: O sistema MUST permitir ordenar a lista por número da demanda ou por data da última alteração, nos dois sentidos, com desempate determinístico para que a paginação seja estável.
- **FR-004**: O sistema MUST recusar com erro de requisição inválida qualquer filtro, ordenação ou parâmetro de paginação desconhecido ou fora do intervalo permitido.
- **FR-005**: O sistema MUST permitir que o usuário autenticado com o escopo `demands` ou `demands:supervise` reserve uma demanda aberta, de qualquer fila, em seu próprio nome; não há restrição de acesso por fila nesta versão.
- **FR-006**: O sistema MUST garantir que, em reservas simultâneas da mesma demanda, exatamente uma tenha sucesso; as demais recebem conflito contendo o nome de quem ficou com a demanda.
- **FR-007**: O sistema MUST tratar a reserva repetida pelo mesmo usuário como sucesso, sem alterar a demanda e sem gerar novo registro de histórico.
- **FR-008**: O sistema MUST permitir encerrar uma demanda reservada com resultado "sucesso" ou "insucesso".
- **FR-009**: O sistema MUST exigir o motivo (até 40 caracteres) no encerramento com insucesso e aceitar observação opcional de até 500 caracteres; o corpo do pedido MUST ser validado no servidor. Motivo informado junto com resultado "sucesso" MUST ser recusado como requisição inválida, sem alterar a demanda.
- **FR-010**: O sistema MUST permitir o encerramento somente ao dono da reserva ou a quem tem o escopo `demands:supervise`; os demais recebem negativa de permissão.
- **FR-011**: O sistema MUST registrar no histórico (quem, qual demanda, qual ação, observação e quando) toda mudança de status de uma demanda, de forma atômica com a mudança: ou ambos são gravados, ou nenhum.
- **FR-012**: O sistema MUST identificar o usuário a partir do cabeçalho `x-user-id` e seus escopos a partir do cabeçalho `x-scopes` (lista separada por vírgula), recusando como não autenticado pedido sem usuário válido. Listar, reservar e encerrar MUST exigir o escopo `demands` ou `demands:supervise`; sem nenhum dos dois, o pedido é negado por falta de permissão. Esta é uma autenticação simplificada, própria desta versão mínima.
- **FR-013**: O sistema MUST fornecer uma base de dados de exemplo com 5 mil demandas, usuários de exemplo e ambiente local de execução do banco, para uso em desenvolvimento e testes.
- **FR-014**: A tela MUST exibir a lista paginada, mostrando o título, a fila, o status e o responsável de cada demanda, com filtro de fila e de status e, em cada demanda aberta, o botão Reservar.
- **FR-015**: Ao receber conflito numa reserva, a tela MUST exibir a mensagem com o nome de quem ficou com a demanda e atualizar aquela linha sem recarregar a página.
- **FR-016**: O formulário de encerramento MUST exigir o motivo somente quando o resultado for insucesso, limitar o motivo a 40 e a observação a 500 caracteres, limpar o motivo ao trocar de insucesso para sucesso e manter o botão de confirmar desabilitado enquanto estiver inválido.
- **FR-017**: O sistema MUST ter ao menos um teste automatizado que prove que duas reservas simultâneas da mesma demanda resultam em um sucesso e um conflito.
- **FR-018**: As mensagens ao usuário e os erros MUST estar em português do Brasil e não expor detalhes internos.

### Key Entities *(include if feature involves data)*

- **Usuário**: pessoa que opera a fila; tem identificador e nome (exibido ao perdedor de uma disputa).
- **Demanda**: item de trabalho que pertence a uma fila e tem um título (texto curto que a descreve). Tem status (aberta, reservada, encerrada), responsável atual quando reservada, resultado (sucesso ou insucesso), motivo do insucesso (até 40 caracteres), observação de até 500 caracteres e data da última alteração.
- **Histórico da demanda**: registro imutável de cada mudança; liga demanda, usuário, ação, observação e data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das tentativas simultâneas de reserva da mesma demanda, exatamente uma pessoa fica com ela e as demais são informadas de quem ficou.
- **SC-002**: Com a base de 5 mil demandas, o operador vê qualquer página da lista, com filtro e ordenação aplicados, em até 2 segundos.
- **SC-003**: 100% das mudanças de status de demandas têm um registro de histórico correspondente, e 0% das operações recusadas ou falhas deixam alteração ou registro parcial.
- **SC-004**: O operador consegue reservar uma demanda em um único clique, e uma disputa perdida é explicada na própria tela sem recarregar a página.
- **SC-005**: Nenhum encerramento inválido (insucesso sem motivo, observação acima de 500 caracteres, usuário sem permissão) é aceito.

## Assumptions

- A demanda pertence a uma fila (campo de fila) e tem número identificador, além dos campos citados na descrição; filas são valores de texto livres vindos da base de exemplo.
- O filtro por fila aceita um valor exato; o filtro por status aceita um dos três estados. Valores de fila inexistentes devolvem lista vazia, não erro. Na tela, o filtro de fila é uma lista fixa com as filas da base de exemplo (suporte, vendas, financeiro, retencao), definida no próprio front; não há consulta de filas na API.
- Paginação padrão de 20 itens, com máximo de 100 por página; ordenação padrão por número da demanda crescente.
- Autenticação simplificada por cabeçalhos é aceitável por ser uma versão mínima; em produção seria substituída por autenticação real e os cabeçalhos não seriam confiáveis (risco conhecido, fora de escopo).
- Quem tem `demands:supervise` pode listar e reservar como qualquer operador (os dois escopos bastam para essas rotas); o escopo `demands:supervise` amplia o encerramento a demandas de outros.
- O conflito de reserva devolve a demanda atual e o dono (id e nome), para a tela atualizar a linha sem nova consulta.
- Não há liberação de reserva, reabertura, criação ou edição de demandas, nem escopo de acesso por fila, nesta versão.
- A observação do histórico copia a observação informada na ação; a reserva não tem observação.
- Os dados de exemplo são fictícios; nenhum dado pessoal real é usado.
