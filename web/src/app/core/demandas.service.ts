import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type StatusDemanda = 1 | 2 | 3;
export type Resultado = 'success' | 'failure';
export type CampoOrdenacao = 'id' | 'updated_at';
export type SentidoOrdenacao = 'asc' | 'desc';

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
  updatedAt: string;
}

export interface PaginaDeDemandas {
  items: Demanda[];
  total: number;
  page: number;
  pageSize: number;
}

/** Corpo do encerramento: o motivo só vai no insucesso; a observação só se preenchida. */
export interface CorpoDeEncerramento {
  outcome: Resultado;
  failureReason?: string;
  note?: string;
}

export interface ConsultaDeDemandas {
  page: number;
  pageSize: number;
  queue?: string;
  status?: StatusDemanda;
  sort: CampoOrdenacao;
  order: SentidoOrdenacao;
}

/** Corpo do 409 de reserva: a mensagem, quem ficou (quando reservada) e a demanda atual. */
export interface ConflitoDeReserva {
  code: string;
  message: string;
  holder?: { id: number; name: string };
  demanda: Demanda;
}

/** Devolve o corpo do 409 de reserva, ou null se o erro for de outro tipo. */
export function lerConflitoDeReserva(erro: unknown): ConflitoDeReserva | null {
  if (!(erro instanceof HttpErrorResponse) || erro.status !== 409) {
    return null;
  }
  const corpo: unknown = erro.error;
  if (typeof corpo === 'object' && corpo !== null && 'demanda' in corpo && 'message' in corpo) {
    return corpo as ConflitoDeReserva;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class DemandasService {
  private readonly http = inject(HttpClient);

  listar(consulta: ConsultaDeDemandas): Observable<PaginaDeDemandas> {
    let params = new HttpParams()
      .set('page', consulta.page)
      .set('pageSize', consulta.pageSize)
      .set('sort', consulta.sort)
      .set('order', consulta.order);
    // Filtro vazio não vai na URL: a API recusa `queue=` vazio.
    if (consulta.queue) {
      params = params.set('queue', consulta.queue);
    }
    if (consulta.status !== undefined) {
      params = params.set('status', consulta.status);
    }
    return this.http.get<PaginaDeDemandas>('/demands', { params });
  }

  reservar(demandaId: number): Observable<Demanda> {
    return this.http.post<Demanda>(`/demands/${demandaId}/reserve`, null);
  }

  encerrar(demandaId: number, corpo: CorpoDeEncerramento): Observable<Demanda> {
    return this.http.post<Demanda>(`/demands/${demandaId}/finish`, corpo);
  }
}
