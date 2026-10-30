/** Filas da base de exemplo (db/seed.sql). Lista fixa: a API não tem consulta de filas. */
export const FILAS = ['suporte', 'vendas', 'financeiro', 'retencao'] as const;

export type Fila = (typeof FILAS)[number];
