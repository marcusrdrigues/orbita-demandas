import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cabecalhos,
  construirAppDeTeste,
  criarPoolDeTeste,
  inserirDemanda,
  inserirUsuario,
  lerDemanda,
  lerTrace,
  limparTabelas,
} from './ambiente.js';

let pool: Pool;
let app: FastifyInstance;

async function reservar(id: number | string, headers: Record<string, string> = cabecalhos(1)) {
  const resposta = await app.inject({ method: 'POST', url: `/demands/${id}/reserve`, headers });
  return { status: resposta.statusCode, corpo: resposta.json(), texto: resposta.body };
}

const SEM_VAZAMENTO = /stack|\bat\s+\S+\s+\(|\.ts\b|\bError\b|node_modules/;

beforeAll(() => {
  pool = criarPoolDeTeste();
  app = construirAppDeTeste(pool);
});

afterAll(async () => {
  await app.close();
  await limparTabelas(pool);
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
  await inserirUsuario(pool, { id: 1, name: 'Ana Lima' });
  await inserirUsuario(pool, { id: 2, name: 'Bruno Costa' });
});

describe('POST /demands/:id/reserve', () => {
  it('reserva uma demanda aberta em nome do usuário', async () => {
    const id = await inserirDemanda(pool, { title: 'Troca de plano', queue: 'vendas' });

    const { status, corpo } = await reservar(id, cabecalhos(2));

    expect(status).toBe(200);
    expect(corpo).toMatchObject({
      id,
      title: 'Troca de plano',
      queue: 'vendas',
      status: 2,
      workerId: 2,
      workerName: 'Bruno Costa',
      outcome: null,
    });
    expect(await lerDemanda(pool, id)).toMatchObject({ status: 2, worker_id: 2 });
  });

  it('demanda inexistente → 404', async () => {
    const { status, corpo } = await reservar(999_999);

    expect(status).toBe(404);
    expect(corpo).toEqual({ code: 'DEMANDA_NAO_ENCONTRADA', message: 'Demanda não encontrada.' });
  });

  it('reservada por outro → 409 com o nome, o dono e a demanda atual; nada muda', async () => {
    const id = await inserirDemanda(pool, { status: 2, workerId: 1 });

    const { status, corpo, texto } = await reservar(id, cabecalhos(2));

    expect(status).toBe(409);
    expect(corpo.code).toBe('DEMANDA_JA_RESERVADA');
    expect(corpo.message).toBe('Demanda já reservada por Ana Lima.');
    expect(corpo.holder).toEqual({ id: 1, name: 'Ana Lima' });
    expect(corpo.demanda).toMatchObject({ id, status: 2, workerId: 1, workerName: 'Ana Lima' });
    expect(texto).not.toMatch(SEM_VAZAMENTO);
    expect(await lerDemanda(pool, id)).toMatchObject({ status: 2, worker_id: 1 });
    expect(await lerTrace(pool, id)).toHaveLength(0);
  });

  it('demanda encerrada → 409 com a demanda atual', async () => {
    const id = await inserirDemanda(pool, { status: 3, workerId: 1, outcome: 'success' });

    const { status, corpo } = await reservar(id, cabecalhos(2));

    expect(status).toBe(409);
    expect(corpo.code).toBe('DEMANDA_ENCERRADA');
    expect(corpo.message).toBe('Demanda já encerrada.');
    expect(corpo.holder).toBeUndefined();
    expect(corpo.demanda).toMatchObject({ id, status: 3, outcome: 'success' });
    expect(await lerDemanda(pool, id)).toMatchObject({ status: 3, worker_id: 1 });
  });

  it('o mesmo usuário reservando de novo recebe sucesso, sem alterar nem gravar outro histórico', async () => {
    const id = await inserirDemanda(pool);
    const primeira = await reservar(id, cabecalhos(1));

    const segunda = await reservar(id, cabecalhos(1));

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.corpo).toMatchObject({ id, status: 2, workerId: 1, workerName: 'Ana Lima' });
    expect(segunda.corpo.updatedAt).toBe(primeira.corpo.updatedAt);
    expect(await lerTrace(pool, id)).toHaveLength(1);
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999'])('id inválido (%s) → 400', async (id) => {
    const { status, corpo } = await reservar(id);

    expect(status).toBe(400);
    expect(corpo.code).toBe('REQUISICAO_INVALIDA');
  });

  it('sem x-user-id → 401', async () => {
    const id = await inserirDemanda(pool);

    const { status } = await reservar(id, {});

    expect(status).toBe(401);
    expect(await lerDemanda(pool, id)).toMatchObject({ status: 1, worker_id: null });
  });

  it('sem escopo → 403 e a demanda não muda', async () => {
    const id = await inserirDemanda(pool);

    const { status, corpo } = await reservar(id, cabecalhos(1, ['outro']));

    expect(status).toBe(403);
    expect(corpo.code).toBe('SEM_PERMISSAO');
    expect(await lerDemanda(pool, id)).toMatchObject({ status: 1, worker_id: null });
  });

  it('quem tem só demands:supervise também reserva', async () => {
    const id = await inserirDemanda(pool);

    const { status, corpo } = await reservar(id, cabecalhos(1, ['demands:supervise']));

    expect(status).toBe(200);
    expect(corpo).toMatchObject({ status: 2, workerId: 1 });
  });
});
