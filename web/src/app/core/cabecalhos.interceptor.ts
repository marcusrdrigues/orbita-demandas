import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { UsuarioAtual } from './usuario-atual';

/** Acrescenta x-user-id e x-scopes do usuário simulado em toda chamada à API. */
export const cabecalhosInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
  const usuario = inject(UsuarioAtual).usuario();
  return proximo(
    requisicao.clone({
      setHeaders: {
        'x-user-id': String(usuario.id),
        'x-scopes': usuario.escopos.join(','),
      },
    }),
  );
};
