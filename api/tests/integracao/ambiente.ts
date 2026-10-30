import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { construirApp } from '../../src/http/app.js';
import type { ConfigBanco } from '../../src/infra/config.js';
import { criarAdaptadores, type Adaptadores } from '../../src/infra/mysql/index.js';
import { criarPool } from '../../src/infra/mysql/pool.js';

export function configDoBancoDeTeste(env: NodeJS.ProcessEnv = process.env): ConfigBanco {
  const exigir = (nome: string): string => {
    const valor = env[nome];
    if (!valor) {
      throw new Error(`Variável ${nome} não definida. Rode os testes com "npm test" (lê ../.env).`);
    }
    return valor;
  };
  return {
    host: exigir('DB_HOST'),
    port: Number(exigir('DB_PORT')),
    user: exigir('DB_USER'),
    password: exigir('DB_PASSWORD'),
    database: env.DB_NAME_TESTE ?? 'orbita_teste',
  };
}

/** Pool com várias conexões: as corridas de concorrência precisam de pelo menos duas. */
export function criarPoolDeTeste(limiteDeConexoes = 10): Pool {
  return criarPool(configDoBancoDeTeste(), limiteDeConexoes);
}

export async function limparTabelas(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE TABLE demand_trace');
  await pool.query('TRUNCATE TABLE demand');
  await pool.query('TRUNCATE TABLE app_user');
}

export async function inserirUsuario(pool: Pool, usuario: { id: number; name: string }): Promise<void> {
  await pool.execute('INSERT INTO app_user (id, name) VALUES (?, ?)', [usuario.id, usuario.name]);
}

export interface DemandaDeTeste {
  title?: string;
  queue?: string;
  status?: 1 | 2 | 3;
  workerId?: number | null;
  outcome?: 'success' | 'failure' | null;
  failureReason?: string | null;
  note?: string | null;
  /** Data em UTC no formato 'YYYY-MM-DD HH:MM:SS'; sem ela vale o padrão do banco. */
  updatedAt?: string;
}

/** Insere uma demanda e devolve o id gerado. O padrão é uma demanda aberta na fila "suporte". */
export async function inserirDemanda(pool: Pool, dados: DemandaDeTeste = {}): Promise<number> {
  const valores = [
    dados.title ?? 'Demanda de teste',
    dados.queue ?? 'suporte',
    dados.status ?? 1,
    dados.workerId ?? null,
    dados.outcome ?? null,
    dados.failureReason ?? null,
    dados.note ?? null,
  ];
  const [resultado] =
    dados.updatedAt === undefined
      ? await pool.execute(
          'INSERT INTO demand (title, queue, status, worker_id, outcome, failure_reason, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          valores,
        )
      : await pool.execute(
          'INSERT INTO demand (title, queue, status, worker_id, outcome, failure_reason, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [...valores, dados.updatedAt],
        );
  return (resultado as { insertId: number }).insertId;
}

export interface LinhaDeDemanda {
  id: number;
  status: number;
  worker_id: number | null;
  outcome: string | null;
}

export interface LinhaDeTrace {
  demand_id: number;
  user_id: number;
  action: string;
  note: string | null;
}

/** Lê a linha crua do banco, para os testes conferirem o estado sem passar pela API. */
export async function lerDemanda(pool: Pool, id: number): Promise<LinhaDeDemanda | undefined> {
  const [linhas] = await pool.execute('SELECT id, status, worker_id, outcome FROM demand WHERE id = ?', [id]);
  return (linhas as LinhaDeDemanda[])[0];
}

export async function lerTrace(pool: Pool, demandaId: number): Promise<LinhaDeTrace[]> {
  const [linhas] = await pool.execute(
    'SELECT demand_id, user_id, action, note FROM demand_trace WHERE demand_id = ? ORDER BY id',
    [demandaId],
  );
  return linhas as LinhaDeTrace[];
}

export function cabecalhos(usuarioId: number, escopos: string[] = ['demands']): Record<string, string> {
  return { 'x-user-id': String(usuarioId), 'x-scopes': escopos.join(',') };
}

/** App com os adaptadores reais sobre o pool de teste; `sobrescritas` troca peças para simular falhas. */
export function construirAppDeTeste(pool: Pool, sobrescritas: Partial<Adaptadores> = {}): FastifyInstance {
  return construirApp({ ...criarAdaptadores(pool), ...sobrescritas });
}
