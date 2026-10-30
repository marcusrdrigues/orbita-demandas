import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
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

  async reservarSeAberta(demandaId: number, usuarioId: number): Promise<boolean> {
    // Uma instrução só: o InnoDB serializa os UPDATEs na mesma linha, então só um enxerga
    // status = 1. No mysql2, affectedRows conta as linhas encontradas pelo WHERE (flag FOUND_ROWS);
    // como o WHERE exige status = 1, encontrada implica alterada.
    const [resultado] = await this.executor.execute<ResultSetHeader>(
      'UPDATE demand SET status = 2, worker_id = ? WHERE id = ? AND status = 1',
      [usuarioId, demandaId],
    );
    return resultado.affectedRows === 1;
  }

  async buscarPorId(demandaId: number): Promise<Demanda | null> {
    const [linhas] = await this.executor.execute<LinhaDeDemanda[]>(
      'SELECT' +
        COLUNAS_DA_DEMANDA +
        ' FROM demand d LEFT JOIN app_user u ON u.id = d.worker_id WHERE d.id = ?',
      [demandaId],
    );
    const linha = linhas[0];
    return linha ? paraDemanda(linha) : null;
  }

  async buscarParaAtualizar(demandaId: number): Promise<Demanda | null> {
    // Só a tabela demand: o FOR UPDATE não deve travar também a linha do usuário. Sem o nome do
    // responsável (worker_name nulo); quem precisa dele relê com buscarPorId depois do commit.
    const [linhas] = await this.executor.execute<LinhaDeDemanda[]>(
      'SELECT d.id, d.title, d.queue, d.status, d.worker_id, NULL AS worker_name,' +
        ' d.outcome, d.failure_reason, d.note, d.updated_at' +
        ' FROM demand d WHERE d.id = ? FOR UPDATE',
      [demandaId],
    );
    const linha = linhas[0];
    return linha ? paraDemanda(linha) : null;
  }

  async encerrar(demandaId: number, dados: DadosDeEncerramento): Promise<void> {
    await this.executor.execute(
      'UPDATE demand SET status = 3, outcome = ?, failure_reason = ?, note = ? WHERE id = ?',
      [dados.outcome, dados.failureReason, dados.note, demandaId],
    );
  }
}
