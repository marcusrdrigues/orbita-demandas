import type {
  DadosDeEncerramento,
  FiltroListagem,
  PaginaDeDemandas,
  RepositorioDemandas,
} from '../../application/portas/repositorio-demandas.js';
import type { Demanda } from '../../domain/demanda.js';
import type { Executor } from './executor.js';

// Esqueleto da fase 2: os métodos são preenchidos pelas histórias (listar: T021;
// reservarSeAberta e buscarPorId: T030; buscarParaAtualizar e encerrar: T037).
export class RepositorioDemandasMysql implements RepositorioDemandas {
  constructor(protected readonly executor: Executor) {}

  listar(_filtro: FiltroListagem): Promise<PaginaDeDemandas> {
    return Promise.reject(new Error('RepositorioDemandas.listar ainda não implementado'));
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
