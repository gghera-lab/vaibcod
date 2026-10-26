// Первый запуск: три коротких экрана о продукте и согласие с условиями.

import type { MeDto, PublicConfig } from '@pravo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Sheet, Spinner, useToast } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { get, post } from '../lib/api.ts';
import { Markdown } from '../lib/markdown.tsx';
import { haptic } from '../lib/telegram.ts';

const STEPS = [
  {
    icon: 'headphones',
    title: 'Изучайте право на слух',
    text: 'Полная аудиокнига Конституции РФ: по главам и статьям, с текстом перед глазами. Место остановки сохраняется — продолжите с той же фразы.',
  },
  {
    icon: 'brain',
    title: 'Не просто слушайте — учитесь вспоминать',
    text: 'Вопросы по прослушанным статьям, тесты по главам и интервальные повторения. Каждый ответ подтверждён цитатой из текста. Прогресс — только по вашим реальным ответам.',
  },
  {
    icon: 'library',
    title: 'Каталог законодательства',
    text: 'Кодексы, законы и подзаконные акты — в каталоге со ссылками на официальный источник, каталог пополняется. Их озвучка в разработке — голосуйте, какой документ озвучить следующим.',
  },
];

export function Onboarding({ config, me }: { config: PublicConfig; me: MeDto }) {
  const [step, setStep] = useState(0);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = async () => {
    setBusy(true);
    try {
      const updated = await post<MeDto>('/api/me/onboarding', { acceptTerms: true, termsVersion: config.termsVersion });
      haptic.success();
      track('onboarding_complete');
      qc.setQueryData(['me'], updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="badge beta">Бета-версия</span>
        {!last ? <button className="btn small" style={{ background: 'transparent', color: '#fff' }} onClick={() => setStep(STEPS.length - 1)}>Пропустить</button> : <span />}
      </div>
      <div className="step-art">
        <div style={{ width: 132, height: 132, borderRadius: 40, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--amber)' }}>
          <Icon name={s.icon} size={64} />
        </div>
      </div>
      <div>
        <h1>{me.user.firstName && step === 0 ? `${me.user.firstName}, добро пожаловать!` : s.title}</h1>
        {step === 0 && me.user.firstName ? <p style={{ fontWeight: 600, color: '#fff' }}>{s.title}</p> : null}
        <p>{s.text}</p>
        <div className="dots">{STEPS.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        {last ? (
          <label className="check" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              Я принимаю <a href="#" onClick={(e) => { e.preventDefault(); setDoc('terms'); }}>Пользовательское соглашение</a> и ознакомлен(а) с{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setDoc('privacy'); }}>Политикой обработки персональных данных</a>.
            </span>
          </label>
        ) : null}
        <button className="btn accent block" disabled={(last && !agree) || busy} onClick={() => (last ? finish() : setStep(step + 1))}>
          {busy ? <Spinner /> : last ? 'Начать' : 'Далее'}
        </button>
      </div>
      <LegalSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

export function LegalSheet({ doc, onClose }: { doc: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['legal', doc], queryFn: () => get<{ title: string; markdown: string }>(`/api/legal/${doc}`), enabled: !!doc });
  return (
    <Sheet open={!!doc} onClose={onClose}>
      <div style={{ color: 'var(--text)' }}>
        {q.isLoading ? <p className="muted">Загрузка…</p> : q.data ? <Markdown source={q.data.markdown} /> : <p className="muted">Не удалось загрузить документ</p>}
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={onClose}>Закрыть</button>
      </div>
    </Sheet>
  );
}
