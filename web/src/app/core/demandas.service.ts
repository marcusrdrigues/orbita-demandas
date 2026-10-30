import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type StatusDemanda = 1 | 2 | 3;
export type CampoOrdenacao = 'id' | 'updated_at';
export type SentidoOrdenacao = 'asc' | 'desc';

export interface Demanda {
  id: number;
  title: string;
  queue: string;
  status: StatusDemanda;
  workerId: number | null;
  workerName: string | null;
  outcome: 'success' | 'failure' | null;
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

export interface ConsultaDeDemandas {
  page: number;
  pageSize: number;
  queue?: string;
  status?: StatusDemanda;
  sort: CampoOrdenacao;
  order: SentidoOrdenacao;
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
}
