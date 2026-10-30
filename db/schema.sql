-- Esquema fixo definido pela prova: não acrescentar colunas, índices nem chaves estrangeiras.
-- Ver specs/001-fila-demandas/data-model.md.

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
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_queue_status (queue, status)
);

CREATE TABLE demand_trace (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  demand_id  INT          NOT NULL,
  user_id    INT          NOT NULL,
  action     VARCHAR(20)  NOT NULL,
  note       VARCHAR(500) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
