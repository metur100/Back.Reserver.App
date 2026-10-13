import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * BackReserve design tokens: warm, premium local-food look matching the web app.
 * Contrast notes (WCAG AA, normal text ≥ 4.5:1):
 *  - espresso #2B211C on cream #FAF6F0 ≈ 15:1
 *  - accentText #8E3F1C on cream ≈ 7:1 (terracotta #B5562B is only used for fills/large text)
 *  - white on terracotta #B5562B ≈ 4.8:1
 *  - success #3D6B3A on cream ≈ 6:1
 */
export const colors = {
  background: '#FAF6F0',
  surface: '#FFFFFF',
  surfaceMuted: '#F3ECE2',
  text: '#2B211C',
  textMuted: '#62544B',
  textSubtle: '#7A6B61',
  accent: '#B5562B',
  accentPressed: '#9A4723',
  accentText: '#8E3F1C',
  accentSoft: '#F6E4D9',
  onAccent: '#FFFFFF',
  border: '#E6DACB',
  borderStrong: '#CDBBA6',
  success: '#3D6B3A',
  successSoft: '#E5EFE1',
  warning: '#7A5200',
  warningSoft: '#FBEFD5',
  danger: '#A3342A',
  dangerSoft: '#F8E1DE',
  info: '#2F5A73',
  infoSoft: '#E1ECF2',
  disabled: '#B9ACA0',
  disabledSoft: '#EFE9E2',
  overlay: 'rgba(43,33,28,0.45)',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const touchTarget = 48;

export const fontFamily = Platform.select({
  ios: { regular: 'System', serif: 'Georgia' },
  android: { regular: 'sans-serif', serif: 'serif' },
  default: { regular: 'System', serif: 'Georgia' },
});

export const typography: Record<
  'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'code',
  TextStyle
> = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700', fontFamily: fontFamily.serif, color: colors.text },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', fontFamily: fontFamily.serif, color: colors.text },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700', color: colors.text },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.text },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  code: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
};

export const shadow: ViewStyle = Platform.select({
  ios: { shadowColor: '#2B211C', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  android: { elevation: 2 },
  default: { shadowColor: '#2B211C', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
}) as ViewStyle;

export const shadowStrong: ViewStyle = Platform.select({
  ios: { shadowColor: '#2B211C', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: -2 } },
  android: { elevation: 8 },
  default: { shadowColor: '#2B211C', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: -2 } },
}) as ViewStyle;

/** Cap dynamic type growth so layouts stay usable while still honouring the user's font size preference. */
export const maxFontScale = 1.6;

export const theme = { colors, spacing, radius, typography, shadow, shadowStrong, touchTarget, maxFontScale };
export type Theme = typeof theme;
