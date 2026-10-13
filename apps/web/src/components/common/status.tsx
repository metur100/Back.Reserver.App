import { Ban, CheckCheck, CircleCheck, CircleDashed, ChefHat, PackageCheck, UserX, CircleAlert, CircleX } from 'lucide-react';
import type { AvailabilityStatus, OrderStatus } from '@/api/types';
import { Badge, type BadgeProps } from '@/components/ui/surface';
import { t } from '@/i18n';
import { orderStatusLabel, orderStatusTone } from '@/lib/orderStatus';
import { cn } from '@/lib/utils';

const statusIcons: Record<OrderStatus, typeof CircleCheck> = {
  Confirmed: CircleCheck,
  Preparing: ChefHat,
  ReadyForPickup: PackageCheck,
  Collected: CheckCheck,
  Cancelled: Ban,
  NoShow: UserX,
};

/** Order status with icon + text (never colour alone). */
export function OrderStatusBadge({ status, size = 'sm', className }: { status: OrderStatus; size?: BadgeProps['size']; className?: string }) {
  const Icon = statusIcons[status] ?? CircleDashed;
  return (
    <Badge tone={orderStatusTone(status)} size={size} className={className} data-status={status}>
      <Icon aria-hidden="true" />
      {orderStatusLabel(status)}
    </Badge>
  );
}

/** Product availability with icon + text. */
export function AvailabilityBadge({ availability, remaining, className }: { availability: AvailabilityStatus; remaining: number; className?: string }) {
  if (availability === 'SoldOut' || remaining <= 0) {
    return (
      <Badge tone="neutral" className={cn('text-muted-foreground', className)}>
        <CircleX aria-hidden="true" />
        {t('availability.SoldOut')}
      </Badge>
    );
  }
  if (availability === 'Low') {
    return (
      <Badge tone="warning" className={className}>
        <CircleAlert aria-hidden="true" />
        {t('availability.Low', { count: remaining })}
      </Badge>
    );
  }
  return (
    <Badge tone="success" className={className}>
      <CircleCheck aria-hidden="true" />
      {t('availability.Available')}
    </Badge>
  );
}
