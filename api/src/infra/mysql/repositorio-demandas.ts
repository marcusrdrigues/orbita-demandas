import type { RowDataPacket } from 'mysql2/promise';
import type {
  DadosDeEncerramento,
  FiltroListagem,
  PaginaDeDemandas,
  RepositorioDemandas,
} from '../../application/portas/repositorio-demandas.js';
import type { Demanda, Resultado, StatusDemanda } from '../../domain/demanda.js';
import type { Executor } from './executor.js';

interface LinhaDeDemanda extends RowDataPacket {
  id: number;
  title: string;
  queue: string;
  status: StatusDemanda;
  worker_id: number | null;
  worker_name: string | null;
  outcome: Resultado | null;
  failure_reason: string | null;
  note: string | null;
  updated_at: Date;
}

interface LinhaDeTotal extends RowDataPacket {
  total: number;
}

const COLUNAS_DA_DEMANDA = `
  d.id, d.title, d.queue, d.status, d.worker_id, u.name AS worker_name,
  d.outcome, d.failure_reason, d.note, d.updated_at`;

// Única fonte de ORDER BY: o valor vem de uma lista fechada, nunca da entrada do usuário.
// O desempate por id mantém a paginação estável quando updated_at se repete.
const ORDENACAO = {
  'id:asc': 'd.id ASC',
  'id:desc': 'd.id DESC',
  'updated_at:asc': 'd.updated_at ASC, d.id ASC',
  'updated_at:desc': 'd.updated_at DESC, d.id DESC',
} as const;

function paraDemanda(linha: LinhaDeDemanda): Demanda {
  return {
    id: linha.id,
    title: linha.title,
    queue: linha.queue,
    status: linha.status,
    workerId: linha.worker_id,
    workerName: linha.worker_name,
    outcome: linha.outcome,
    failureReason: linha.failure_reason,
    note: linha.note,
    updatedAt: linha.updated_at,
  };
}

// Preenchido pelas histórias: reservarSeAberta e buscarPorId (T030); buscarParaAtualizar e encerrar (T037).
export class RepositorioDemandasMysql implements RepositorioDemandas {
  constructor(protected readonly executor: Executor) {}

  async listar(filtro: FiltroListagem): Promise<PaginaDeDemandas> {
    // Só fragmentos fixos entram no SQL; todo valor do usuário vai como parâmetro vinculado (?).
    const condicoes: string[] = [];
    const parametros: Array<string | number> = [];
    if (filtro.queue !== undefined) {
      condicoes.push('d.queue = ?');
      parametros.push(filtro.queue);
    }
    if (filtro.status !== undefined) {
      condicoes.push('d.status = ?');
      parametros.push(filtro.status);
    }
    const where = condicoes.length > 0 ? ' WHERE ' + condicoes.join(' AND ') : '';

    // query (e não execute): LIMIT/OFFSET parametrizados não são confiáveis em instrução preparada.
    // Os valores continuam vinculados por `?` e escapados pelo driver.
    const [totais] = await this.executor.query<LinhaDeTotal[]>(
      'SELECT COUNT(*) AS total FROM demand d' + where,
      parametros,
    );

    const [linhas] = await this.executor.query<LinhaDeDemanda[]>(
      'SELECT' +
        COLUNAS_DA_DEMANDA +
        ' FROM demand d LEFT JOIN app_user u ON u.id = d.worker_id' +
        where +
        ' ORDER BY ' +
        ORDENACAO[`${filtro.sort}:${filtro.order}`] +
        ' LIMIT ? OFFSET ?',
      [...parametros, filtro.pageSize, (filtro.page - 1) * filtro.pageSize],
    );

    return { items: linhas.map(paraDemanda), total: totais[0]?.total ?? 0 };
  }

  reservarSeAberta(_demandaId: number, _usuarioId: number): Promise<boolean> {
    return Promise.reject(new Error('RepositorioDemandas.reservarSeAberta ainda não implementado'));
  }

  buscarPorId(_demandaId: number): Promise<Demanda | null> {
    return Promise.reject(new Error('RepositorioDemandas.buscarPorId ainda não implementado'));
  }

  buscarParaAtualizar(_demandaId: number): Promise<Demanda | null> {
    return Promise.reject(new Error('RepositorioDemandas.buscarParaAtualizar ainda não implementado'));
  }

  encerrar(_demandaId: number, _dados: DadosDeEncerramento): Promise<void> {
    return Promise.reject(new Error('RepositorioDemandas.encerrar ainda não implementado'));
  }
}
