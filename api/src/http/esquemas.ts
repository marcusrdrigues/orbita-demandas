import { z } from 'zod';

export const esquemaDemanda = z.object({
  id: z.number().int(),
  title: z.string(),
  queue: z.string(),
  status: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  workerId: z.number().int().nullable(),
  workerName: z.string().nullable(),
  outcome: z.enum(['success', 'failure']).nullable(),
  failureReason: z.string().nullable(),
  note: z.string().nullable(),
  updatedAt: z.date(),
});

// Query estrita: qualquer parâmetro fora desta lista, ou com valor inválido, vira 400.
export const esquemaConsultaDeDemandas = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  queue: z.string().min(1).max(40).optional(),
  status: z
    .enum(['1', '2', '3'])
    .transform((valor) => Number(valor) as 1 | 2 | 3)
    .optional(),
  sort: z.enum(['id', 'updated_at']).default('id'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const esquemaPaginaDeDemandas = z.object({
  items: z.array(esquemaDemanda),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const esquemaErro = z.object({
  code: z.string(),
  message: z.string(),
});

export const esquemaParametroDeDemanda = z.object({
  // INT do MySQL: acima disso a demanda não pode existir.
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

// Corpo do encerramento. As regras condicionais do motivo repetem as do caso de uso de propósito:
// aqui dão a resposta 400 detalhada por campo; lá protegem qualquer outro chamador.
export const esquemaCorpoDeEncerramento = z
  .strictObject({
    outcome: z.enum(['success', 'failure']),
    failureReason: z.string().trim().min(1).max(40).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((corpo, contexto) => {
    if (corpo.outcome === 'failure' && corpo.failureReason === undefined) {
      contexto.addIssue({ code: 'custom', path: ['failureReason'], message: 'Informe o motivo do insucesso.' });
    }
    if (corpo.outcome === 'success' && corpo.failureReason !== undefined) {
      contexto.addIssue({ code: 'custom', path: ['failureReason'], message: 'O motivo só se aplica ao insucesso.' });
    }
  });

// 409: além do erro, devolve a demanda atual (e o dono, quando está reservada) para o front
// atualizar a linha sem nova consulta.
export const esquemaConflitoDeReserva = esquemaErro.extend({
  holder: z.object({ id: z.number().int(), name: z.string() }).optional(),
  demanda: esquemaDemanda,
});
