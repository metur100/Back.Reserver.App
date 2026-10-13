import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { AppText, Button, Card, Chip, Notice, Screen } from '@/components/ui';
import { env } from '@/config/env';
import { de } from '@/i18n/de';
import { registerForPushNotifications, type PushRegistration } from '@/notifications/notifications';
import { useStaffLocations } from '@/staff/useStaffLocations';
import { colors, spacing } from '@/theme';
import { confirmDialog } from '@/utils/dialogs';

export default function AccountScreen() {
  const { user, membership, memberships, locationId, setLocationId, logout } = useAuth();
  const locations = useStaffLocations();
  const [push, setPush] = useState<PushRegistration | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const onLogout = async () => {
    const ok = await confirmDialog({ title: de.auth.logout, message: de.auth.logoutConfirm, confirmLabel: de.auth.logout, destructive: true });
    if (!ok) return;
    await logout();
    router.replace('/team/anmelden');
  };

  const registerPush = async () => {
    setPushBusy(true);
    try {
      setPush(await registerForPushNotifications());
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={styles.gap}>
        <AppText variant="caption">{de.staff.signedInAs}</AppText>
        <AppText variant="heading">
          {user?.firstName} {user?.lastName}
        </AppText>
        <AppText color={colors.textMuted}>{user?.email}</AppText>
      </Card>

      {membership ? (
        <Card style={styles.gap}>
          <AppText variant="caption">{de.staff.bakery}</AppText>
          <AppText variant="heading">{membership.tenantName}</AppText>
          <AppText>
            {de.staff.role}: {de.roles[membership.role] ?? membership.role}
          </AppText>
          <AppText variant="label">{de.staff.permissions}</AppText>
          <View style={styles.perms}>
            {membership.permissions.map((p) => (
              <View key={p} style={styles.perm}>
                <AppText variant="caption" color={colors.text}>
                  {de.permissionNames[p] ?? p}
                </AppText>
              </View>
            ))}
          </View>
          {memberships.length > 1 ? (
            <Button label={de.staff.switchBakery} icon="swap-horizontal" variant="secondary" onPress={() => router.push('/team/baeckerei')} />
          ) : null}
        </Card>
      ) : null}

      {locations.data && locations.data.length > 0 ? (
        <Card style={styles.gap}>
          <AppText variant="label">{de.staff.location}</AppText>
          <View style={styles.perms}>
            {locations.data.length > 1 ? <Chip label={de.staff.allLocations} selected={!locationId} onPress={() => setLocationId(null)} /> : null}
            {locations.data.map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                sublabel={l.city}
                selected={locationId === l.id || locations.data.length === 1}
                onPress={() => setLocationId(l.id)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={styles.gap}>
        <AppText variant="label">{de.staff.push}</AppText>
        <AppText variant="caption">{de.staff.pushHint}</AppText>
        {push?.status === 'registered' ? <Notice tone="success">{de.staff.pushRegistered}</Notice> : null}
        {push?.status === 'denied' ? <Notice tone="warning">{de.staff.pushDenied}</Notice> : null}
        {push?.status === 'unavailable' ? <Notice tone="info">{de.staff.pushUnavailable}</Notice> : null}
        <Button label={de.staff.pushRegister} icon="notifications" variant="secondary" loading={pushBusy} onPress={() => void registerPush()} />
      </Card>

      <Button label={de.auth.logout} icon="log-out" variant="danger" onPress={() => void onLogout()} testID="logout" />
      <View style={styles.meta}>
        <AppText variant="caption" center>
          {de.staff.appVersion(env.appVersion, env.appEnv)}
        </AppText>
        <AppText variant="caption" center>
          {de.staff.apiUrl(env.apiUrl)}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  perms: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  perm: { backgroundColor: colors.surfaceMuted, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  meta: { gap: 2 },
});
