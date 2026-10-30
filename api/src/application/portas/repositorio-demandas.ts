import type { Demanda, Resultado, StatusDemanda } from '../../domain/demanda.js';

export type CampoOrdenacao = 'id' | 'updated_at';
export type SentidoOrdenacao = 'asc' | 'desc';

export interface FiltroListagem {
  page: number;
  pageSize: number;
  queue?: string;
  status?: StatusDemanda;
  sort: CampoOrdenacao;
  order: SentidoOrdenacao;
}

export interface PaginaDeDemandas {
  items: Demanda[];
  total: number;
}

export interface DadosDeEncerramento {
  outcome: Resultado;
  failureReason: string | null;
  note: string | null;
}

export interface RepositorioDemandas {
  listar(filtro: FiltroListagem): Promise<PaginaDeDemandas>;

  /** Reserva só se a demanda ainda está aberta. Devolve false quando nenhuma linha foi alterada. */
  reservarSeAberta(demandaId: number, usuarioId: number): Promise<boolean>;

  buscarPorId(demandaId: number): Promise<Demanda | null>;

  /** Lê a demanda travando a linha até o fim da transação (SELECT ... FOR UPDATE). */
  buscarParaAtualizar(demandaId: number): Promise<Demanda | null>;

  encerrar(demandaId: number, dados: DadosDeEncerramento): Promise<void>;
}
