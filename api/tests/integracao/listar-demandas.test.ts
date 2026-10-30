import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cabecalhos,
  construirAppDeTeste,
  criarPoolDeTeste,
  inserirDemanda,
  inserirUsuario,
  limparTabelas,
} from './ambiente.js';

interface Semeada {
  id: number;
  queue: string;
  status: 1 | 2 | 3;
  updatedAt: string;
}

let pool: Pool;
let app: FastifyInstance;

/**
 * 45 demandas: 25 em "suporte" e 20 em "vendas". Os status se alternam e o updated_at repete
 * de propósito (blocos de 5 demandas com a mesma data), para provar o desempate por id.
 */
async function semear(): Promise<Semeada[]> {
  const semeadas: Semeada[] = [];
  for (let i = 0; i < 45; i++) {
    const queue = i < 25 ? 'suporte' : 'vendas';
    const status = ((i % 3) + 1) as 1 | 2 | 3;
    const hora = String(10 + Math.floor(i / 5)).padStart(2, '0');
    const updatedAt = `2026-10-01 ${hora}:00:00`;
    const id = await inserirDemanda(pool, {
      title: `Demanda ${i + 1}`,
      queue,
      status,
      workerId: status === 1 ? null : 2,
      outcome: status === 3 ? 'success' : null,
      updatedAt,
    });
    semeadas.push({ id, queue, status, updatedAt });
  }
  return semeadas;
}

async function listar(query: string, headers: Record<string, string> = cabecalhos(1)) {
  const resposta = await app.inject({ method: 'GET', url: `/demands${query}`, headers });
  return { status: resposta.statusCode, corpo: resposta.json(), texto: resposta.body };
}

