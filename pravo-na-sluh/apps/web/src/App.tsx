// Корень приложения: авторизация через Telegram, тема, онбординг, маршруты.

import type { PublicConfig } from '@pravo/shared';
import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Icon } from './components/Icon.tsx';
import { MiniPlayer, TabBar, useTelegramBackButton } from './components/Layout.tsx';
import { ErrorState, Skeleton } from './components/ui.tsx';
import { setAnalyticsEnabled, track } from './lib/analytics.ts';
import { ensureAuth } from './lib/api.ts';
import { useConfig, useMe } from './lib/hooks.ts';
import { inTelegram, setChromeColors, telegramColorScheme, tg } from './lib/telegram.ts';
import { PlayerProvider } from './player/PlayerProvider.tsx';
import { AdminScreen } from './screens/Admin.tsx';
import { ArticleScreen } from './screens/Article.tsx';
import { ConstitutionScreen } from './screens/Constitution.tsx';
import { DocumentScreen } from './screens/Document.tsx';
import { FavoritesScreen } from './screens/Favorites.tsx';
import { HomeScreen } from './screens/Home.tsx';
import { LegalScreen } from './screens/Legal.tsx';
import { LibraryScreen } from './screens/Library.tsx';
import { MemoryScreen } from './screens/Memory.tsx';
import { NotFound } from './screens/NotFound.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { PlayerScreen } from './screens/Player.tsx';
import { InviteScreen, PaymentsScreen, PrivacyScreen, ProfileScreen, SettingsScreen, SupportScreen } from './screens/Profile.tsx';
import { QuizScreen } from './screens/Quiz.tsx';
import { ReviewScreen } from './screens/Review.tsx';
import { TariffsScreen } from './screens/Tariffs.tsx';

function useTheme(pref: 'auto' | 'light' | 'dark' | undefined) {
  useEffect(() => {
    const apply = () => {
      const auto = telegramColorScheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const theme = !pref || pref === 'auto' ? auto : pref;
      document.documentElement.dataset.theme = theme;
      setChromeColors(theme === 'dark' ? '#0d1117' : '#f4f6fa');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    tg?.onEvent('themeChanged', apply);
    return () => {
      mq.removeEventListener('change', apply);
      tg?.offEvent('themeChanged', apply);
    };
  }, [pref]);
}

export function App() {
  const config = useConfig();
  const [auth, setAuth] = useState<'pending' | 'ok' | 'none'>(inTelegram ? 'ok' : 'pending');

  useEffect(() => {
    if (!config.data || inTelegram) return;
    ensureAuth(config.data).then((d) => setAuth(d ? 'ok' : 'none'));
  }, [config.data]);

  const me = useMe(auth === 'ok');
  useTheme(me.data?.settings.theme);
  useEffect(() => {
    if (me.data) {
      setAnalyticsEnabled(!me.data.user.analyticsOptOut);
      track('app_open', { tg: inTelegram, platform: tg?.platform ?? 'web' });
    }
  }, [me.data?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (config.isError) return <div className="screen"><ErrorState error={config.error} onRetry={() => config.refetch()} /></div>;
  if (auth === 'none' && config.data) return <OpenInTelegram config={config.data} />;
  if (!config.data || auth === 'pending' || me.isLoading) return <Splash />;
  if (me.isError || !me.data) return <div className="screen"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  if (!me.data.user.onboarded || !me.data.user.termsAccepted) return <Onboarding config={config.data} me={me.data} />;

  const s = me.data.settings;
  return (
    <PlayerProvider enabled settings={{ playbackRate: s.playbackRate, autoAdvance: s.autoAdvance, chapterChime: s.chapterChime, voiceId: s.voiceId }}>
      <Shell config={config.data} />
    </PlayerProvider>
  );
}

function Shell({ config }: { config: PublicConfig }) {
  useTelegramBackButton();
  return (
    <div className="app">
      {config.devAuth && !inTelegram ? (
        <div className="state-box warn" style={{ borderRadius: 0, justifyContent: 'center', fontSize: 12, padding: '6px 10px' }}>
          Режим разработки: вход без Telegram (тестовый пользователь)
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/doc/:id" element={<DocumentScreen />} />
        <Route path="/constitution" element={<ConstitutionScreen />} />
        <Route path="/constitution/:key" element={<ArticleScreen />} />
        <Route path="/player" element={<PlayerScreen />} />
        <Route path="/memory" element={<MemoryScreen />} />
        <Route path="/memory/review" element={<ReviewScreen />} />
        <Route path="/memory/quiz/:scope/:key" element={<QuizScreen />} />
        <Route path="/favorites" element={<FavoritesScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/profile/settings" element={<SettingsScreen />} />
        <Route path="/profile/privacy" element={<PrivacyScreen />} />
        <Route path="/profile/support" element={<SupportScreen />} />
        <Route path="/profile/payments" element={<PaymentsScreen />} />
        <Route path="/profile/invite" element={<InviteScreen />} />
        <Route path="/pro" element={<TariffsScreen />} />
        <Route path="/legal/:doc" element={<LegalScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <MiniPlayer />
      <TabBar />
    </div>
  );
}

function Splash() {
  return (
    <div className="screen">
      <div style={{ height: 40 }} />
      <Skeleton h={150} />
      <div style={{ height: 16 }} />
      <Skeleton h={64} n={3} />
    </div>
  );
}

function OpenInTelegram({ config }: { config: PublicConfig }) {
  return (
    <div className="onboarding" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: 0, marginBottom: 18 }}><Icon name="headphones" size={56} /></div>
      <h1>Откройте приложение в Telegram</h1>
      <p>«Право на слух» работает как Telegram Mini App: вход выполняется через подпись Telegram, без паролей.</p>
      {config.botUsername ? (
        <a className="btn accent block" style={{ marginTop: 18 }} href={`https://t.me/${config.botUsername}`}>Открыть @{config.botUsername}</a>
      ) : (
        <p className="small" style={{ marginTop: 18 }}>Бот ещё не подключён (не задан BOT_USERNAME).</p>
      )}
    </div>
  );
}
