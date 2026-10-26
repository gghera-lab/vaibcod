import type { SpeechSegment } from '@pravo/shared';

export interface VoiceProfile {
  id: string;
  provider: 'windows-onecore' | 'yandex-speechkit' | 'recorded';
  providerVoice: string;
  role?: string;
  title: string;
  description: string;
  gender: 'male' | 'female';
  quality: 'beta' | 'production';
  default: boolean;
  license: string;
}

export interface SynthesisJob {
  key: string;
  segment: SpeechSegment;
  outWav: string;
}

export interface TtsProvider {
  id: VoiceProfile['provider'];
  /** Синтезирует сегменты в WAV-файлы (PCM 16 бит). Бросает ошибку, если провайдер недоступен. */
  synthesize(jobs: SynthesisJob[], voice: VoiceProfile, log: (s: string) => void): Promise<void>;
  /** Версия правил рендеринга — входит в ключ кеша. */
  renderVersion: string;
  /** Оценка стоимости, ₽ (для платных провайдеров). */
  estimateCostRub(jobs: SynthesisJob[]): number;
}

const STRESS = '́';

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Нейтральные ударения (гласная + U+0301) → формат SpeechKit («+» перед гласной). */
export function stressToPlus(s: string): string {
  return s.replace(new RegExp(`([аеёиоуыэюяАЕЁИОУЫЭЮЯ])${STRESS}`, 'g'), '+$1');
}

export function stripStress(s: string): string {
  return s.replace(new RegExp(STRESS, 'g'), '');
}
