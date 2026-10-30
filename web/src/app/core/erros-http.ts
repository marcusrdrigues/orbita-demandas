import { HttpErrorResponse } from '@angular/common/http';

/** Mensagem para o usuário: a que a API mandou (já em pt-BR e sem detalhe interno) ou uma padrão. */
export function mensagemDaApi(falha: unknown, padrao = 'Não foi possível concluir a operação. Tente novamente.'): string {
  if (falha instanceof HttpErrorResponse) {
    const mensagem = (falha.error as { message?: unknown } | null)?.message;
    if (typeof mensagem === 'string' && mensagem !== '') {
      return mensagem;
    }
    if (falha.status === 0) {
      return 'Não foi possível falar com o servidor. Confira se a API está no ar.';
    }
  }
  return padrao;
}
