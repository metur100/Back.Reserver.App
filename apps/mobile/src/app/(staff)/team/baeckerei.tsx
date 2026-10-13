import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { AppText, Button, Card, EmptyState, Icon, Screen } from '@/components/ui';
import { de } from '@/i18n/de';
import { colors, spacing } from '@/theme';

/** Tenant picker for users with several bakery memberships. */
export default function TenantPickerScreen() {
  const { status, memberships, tenantId, selectTenant, logout } = useAuth();
  if (status === 'signedOut') return <Redirect href="/team/anmelden" />;

  if (memberships.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="business"
          title={de.auth.noMembership}
          action={<Button label={de.auth.logout} icon="log-out" variant="secondary" onPress={() => void logout()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText color={colors.textMuted}>{de.auth.chooseTenantHint}</AppText>
      {memberships.map((m) => {
        const selected = m.tenantId === tenantId;
        const suspended = m.tenantStatus === 'Suspended';
        return (
          <Pressable
            key={m.tenantId}
            onPress={() => {
              selectTenant(m.tenantId);
              router.replace('/team');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${m.tenantName}, ${de.roles[m.role] ?? m.role}${suspended ? `, ${de.auth.suspended}` : ''}`}
          >
            {({ pressed }) => (
              <Card style={[styles.card, selected && styles.selected, pressed && styles.pressed]}>
                <Icon name="storefront" size={24} color={colors.accentText} />
                <View style={styles.flex}>
                  <AppText variant="subheading">{m.tenantName}</AppText>
                  <AppText variant="caption">
                    {de.roles[m.role] ?? m.role}
                    {suspended ? ` · ${de.auth.suspended}` : ''}
                  </AppText>
                </View>
                {selected ? <Icon name="checkmark-circle" size={22} color={colors.success} /> : <Icon name="chevron-forward" size={20} color={colors.textMuted} />}
              </Card>
            )}
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  selected: { borderColor: colors.accent, borderWidth: 2 },
  pressed: { opacity: 0.85 },
  flex: { flex: 1 },
});
