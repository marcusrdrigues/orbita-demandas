import type { Demanda } from './demanda.js';
import type { Usuario } from './usuario.js';

/** Base dos erros de regra de negócio; o código vai na resposta, a tradução para HTTP fica em http/. */
export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: string;

  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class NaoAutenticado extends ErroDeDominio {
  readonly codigo = 'NAO_AUTENTICADO';

  constructor() {
    super('Usuário não identificado.');
  }
}

export class SemPermissao extends ErroDeDominio {
  readonly codigo = 'SEM_PERMISSAO';

  constructor(mensagem = 'Você não tem permissão para esta operação.') {
    super(mensagem);
  }
}

export class DemandaNaoEncontrada extends ErroDeDominio {
  readonly codigo = 'DEMANDA_NAO_ENCONTRADA';

  constructor() {
    super('Demanda não encontrada.');
  }
}

export class DemandaJaReservada extends ErroDeDominio {
  readonly codigo = 'DEMANDA_JA_RESERVADA';

  constructor(
    readonly dono: Usuario,
    readonly demanda: Demanda,
  ) {
    super(`Demanda já reservada por ${dono.name}.`);
  }
}

export class DemandaEncerrada extends ErroDeDominio {
  readonly codigo = 'DEMANDA_ENCERRADA';

  constructor(readonly demanda: Demanda) {
    super('Demanda já encerrada.');
  }
}

export class DemandaNaoReservada extends ErroDeDominio {
  readonly codigo = 'DEMANDA_NAO_RESERVADA';

  constructor() {
    super('Só é possível encerrar uma demanda que está reservada.');
  }
}
