// Запросы к API через React Query: кеш, повторные попытки, инвалидация после изменений.

import type {
  ArticleDto, ConstitutionTocDto, DocumentDto, FavoritesDto, MeDto, MemoryOverviewDto, PaymentDto, ProductDto, PublicConfig, ReferralDto, StatsDto,
} from '@pravo/shared';
import { useQuery } from '@tanstack/react-query';
import { get } from './api.ts';

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => get<PublicConfig>('/api/config'), staleTime: Infinity, retry: 2 });
export const useMe = (enabled = true) => useQuery({ queryKey: ['me'], queryFn: () => get<MeDto>('/api/me'), enabled, staleTime: 60_000 });
export const useToc = () => useQuery({ queryKey: ['toc'], queryFn: () => get<ConstitutionTocDto>('/api/constitution'), staleTime: 30_000 });
export const useArticle = (key: string) => useQuery({ queryKey: ['article', key], queryFn: () => get<ArticleDto>(`/api/constitution/articles/${encodeURIComponent(key)}`), enabled: !!key });
export const useDocument = (id: string) => useQuery({ queryKey: ['doc', id], queryFn: () => get<DocumentDto>(`/api/documents/${encodeURIComponent(id)}`) });
export const useCatalog = (params: Record<string, string | undefined>) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ queryKey: ['catalog', qs], queryFn: () => get<{ items: DocumentDto[]; total: number }>(`/api/catalog${qs ? `?${qs}` : ''}`), placeholderData: (prev) => prev });
};
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => get<{ id: string; title: string; hint: string; count: number }[]>('/api/catalog/categories'), staleTime: 300_000 });
export const useUpcoming = () => useQuery({ queryKey: ['upcoming'], queryFn: () => get<DocumentDto[]>('/api/catalog/upcoming') });
export const useFavorites = () => useQuery({ queryKey: ['favorites'], queryFn: () => get<FavoritesDto>('/api/favorites') });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => get<StatsDto>('/api/me/stats') });
export const useMemoryOverview = () => useQuery({ queryKey: ['memory-overview'], queryFn: () => get<MemoryOverviewDto>('/api/memory/overview') });
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => get<{ mode: PublicConfig['paymentsMode']; free: { title: string; features: string[] }; products: ProductDto[] }>('/api/billing/products') });
export const useReferrals = () => useQuery({ queryKey: ['referrals'], queryFn: () => get<ReferralDto>('/api/me/referrals') });
export const usePayments = () => useQuery({ queryKey: ['payments'], queryFn: () => get<PaymentDto[]>('/api/billing/payments') });
