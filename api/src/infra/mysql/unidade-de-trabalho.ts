import type { Pool } from 'mysql2/promise';
import type {
  RepositoriosTransacionais,
  UnidadeDeTrabalho,
} from '../../application/portas/unidade-de-trabalho.js';
import { RepositorioDemandasMysql } from './repositorio-demandas.js';
import type { RepositorioTrace } from '../../application/portas/repositorio-trace.js';
import type { Executor } from './executor.js';
import { RepositorioTraceMysql } from './repositorio-trace.js';

export class UnidadeDeTrabalhoMysql implements UnidadeDeTrabalho {
  /**
   * `criarTrace` existe para os testes trocarem o histórico por um que falha e provarem o
   * rollback; em produção vale o padrão.
   */
  constructor(
    private readonly pool: Pool,
    private readonly criarTrace: (executor: Executor) => RepositorioTrace = (executor) =>
      new RepositorioTraceMysql(executor),
  ) {}

  async executar<T>(trabalho: (repositorios: RepositoriosTransacionais) => Promise<T>): Promise<T> {
    const conexao = await this.pool.getConnection();
    try {
      await conexao.beginTransaction();
      const resultado = await trabalho({
        demandas: new RepositorioDemandasMysql(conexao),
        trace: this.criarTrace(conexao),
      });
      await conexao.commit();
      return resultado;
    } catch (erro) {
      // O erro original é o que importa; uma falha no rollback não deve escondê-lo.
      await conexao.rollback().catch(() => undefined);
      throw erro;
    } finally {
      conexao.release();
    }
  }
}
