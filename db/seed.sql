-- Dados de exemplo, todos fictícios. Roda depois de schema.sql.
SET NAMES utf8mb4;
SET SESSION cte_max_recursion_depth = 5000;

INSERT INTO app_user (id, name) VALUES
  (1, 'Ana Lima'),
  (2, 'Bruno Costa'),
  (3, 'Carla Souza'),
  (4, 'Diego Alves'),
  (5, 'Elisa Ramos');  -- supervisora (escopo demands:supervise no front)

-- 5.000 demandas: ~70% abertas, ~20% reservadas, ~10% encerradas.
-- Reservadas e encerradas têm worker_id; encerradas têm outcome, e as de insucesso, failure_reason.
INSERT INTO demand (id, title, queue, status, worker_id, outcome, failure_reason, note, updated_at)
WITH RECURSIVE n (i) AS (
  SELECT 1
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5000
)
SELECT
  i,
  CONCAT('Demanda ', i, ' - ', ELT(1 + i % 6, 'troca de plano', 'segunda via de fatura',
         'falha de sinal', 'portabilidade', 'cancelamento', 'contestação de cobrança')),
  ELT(1 + i % 4, 'suporte', 'vendas', 'financeiro', 'retencao'),
  CASE WHEN i % 10 < 7 THEN 1 WHEN i % 10 < 9 THEN 2 ELSE 3 END,
  CASE WHEN i % 10 < 7 THEN NULL ELSE 1 + i % 5 END,
  CASE WHEN i % 10 < 9 THEN NULL WHEN i % 3 = 0 THEN 'failure' ELSE 'success' END,
  CASE WHEN i % 10 = 9 AND i % 3 = 0
       THEN ELT(1 + (i DIV 3) % 3, 'Cliente ausente', 'Sem cobertura', 'Dados inválidos') END,
  CASE WHEN i % 10 = 9 AND i % 7 = 0 THEN 'Encerrada pelo seed de exemplo' END,
  TIMESTAMP('2026-10-01 00:00:00') + INTERVAL ((i * 37) % 2592000) SECOND
FROM n;
