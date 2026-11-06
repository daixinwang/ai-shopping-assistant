import { Platform, TextStyle } from 'react-native';

/**
 * Receipt and shelf-tag palette: cool thermal-paper whites, receipt ink, and a single
 * shelf-tag yellow reserved for prices, the current selection and the brand mark.
 * The original names (ink, paper, surface, wash, rule, muted, error, success) are kept
 * so screens that have not been redesigned follow the new palette automatically.
 */
export const colors = {
  ink: '#16181D',
  paper: '#F4F4F0',
  surface: '#FFFFFF',
  wash: '#EBECE6',
  rule: '#DCDDD6',
  muted: '#5D626B',
  faint: '#8E929A',
  /** Secondary text on ink surfaces (hero, viewfinder, status card). */
  mutedOnInk: '#B9BCC2',
  tag: '#FFD23F',
  tagDeep: '#E8B500',
  error: '#C2412D',
  success: '#17855A',
  scrim: 'rgba(22, 24, 29, 0.45)',
};

export const fonts = {
  // Original key; headings now use the platform's heavy sans instead of a serif.
  editorial: Platform.select({
    web: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif',
    default: undefined,
  }),
  // Prices, totals and order numbers read like a printed receipt.
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    web: '"JetBrains Mono", "SF Mono", "Cascadia Mono", Consolas, monospace',
    default: 'monospace',
  }),
};

export const radii = { sm: 8, md: 14, lg: 22, pill: 999 };

/**
 * Web only: removes the browser focus outline from an input that sits inside a styled
 * container. The container must show focus itself (for example a darker border).
 */
export const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as unknown as TextStyle;

export const text = {
  display: { fontFamily: fonts.editorial, fontSize: 28, lineHeight: 36, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  title: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.ink },
  heading: { fontFamily: fonts.editorial, fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted },
  micro: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14, letterSpacing: 1.2, color: colors.faint },
  money: { fontFamily: fonts.mono, fontWeight: '700', color: colors.ink },
} satisfies Record<string, TextStyle>;
