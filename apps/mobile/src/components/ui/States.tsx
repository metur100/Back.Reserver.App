import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { isApiError } from '@/api/errors';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/** Pulsing placeholder block used for loading skeletons. */
export function Skeleton({ width = '100%', height = 16, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, opacity }, style]} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.skeletonList} accessibilityLabel={de.common.loading} accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={72} height={72} />
          <View style={styles.skeletonText}>
            <Skeleton width="70%" height={18} />
            <Skeleton width="90%" height={14} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon = 'basket', title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.center} accessibilityRole="summary">
      <View style={styles.iconCircle}>
        <Icon name={icon} size={30} color={colors.accentText} />
      </View>
      <AppText variant="heading" center>
        {title}
      </AppText>
      {text ? (
        <AppText variant="body" color={colors.textMuted} center>
          {text}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, title, onRetry }: { error: unknown; title?: string; onRetry?: () => void }) {
  const offline = isApiError(error) && error.isNetworkError;
  const message = isApiError(error) ? error.title : de.errors.unknown;
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
        <Icon name={offline ? 'cloud-offline' : 'alert-circle'} size={30} color={colors.danger} />
      </View>
      {title ? (
        <AppText variant="heading" center>
          {title}
        </AppText>
      ) : null}
      <AppText variant="body" color={colors.textMuted} center>
        {message}
      </AppText>
      {onRetry ? <Button label={de.common.retry} icon="refresh" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'error';
const tones: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' },
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' },
};

export function Notice({ tone = 'info', children, style }: { tone?: Tone; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }, style]} accessibilityRole={tone === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite">
      <Icon name={t.icon} size={20} color={t.fg} />
      <View style={styles.noticeText}>
        {typeof children === 'string' ? <AppText color={t.fg === colors.info ? colors.text : t.fg}>{children}</AppText> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonList: { gap: spacing.lg, padding: spacing.lg },
  skeletonRow: { flexDirection: 'row', gap: spacing.md },
  skeletonText: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  noticeText: { flex: 1 },
});
