import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import type { ConfigBanco } from '../config.js';

export function criarPool(config: ConfigBanco, limiteDeConexoes = 10): Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4',
    // O MySQL do compose roda em UTC; com 'Z' o DATETIME é lido como UTC, sem depender do fuso do Node.
    timezone: 'Z',
    connectionLimit: limiteDeConexoes,
    connectTimeout: 5_000,
    waitForConnections: true,
  });
}