const SEM_VAZAMENTO = /stack|\bat\s+\S+\s+\(|\.ts\b|\bError\b|node_modules/;
const EM_INGLES = /\b(Invalid|Expected|Required|received|Unrecognized)\b/;

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

describe('GET /demands', () => {
  it('devolve só a primeira página e o total geral', async () => {
    const semeadas = await semear();

    const { status, corpo } = await listar('');

    expect(status).toBe(200);
    expect(corpo.total).toBe(45);
    expect(corpo.page).toBe(1);
    expect(corpo.pageSize).toBe(20);
    expect(corpo.items).toHaveLength(20);
    expect(corpo.items.map((d: { id: number }) => d.id)).toEqual(semeadas.slice(0, 20).map((d) => d.id));
  });

  it('filtra por fila e status e o total reflete o filtro', async () => {
    const semeadas = await semear();
    const esperadas = semeadas.filter((d) => d.queue === 'suporte' && d.status === 1);

    const { status, corpo } = await listar('?queue=suporte&status=1&pageSize=100');

    expect(status).toBe(200);
    expect(corpo.total).toBe(esperadas.length);
    expect(corpo.items.map((d: { id: number }) => d.id)).toEqual(esperadas.map((d) => d.id));
    for (const item of corpo.items) {
      expect(item.queue).toBe('suporte');
      expect(item.status).toBe(1);
    }
  });

  it('fila inexistente devolve lista vazia, não erro', async () => {
    await semear();

    const { status, corpo } = await listar('?queue=nao-existe');

    expect(status).toBe(200);
    expect(corpo).toMatchObject({ items: [], total: 0 });
  });

  it('ordena por id nos dois sentidos', async () => {
    const semeadas = await semear();
    const ids = semeadas.map((d) => d.id);

    const asc = await listar('?sort=id&order=asc&pageSize=100');
    const desc = await listar('?sort=id&order=desc&pageSize=100');

    expect(asc.corpo.items.map((d: { id: number }) => d.id)).toEqual(ids);
    expect(desc.corpo.items.map((d: { id: number }) => d.id)).toEqual([...ids].reverse());
  });

  it.each(['asc', 'desc'] as const)(
    'ordena por updated_at (%s) com desempate por id, estável entre páginas',
    async (sentido) => {
      const semeadas = await semear();
      const fator = sentido === 'asc' ? 1 : -1;
      const esperados = [...semeadas]
        .sort((a, b) => fator * (a.updatedAt.localeCompare(b.updatedAt) || a.id - b.id))
        .map((d) => d.id);

      const vistos: number[] = [];
      for (let page = 1; page <= 5; page++) {
        const { status, corpo } = await listar(`?sort=updated_at&order=${sentido}&pageSize=10&page=${page}`);
        expect(status).toBe(200);
        vistos.push(...corpo.items.map((d: { id: number }) => d.id));
      }

      expect(vistos).toEqual(esperados);
      expect(new Set(vistos).size).toBe(45);
    },
  );

  it('página além do fim devolve lista vazia com o total correto', async () => {
    await semear();

    const { status, corpo } = await listar('?page=99');

    expect(status).toBe(200);
    expect(corpo).toMatchObject({ items: [], total: 45, page: 99 });
  });

  it('traz o nome do responsável nas reservadas e nulo nas abertas', async () => {
    const aberta = await inserirDemanda(pool, { status: 1 });
    const reservada = await inserirDemanda(pool, { status: 2, workerId: 2 });

    const { corpo } = await listar('');
    const porId = new Map<number, { workerId: number | null; workerName: string | null }>(
      corpo.items.map((d: { id: number; workerId: number | null; workerName: string | null }) => [d.id, d]),
    );

    expect(porId.get(aberta)).toMatchObject({ workerId: null, workerName: null });
    expect(porId.get(reservada)).toMatchObject({ workerId: 2, workerName: 'Bruno Costa' });
  });

  it('devolve updatedAt em ISO 8601 (UTC) e os campos do contrato', async () => {
    await inserirDemanda(pool, { title: 'Troca de plano', queue: 'vendas', updatedAt: '2026-10-01 10:30:00' });

    const { corpo } = await listar('');

    expect(corpo.items[0]).toEqual({
      id: expect.any(Number),
      title: 'Troca de plano',
      queue: 'vendas',
      status: 1,
      workerId: null,
      workerName: null,
      outcome: null,
      failureReason: null,
      note: null,
      updatedAt: '2026-10-01T10:30:00.000Z',
    });
  });

  it('o supervisor, sozinho, também lista', async () => {
    await semear();

    const { status, corpo } = await listar('', cabecalhos(1, ['demands:supervise']));

    expect(status).toBe(200);
    expect(corpo.total).toBe(45);
  });
});

describe('GET /demands: requisições recusadas', () => {
  it.each([
    ['pageSize=0', '?pageSize=0'],
    ['pageSize=101', '?pageSize=101'],
    ['page=0', '?page=0'],
    ['page=abc', '?page=abc'],
    ['parâmetro desconhecido', '?foo=1'],
    ['sort desconhecido', '?sort=nome'],
    ['order desconhecido', '?order=up'],
    ['status fora de 1-3', '?status=9'],
    ['status não numérico', '?status=aberta'],
    ['queue vazia', '?queue='],
    ['queue com mais de 40 caracteres', `?queue=${'a'.repeat(41)}`],
  ])('%s → 400 em pt-BR, sem dados nem detalhe interno', async (_nome, query) => {
    await semear();

    const { status, corpo, texto } = await listar(query);

    expect(status).toBe(400);
    expect(corpo.code).toBe('REQUISICAO_INVALIDA');
    expect(corpo.message).toBe('Requisição inválida.');
    expect(corpo.items).toBeUndefined();
    expect(corpo.details.length).toBeGreaterThan(0);
    for (const detalhe of corpo.details) {
      expect(typeof detalhe.field).toBe('string');
      expect(detalhe.message).not.toMatch(EM_INGLES);
    }
    expect(texto).not.toMatch(SEM_VAZAMENTO);
  });

  it('sem x-user-id → 401', async () => {
    const { status, corpo, texto } = await listar('', {});

    expect(status).toBe(401);
    expect(corpo).toEqual({ code: 'NAO_AUTENTICADO', message: 'Usuário não identificado.' });
    expect(texto).not.toMatch(SEM_VAZAMENTO);
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999'])('x-user-id inválido (%s) → 401', async (id) => {
    const { status } = await listar('', { 'x-user-id': id, 'x-scopes': 'demands' });
    expect(status).toBe(401);
  });

  it('usuário inexistente → 401', async () => {
    const { status } = await listar('', cabecalhos(999));
    expect(status).toBe(401);
  });

  it.each([
    ['sem x-scopes', {}],
    ['x-scopes vazio', { 'x-scopes': '' }],
    ['escopo desconhecido', { 'x-scopes': 'outro,demands:read' }],
  ])('%s → 403 em pt-BR', async (_nome, extras) => {
    const { status, corpo, texto } = await listar('', { 'x-user-id': '1', ...extras });

    expect(status).toBe(403);
    expect(corpo).toEqual({ code: 'SEM_PERMISSAO', message: 'Você não tem permissão para esta operação.' });
    expect(texto).not.toMatch(SEM_VAZAMENTO);
  });

  it('o 403 de escopo vem antes do 400 de validação', async () => {
    const { status } = await listar('?pageSize=0', cabecalhos(1, []));
    expect(status).toBe(403);
  });

  it('rota inexistente → 404 no formato padrão, sem detalhe interno', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/nada', headers: cabecalhos(1) });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ code: 'ROTA_NAO_ENCONTRADA', message: 'Rota não encontrada.' });
  });
});
