import type { Pool } from 'mysql2/promise';
import type {
  RepositoriosTransacionais,
  UnidadeDeTrabalho,
} from '../../application/portas/unidade-de-trabalho.js';
import { RepositorioDemandasMysql } from './repositorio-demandas.js';
import { RepositorioTraceMysql } from './repositorio-trace.js';

export class UnidadeDeTrabalhoMysql implements UnidadeDeTrabalho {
  constructor(private readonly pool: Pool) {}

  async executar<T>(trabalho: (repositorios: RepositoriosTransacionais) => Promise<T>): Promise<T> {
    const conexao = await this.pool.getConnection();
    try {
      await conexao.beginTransaction();
      const resultado = await trabalho({
        demandas: new RepositorioDemandasMysql(conexao),
        trace: new RepositorioTraceMysql(conexao),
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
