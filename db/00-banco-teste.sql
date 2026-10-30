-- Banco usado só pelos testes de integração da API (api/tests).
-- Roda como root na primeira criação do volume, antes de schema.sql e seed.sql.
CREATE DATABASE IF NOT EXISTS orbita_teste;
GRANT ALL PRIVILEGES ON orbita_teste.* TO 'orbita'@'%';
