// Базовые элементы интерфейса: заголовок экрана, лист, переключатель, состояния, тосты.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { inTelegram } from '../lib/telegram.ts';
import { Icon } from './Icon.tsx';

export function TopBar({ title, back, right }: { title: ReactNode; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate();
  // В Telegram используется системная кнопка «Назад» (BackButton), в браузере — своя.
  return (
    <header className="topbar">
      {back && !inTelegram ? (
        <button className="back-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Назад">
          <Icon name="left" />
        </button>
      ) : null}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    </>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Progress({ value }: { value: number }) {
  return <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Empty({ icon = 'info', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      {children ? <div className="small">{children}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Что-то пошло не так';
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <Empty icon={offline ? 'offline' : 'alert'} title={offline ? 'Нет подключения' : 'Не удалось загрузить'}
      action={onRetry ? <button className="btn primary" onClick={onRetry}>Повторить</button> : undefined}>
      {offline ? 'Проверьте интернет и попробуйте снова.' : message}
    </Empty>
  );
}

export function Skeleton({ h = 72, n = 1 }: { h?: number; n?: number }) {
  return <div className="stack">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

// ── Тосты
type Toast = { id: number; text: string; kind: 'info' | 'error' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
