import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInitData, validateInitData } from '../src/auth/telegram.ts';
import { auth, json, setup, TEST_BOT_TOKEN } from './helpers.ts';

describe('Проверка Telegram initData', () => {
  it('принимает корректную подпись и возвращает пользователя', () => {
    const init = signInitData({ id: 42, first_name: 'Анна' }, TEST_BOT_TOKEN);
    expect(validateInitData(init, TEST_BOT_TOKEN, 3600).user.id).toBe(42);
  });

  it('отклоняет подмену id пользователя после подписи', () => {
    const init = signInitData({ id: 42, first_name: 'Анна' }, TEST_BOT_TOKEN);
    const forged = init.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(forged).not.toBe(init);
    expect(() => validateInitData(forged, TEST_BOT_TOKEN, 3600)).toThrow(/Подпись/);
  });

  it('отклоняет подпись другим токеном', () => {
    const init = signInitData({ id: 42 }, '999:OTHER');
    expect(() => validateInitData(init, TEST_BOT_TOKEN, 3600)).toThrow(/Подпись/);
  });

  it('отклоняет устаревшие initData', () => {
    const old = Math.floor(Date.now() / 1000) - 2 * 86400;
    const init = signInitData({ id: 42 }, TEST_BOT_TOKEN, old);
    expect(() => validateInitData(init, TEST_BOT_TOKEN, 86400)).toThrow(/устарели/);
  });

  it('учитывает поле signature при проверке hash (все поля, кроме hash)', () => {
    const init = signInitData({ id: 42 }, TEST_BOT_TOKEN, undefined, { signature: 'abc' });
    expect(validateInitData(init, TEST_BOT_TOKEN, 3600).user.id).toBe(42);
    const tampered = init.replace('signature=abc', 'signature=abd');
    expect(() => validateInitData(tampered, TEST_BOT_TOKEN, 3600)).toThrow();
  });
});

describe('Доступ к API', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { t = await setup(); }, 60_000);
  afterAll(async () => t.close());

  it('без авторизации защищённые маршруты возвращают 401', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(json(res).error.code).toBe('auth_required');
  });

  it('с неверной подписью — 401', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth({ id: 5 }, '999:WRONG') });
    expect(res.statusCode).toBe(401);
  });

  it('с верной подписью создаёт пользователя и отдаёт профиль', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth({ id: 1001, first_name: 'Иван' }) });
    expect(res.statusCode).toBe(200);
    const me = json(res);
    expect(me.user.firstName).toBe('Иван');
    expect(me.entitlement.pro).toBe(false);
    expect(me.isAdmin).toBe(false);
  });

  it('тестовые пользователи режима разработки отклоняются, если DEV_AUTH выключен', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth({ id: 990_000_000_001 }) });
    expect(res.statusCode).toBe(401);
  });

  it('маршрут выдачи тестовых initData закрыт без DEV_AUTH', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/dev/init-data', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('метрики доступны только администратору', async () => {
    const user = await t.app.inject({ method: 'GET', url: '/api/admin/metrics', headers: auth({ id: 1001 }) });
    expect(user.statusCode).toBe(403);
    const admin = await t.app.inject({ method: 'GET', url: '/api/admin/metrics', headers: auth({ id: 777 }) });
    expect(admin.statusCode).toBe(200);
    expect(json(admin).users.total).toBeGreaterThan(0);
  });

  it('пользователь не может удалить чужую закладку', async () => {
    const a = auth({ id: 2001 });
    const b = auth({ id: 2002 });
    const created = await t.app.inject({ method: 'POST', url: '/api/bookmarks', headers: a, payload: { trackKey: 'art-1', positionMs: 1000 } });
    expect(created.statusCode).toBe(200);
    const { id } = json(created);
    const foreign = await t.app.inject({ method: 'DELETE', url: `/api/bookmarks/${id}`, headers: b });
    expect(foreign.statusCode).toBe(404);
    const own = await t.app.inject({ method: 'DELETE', url: `/api/bookmarks/${id}`, headers: a });
    expect(own.statusCode).toBe(200);
  });

  it('публичная конфигурация не содержит секретов', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/config' });
    expect(res.body).not.toContain(TEST_BOT_TOKEN);
    expect(res.body).not.toContain('secret');
  });
});
