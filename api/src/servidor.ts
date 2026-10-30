import { construirApp } from './http/app.js';
import { carregarConfig } from './infra/config.js';
import { criarAdaptadores } from './infra/mysql/index.js';
import { criarPool } from './infra/mysql/pool.js';

const config = carregarConfig();
const pool = criarPool(config.banco);
const app = construirApp(criarAdaptadores(pool), { logger: true });

async function encerrar(sinal: string): Promise<void> {
  app.log.info({ sinal }, 'Encerrando');
  await app.close();
  await pool.end();
  process.exit(0);
}

process.once('SIGINT', () => void encerrar('SIGINT'));
process.once('SIGTERM', () => void encerrar('SIGTERM'));

// Só em loopback: a autenticação por cabeçalho desta versão não deve ficar exposta na rede.
await app.listen({ host: '127.0.0.1', port: config.portaHttp });
