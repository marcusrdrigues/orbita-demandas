import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { configDoBancoDeTeste } from './integracao/ambiente.js';

/**
 * Recria as tabelas do banco de teste a partir de db/schema.sql.
 * O banco `orbita_teste` e o GRANT vêm de db/00-banco-teste.sql (primeira criação do volume do compose).
 */
export default async function preparar(): Promise<void> {
  const config = configDoBancoDeTeste();
  const schema = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');

  let conexao: mysql.Connection;
  try {
    conexao = await mysql.createConnection({ ...config, multipleStatements: true });
  } catch (erro) {
    throw new Error(
      `Não foi possível abrir o banco de teste "${config.database}" em ${config.host}:${config.port}. ` +
        'Suba o MySQL (docker compose up -d) e confira o .env. Se o volume é antigo e o banco de teste ' +
        `não existe, recrie com "docker compose down -v && docker compose up -d". Causa: ${(erro as Error).message}`,
    );
  }

  try {
    await conexao.query('DROP TABLE IF EXISTS demand_trace, demand, app_user');
    await conexao.query(schema);
  } finally {
    await conexao.end();
  }
}
