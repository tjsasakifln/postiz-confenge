export const quickFormats = {
  carousel: { label: 'Carrossel', width: 1080, height: 1350, count: 4 },
  square: { label: 'Post quadrado', width: 1080, height: 1080, count: 1 },
} as const;

export type QuickFormat = keyof typeof quickFormats;
export const quickNetworks = { instagram: 'Instagram', linkedin: 'LinkedIn' } as const;
export type QuickNetwork = keyof typeof quickNetworks;
export const tacoLabels = {
  T: 'Técnico',
  A: 'Autoridade',
  C: 'Conexão',
  O: 'Quebra de objeção',
} as const;
export type TacoType = keyof typeof tacoLabels;
export const tacoOrder = Object.keys(tacoLabels) as TacoType[];

export interface QuickSuggestion {
  topic: string;
  format: QuickFormat;
  network: QuickNetwork;
  taco: TacoType;
  reason: string;
  source?: StudioSource;
}

export interface QuickSuggestions {
  suggestions: QuickSuggestion[];
  projects: number;
  published: number;
}

export const quickStyle = (format: QuickFormat, taco?: TacoType) =>
  `Estúdio CONFENGE · ${quickFormats[format].label}${taco ? ` · ${taco}` : ''}`;

export const getQuickFormat = (style: string): QuickFormat | undefined =>
  (Object.keys(quickFormats) as QuickFormat[]).find(
    (format) => style === quickStyle(format) || tacoOrder.some(taco => style === quickStyle(format, taco))
  );

export const getQuickTaco = (style: string): TacoType | undefined => {
  const format = getQuickFormat(style);
  return format ? tacoOrder.find(taco => style === quickStyle(format, taco)) : undefined;
};
import type { StudioSource } from './studio.types';

