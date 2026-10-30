<!--
Sync Impact Report
- Version change: (template não preenchido) → 1.0.0
- Princípios adicionados: I a VIII (todos novos)
- Seções adicionadas: Restrições Técnicas e de Segurança; Fluxo de Desenvolvimento
- Seções removidas: nenhuma
- TODOs adiados: nenhum
-->

# Órbita Demandas Constitution

## Core Principles

### I. Clean Architecture Enxuta
O backend MUST ser dividido em quatro camadas: `domain`, `application`, `infra` e `http`.
A dependência MUST apontar para dentro: `domain` não conhece framework, banco nem HTTP;
`application` orquestra os casos de uso e declara as portas (interfaces); `infra` implementa
as portas como adaptadores; `http` apenas traduz requisição e resposta.
Abstração só é criada em fronteira real (banco, serviço externo) ou com segunda implementação.

*Motivo*: isola a regra de negócio e mantém a estrutura pequena o bastante para a entrega em 4h.

### II. Regras de Negócio nos Casos de Uso
Toda regra de negócio MUST viver em casos de uso (`application`) ou no `domain`. Rotas e
controllers MUST NOT conter regra de negócio; só validam o formato da entrada, chamam o caso
de uso e traduzem o resultado ou o erro de domínio para HTTP.

*Motivo*: a regra fica testável sem subir HTTP e não se duplica entre rotas.

### III. SQL à Mão com mysql2, Sempre Parametrizado
O acesso a dados MUST usar `mysql2` com SQL escrito à mão. ORM e query builder MUST NOT ser
usados. Todo valor vindo de fora MUST ser passado como parâmetro vinculado (`?`); concatenar
entrada em SQL é proibido. O SQL fica nos adaptadores de `infra`, nunca em `domain`,
`application` ou `http`.

*Motivo*: controle total sobre as consultas e as transações, e proteção contra SQL injection.

### IV. Nenhuma Trava de Banco Durante a Interação do Usuário
Transação aberta, `SELECT ... FOR UPDATE` ou qualquer lock MUST NOT atravessar uma espera
pelo usuário. Transações são curtas, abertas e fechadas dentro de uma única requisição, e
cobrem só as operações de banco. Conflito de edição concorrente MUST ser detectado por
controle otimista (por exemplo, coluna de versão conferida no `UPDATE`) e devolvido como erro
de domínio claro.

*Motivo*: lock preso enquanto alguém pensa trava os demais usuários e esgota conexões.

### V. Toda Mudança Grava `demand_trace` na Mesma Transação
Criar, alterar ou mudar o estado de uma demanda MUST gravar um registro em `demand_trace` na
mesma transação da mudança. Ou os dois são confirmados, ou nenhum. Nenhum caminho de escrita
pode alterar uma demanda sem deixar rastro.

*Motivo*: o histórico é a auditoria da demanda e só é confiável se for atômico com a mudança.

### VI. Testes de Integração contra MySQL Real
Todo comportamento novo ou alterado MUST entrar com teste, no backend e no frontend. Os testes
de integração do backend MUST rodar contra uma instância real de MySQL; mock ou banco em
memória não substitui o MySQL nesses testes. Os testes MUST ser executados antes de a entrega
ser declarada concluída.

*Motivo*: SQL à mão, transações e `demand_trace` só se validam contra o banco de verdade.

### VII. Frontend Angular Moderno
O frontend MUST usar componentes standalone, `ChangeDetectionStrategy.OnPush`, signals para
estado, formulários reativos e o controle de fluxo nativo `@if` / `@for`. `NgModule`,
`*ngIf` e `*ngFor` MUST NOT ser usados em código novo. A validação do frontend é experiência
de uso; a validação que vale MUST estar no backend.

### VIII. pt-BR e Simplicidade
Código de domínio, mensagens ao usuário, erros, comentários e documentação MUST estar em
português do Brasil; termos técnicos consagrados (`Service`, `Port`, `Adapter`, `Controller`)
ficam em inglês. O prazo de entrega é de 4h: a solução MUST ser a mais simples que atende à
spec, e toda complexidade adicional MUST ser justificada no plano.

## Restrições Técnicas e de Segurança

- Backend em Node.js com `mysql2`; frontend em Angular. Dependência nova MUST ser aprovada
  antes de entrar, com finalidade, manutenção e licença informadas.
- Autorização MUST ser conferida no servidor em todo endpoint; identificador vindo do cliente
  não prova posse do recurso.
- Segredos MUST ficar em variável de ambiente, nunca no repositório.
- Respostas de erro MUST NOT expor stack trace, nome de classe nem detalhe interno; logs MUST
  NOT gravar senha, token nem dado pessoal em claro.
- Dado pessoal segue a LGPD: finalidade, mínimo necessário, retenção e forma de apagar.

## Fluxo de Desenvolvimento

- Trabalho segue Spec-Driven Development: spec, plano e tarefas aprovados antes do código.
- Commits seguem Conventional Commits em português, com escopo quando houver.
- Todo plano MUST ter uma verificação de conformidade com esta constituição (Constitution
  Check); desvio MUST ser registrado e justificado.

## Governance

Esta constituição prevalece sobre as demais práticas do projeto. Emendas MUST ser feitas por
alteração deste arquivo, com descrição do motivo e revisão dos artefatos dependentes (spec,
plano, tarefas). O versionamento é semântico: MAJOR para remoção ou redefinição incompatível
de princípio; MINOR para princípio ou seção nova, ou orientação materialmente ampliada; PATCH
para esclarecimentos e ajustes de redação. Toda revisão de código e todo plano MUST verificar a
conformidade com os princípios.

**Version**: 1.0.0 | **Ratified**: 2026-10-30 | **Last Amended**: 2026-10-30
