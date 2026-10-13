import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { AppText, Button, TextField } from './ui';

/** Cross-platform text prompt (Alert.prompt is iOS-only), used for the staff cancellation reason and problem reports. */
export function ReasonDialog({
  visible,
  title,
  label,
  placeholder,
  confirmLabel,
  loading,
  maxLength = 500,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  loading?: boolean;
  maxLength?: number;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          <TextField label={label} placeholder={placeholder} value={reason} onChangeText={setReason} multiline maxLength={maxLength} autoFocus hint={`${reason.length}/${maxLength}`} />
          <View style={styles.actions}>
            <Button label={de.common.cancel} variant="ghost" onPress={onCancel} style={styles.flex} />
            <Button
              label={confirmLabel}
              variant={confirmVariant}
              loading={loading}
              disabled={reason.trim().length === 0}
              onPress={() => onConfirm(reason.trim())}
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
