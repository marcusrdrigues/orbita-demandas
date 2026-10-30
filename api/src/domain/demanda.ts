export const StatusDemanda = {
  Aberta: 1,
  Reservada: 2,
  Encerrada: 3,
} as const;

export type StatusDemanda = (typeof StatusDemanda)[keyof typeof StatusDemanda];

export type Resultado = 'success' | 'failure';

export interface Demanda {
  id: number;
  title: string;
  queue: string;
  status: StatusDemanda;
  workerId: number | null;
  workerName: string | null;
  outcome: Resultado | null;
  failureReason: string | null;
  note: string | null;
  updatedAt: Date;
}
