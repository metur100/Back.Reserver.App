import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { de } from '@/i18n/de';
import { colors, radius, spacing } from '@/theme';
import { AppText, Button, Card, Icon, Notice } from '../ui';

/**
 * QR scanner using expo-camera's barcode scanning. Handles the permission flow with German explanations and always
 * leaves the manual code entry (rendered by the parent) available as a fallback.
 */
export function QrScanner({ onScanned, onClose }: { onScanned: (data: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState(false);
  const handled = useRef(false);

  if (!permission) {
    return (
      <Card>
        <AppText>{de.common.loading}</AppText>
      </Card>
    );
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Card style={styles.gap}>
        <View style={styles.row}>
          <Icon name="camera" size={22} color={colors.accentText} />
          <AppText variant="subheading" style={styles.flex}>
            {de.staff.cameraPermissionTitle}
          </AppText>
        </View>
        <AppText color={colors.textMuted}>{blocked ? de.staff.cameraDenied : de.staff.cameraPermissionText}</AppText>
        {blocked ? (
          <Button label={de.order.openSettings} icon="camera" onPress={() => void Linking.openSettings()} />
        ) : (
          <Button label={de.staff.cameraAllow} icon="camera" onPress={() => void requestPermission()} testID="camera-allow" />
        )}
        <Button label={de.staff.stopScan} variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  if (cameraError) {
    return (
      <Card style={styles.gap}>
        <Notice tone="warning">{de.staff.cameraUnavailable}</Notice>
        <Button label={de.common.close} variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  const onBarcode = (result: BarcodeScanningResult) => {
    if (handled.current || !result.data) return;
    handled.current = true;
    onScanned(result.data);
  };

  return (
    <View style={styles.gap}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcode}
          onMountError={() => setCameraError(true)}
          accessibilityLabel={de.staff.scanHint}
        />
        <View pointerEvents="none" style={styles.frame} />
      </View>
      <AppText variant="caption" center>
        {de.staff.scanHint}
      </AppText>
      <Button label={de.staff.stopScan} icon="close" variant="secondary" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  cameraWrap: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 420,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: '62%', aspectRatio: 1, borderWidth: 3, borderColor: colors.surface, borderRadius: radius.lg },
});
