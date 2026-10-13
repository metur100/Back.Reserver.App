import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PublicProductDto } from '@/api/types';
import { de } from '@/i18n/de';
import { colors, spacing } from '@/theme';
import { formatMoney } from '@/utils/format';
import { AvailabilityBadge } from './Badges';
import { ProductImage } from './ProductImage';
import { QuantityStepper } from './QuantityStepper';
import { AppText, Card } from './ui';

export interface ProductRowProps {
  product: PublicProductDto;
  quantity: number;
  onChangeQuantity: (product: PublicProductDto, quantity: number) => void;
  disabled?: boolean;
}

export const ProductRow = memo(function ProductRow({ product, quantity, onChangeQuantity, disabled }: ProductRowProps) {
  const soldOut = product.availability === 'SoldOut' || product.remaining <= 0;
  const max = Math.min(product.remaining, 200);
  return (
    <Card style={styles.card} testID={`product-${product.slug}`}>
      <View style={styles.top}>
        <ProductImage url={product.imageUrl} label={product.name} />
        <View style={styles.info}>
          <AppText variant="subheading">{product.name}</AppText>
          {product.description ? (
            <AppText variant="caption" numberOfLines={3}>
              {product.description}
            </AppText>
          ) : null}
          <View style={styles.badges}>
            <AvailabilityBadge availability={product.availability} remaining={product.remaining} />
            {product.dietaryLabels.map((label) => (
              <View key={label} style={styles.label}>
                <AppText variant="caption" color={colors.success}>
                  {label}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {de.bakery.allergens}: {product.allergens?.trim() ? product.allergens : de.bakery.allergensNone}
      </AppText>
      <View style={styles.bottom}>
        <AppText variant="heading" accessibilityLabel={`Preis ${formatMoney(product.price, product.currency)}`}>
          {formatMoney(product.price, product.currency)}
        </AppText>
        <QuantityStepper
          testID={`stepper-${product.slug}`}
          name={product.name}
          value={quantity}
          max={soldOut ? Math.min(quantity, 0) : max}
          onChange={(q) => onChangeQuantity(product, q)}
          disabled={disabled || (soldOut && quantity === 0)}
        />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: 'row', gap: spacing.md },
  info: { flex: 1, gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  label: { borderWidth: 1, borderColor: colors.successSoft, borderRadius: 999, paddingHorizontal: spacing.sm },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
