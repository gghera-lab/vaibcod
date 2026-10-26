// Запоминание: очередь карточек, ответы, тесты по статьям и главам, обзор.

import { z } from 'zod';
import { requireUser } from '../auth/plugin.ts';
import type { AppContext } from '../app.ts';
import { getEntitlement } from '../services/entitlements.ts';
import { answerQuiz, answerReview, finishQuiz, getQueue, overview, startQuiz } from '../services/memory.ts';

const Answer = z.union([
  z.object({ index: z.number().int().min(0).max(10) }),
  z.object({ value: z.boolean() }),
  z.object({ text: z.string().min(1).max(200) }),
  z.object({ grade: z.number().int().min(1).max(4) }),
]);

export function registerMemoryRoutes(ctx: AppContext) {
  const { app, db } = ctx;
  const pro = async (userId: number) => (await getEntitlement(db, userId)).pro;

  app.get('/api/memory/overview', async (req) => {
    const user = requireUser(req);
    return overview(db, user.id, await pro(user.id));
  });

  app.get('/api/memory/queue', async (req) => {
    const user = requireUser(req);
    const q = z.object({
      mode: z.enum(['due', 'mistakes', 'article', 'chapter']).default('due'),
      key: z.string().max(32).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    }).parse(req.query);
    return getQueue(db, user.id, await pro(user.id), q);
  });

  app.post('/api/memory/cards/:id/answer', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = z.object({ answer: Answer, confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional() }).parse(req.body);
    return answerReview(db, user.id, await pro(user.id), id, body.answer, body.confidence ?? null);
  });

  app.post('/api/quiz', async (req) => {
    const user = requireUser(req);
    const body = z.object({ scope: z.enum(['article', 'chapter']), key: z.string().min(1).max(32) }).parse(req.body);
    return startQuiz(db, user.id, await pro(user.id), body.scope, body.key);
  });

  app.post('/api/quiz/:id/answer', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const body = z.object({ cardId: z.string().max(64), answer: Answer }).parse(req.body);
    return answerQuiz(db, user.id, await pro(user.id), id, body.cardId, body.answer);
  });

  app.post('/api/quiz/:id/finish', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    return finishQuiz(db, user.id, id);
  });
}
