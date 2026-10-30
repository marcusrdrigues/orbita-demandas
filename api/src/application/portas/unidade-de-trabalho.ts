import type { RepositorioDemandas } from './repositorio-demandas.js';
import type { RepositorioTrace } from './repositorio-trace.js';

/** Repositórios ligados à mesma transação: a mudança da demanda e o histórico confirmam ou desfazem juntos. */
export interface RepositoriosTransacionais {
  demandas: RepositorioDemandas;
  trace: RepositorioTrace;
}

export interface UnidadeDeTrabalho {
  /** Abre a transação, executa o trabalho e confirma; qualquer erro desfaz tudo. Deve ser curta. */
  executar<T>(trabalho: (repositorios: RepositoriosTransacionais) => Promise<T>): Promise<T>;
}
