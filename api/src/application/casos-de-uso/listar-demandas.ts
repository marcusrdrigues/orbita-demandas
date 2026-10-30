import type { Demanda } from '../../domain/demanda.js';
import type { FiltroListagem, RepositorioDemandas } from '../portas/repositorio-demandas.js';

export interface PaginaListada {
  items: Demanda[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListarDemandas {
  constructor(private readonly demandas: RepositorioDemandas) {}

  async executar(filtro: FiltroListagem): Promise<PaginaListada> {
    const { items, total } = await this.demandas.listar(filtro);
    return { items, total, page: filtro.page, pageSize: filtro.pageSize };
  }
}
