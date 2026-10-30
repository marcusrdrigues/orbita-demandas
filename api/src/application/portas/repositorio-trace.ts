export type AcaoDoHistorico = 'reservada' | 'encerrada';

export interface RegistroDeHistorico {
  demandaId: number;
  usuarioId: number;
  acao: AcaoDoHistorico;
  observacao: string | null;
}

export interface RepositorioTrace {
  registrar(registro: RegistroDeHistorico): Promise<void>;
}
