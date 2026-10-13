import { ScrollView, StyleSheet, View, type RefreshControlProps, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  footer?: React.ReactNode;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
}

/** Page container: cream background, safe areas, optional scroll and sticky footer. Content width is capped for tablets. */
export function Screen({ children, scroll = true, edges = ['bottom'], contentStyle, refreshControl, footer, keyboardShouldPersistTaps = 'handled' }: ScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg },
});
