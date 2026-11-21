export const quickFormats = {
  carousel: { label: 'Carrossel', width: 1080, height: 1350, count: 4 },
  square: { label: 'Post quadrado', width: 1080, height: 1080, count: 1 },
} as const;

export type QuickFormat = keyof typeof quickFormats;
export const quickNetworks = { instagram: 'Instagram', linkedin: 'LinkedIn' } as const;
export type QuickNetwork = keyof typeof quickNetworks;

export interface QuickSuggestion {
  topic: string;
  format: QuickFormat;
  network: QuickNetwork;
  reason: string;
}

export interface QuickSuggestions {
  suggestions: QuickSuggestion[];
  projects: number;
  published: number;
}

export const quickStyle = (format: QuickFormat) =>
  `Estúdio CONFENGE · ${quickFormats[format].label}`;

export const getQuickFormat = (style: string): QuickFormat | undefined =>
  (Object.keys(quickFormats) as QuickFormat[]).find(
    (format) => style === quickStyle(format)
  );
