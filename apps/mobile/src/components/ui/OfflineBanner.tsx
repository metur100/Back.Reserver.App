import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { de } from '@/i18n/de';
import { colors, spacing } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOffline(state.isConnected === false || state.isInternetReachable === false);
      }),
    [],
  );
  return offline;
}

/** Thin banner shown app-wide while the device has no connectivity. */
export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Icon name="cloud-offline" size={18} color={colors.onAccent} />
      <AppText variant="label" color={colors.onAccent}>
        {de.offline}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
