import type {
  RegistroDeHistorico,
  RepositorioTrace,
} from '../../application/portas/repositorio-trace.js';
import type { Executor } from './executor.js';

// Esqueleto da fase 2: `registrar` é preenchido na US2 (T030).
export class RepositorioTraceMysql implements RepositorioTrace {
  constructor(protected readonly executor: Executor) {}

  registrar(_registro: RegistroDeHistorico): Promise<void> {
    return Promise.reject(new Error('RepositorioTrace.registrar ainda não implementado'));
  }
}
