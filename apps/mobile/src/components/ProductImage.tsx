import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { resolveMediaUrl } from '@/config/env';
import { de } from '@/i18n/de';
import { colors, radius } from '@/theme';
import { Icon } from './ui';

/**
 * Product image via expo-image (supports the SVG demo images on iOS/Android). Relative API paths are prefixed with
 * the API base URL. Falls back to a neutral placeholder when there is no image or it fails to load.
 */
export function ProductImage({ url, size = 84, label }: { url: string | null; size?: number; label: string }) {
  const [failed, setFailed] = useState(false);
  const source = resolveMediaUrl(url);
  if (!source || failed) {
    return (
      <View style={[styles.placeholder, { width: size, height: size }]} accessibilityLabel={de.product.imageMissing} accessible>
        <Icon name="cafe" size={size * 0.38} color={colors.borderStrong} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: source }}
      style={[styles.image, { width: size, height: size }]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={label}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  placeholder: { borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});
