// Обёртка над Telegram.WebApp. Вне Telegram (браузер разработчика) методы деградируют безопасно.

interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string }; start_param?: string };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(v: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  onEvent(e: string, cb: (...a: unknown[]) => void): void;
  offEvent(e: string, cb: (...a: unknown[]) => void): void;
  BackButton: TgButton;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  showAlert?(message: string, cb?: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | null = typeof window !== 'undefined' ? window.Telegram?.WebApp ?? null : null;

/** Mini App открыт внутри Telegram (есть подписанные initData). */
export const inTelegram = !!tg?.initData;

const atLeast = (v: string) => !!tg?.isVersionAtLeast?.(v);

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Свайп вниз закрывает приложение — мешает перемотке в плеере (Bot API 7.7+).
  if (atLeast('7.7')) tg.disableVerticalSwipes?.();
}

export function setChromeColors(bg: string) {
  if (!inTelegram) return;
  try {
    if (atLeast('6.1')) {
      tg!.setHeaderColor?.(bg);
      tg!.setBackgroundColor?.(bg);
    }
    if (atLeast('7.10')) tg!.setBottomBarColor?.(bg);
  } catch {
    /* старые клиенты Telegram */
  }
}

// Вибрация доступна только внутри Telegram (Bot API 6.1+); вне Telegram вызовы молча пропускаются.
const hf = () => (inTelegram && atLeast('6.1') ? tg!.HapticFeedback : undefined);
export const haptic = {
  tap: () => hf()?.impactOccurred('light'),
  select: () => hf()?.selectionChanged(),
  success: () => hf()?.notificationOccurred('success'),
  error: () => hf()?.notificationOccurred('error'),
  warning: () => hf()?.notificationOccurred('warning'),
};

export function openExternal(url: string) {
  if (inTelegram) tg!.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** Окно «Поделиться» Telegram (выбор чата) с готовым текстом; вне Telegram — в новой вкладке. */
export function shareLink(url: string, text: string) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (inTelegram) tg!.openTelegramLink(share);
  else window.open(share, '_blank', 'noopener,noreferrer');
}

export function confirmDialog(message: string): Promise<boolean> {
  if (inTelegram && tg!.showConfirm && atLeast('6.2')) return new Promise((r) => tg!.showConfirm!(message, r));
  return Promise.resolve(window.confirm(message));
}

export function telegramColorScheme(): 'light' | 'dark' | null {
  return inTelegram ? tg!.colorScheme : null;
}
