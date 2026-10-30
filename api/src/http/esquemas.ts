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

export const esquemaErro = z.object({
  code: z.string(),
  message: z.string(),
});
