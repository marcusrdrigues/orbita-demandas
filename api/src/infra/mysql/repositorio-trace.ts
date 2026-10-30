import type {
  RegistroDeHistorico,
  RepositorioTrace,
} from '../../application/portas/repositorio-trace.js';
import type { Executor } from './executor.js';

export class RepositorioTraceMysql implements RepositorioTrace {
  constructor(protected readonly executor: Executor) {}

  async registrar(registro: RegistroDeHistorico): Promise<void> {
    await this.executor.execute(
      'INSERT INTO demand_trace (demand_id, user_id, action, note) VALUES (?, ?, ?, ?)',
      [registro.demandaId, registro.usuarioId, registro.acao, registro.observacao],
    );
  }
}
