// Ошибки API: понятное сообщение пользователю, код для клиента, без раскрытия внутренних деталей.

import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = 'Объект') => new AppError(404, 'not_found', `${what} не найден`);
export const forbidden = (message = 'Недостаточно прав') => new AppError(403, 'forbidden', message);
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const proRequired = () => new AppError(402, 'pro_required', 'Доступно в подписке Pro');

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'validation', message: 'Некорректные данные запроса', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Слишком много запросов. Попробуйте через минуту.' } });
    if (status < 500) return reply.status(status).send({ error: { code: (err as FastifyError).code ?? 'bad_request', message: err.message } });
    req.log.error({ err }, 'Необработанная ошибка');
    return reply.status(500).send({ error: { code: 'internal', message: 'Внутренняя ошибка сервера. Мы уже разбираемся.' } });
  });
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: 'Маршрут не найден' } });
  });
}
