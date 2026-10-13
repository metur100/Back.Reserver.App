import type { OrderAction, OrderStatus } from '@/api/types';
import { t } from '@/i18n';

export const ORDER_STATUSES: OrderStatus[] = ['Confirmed', 'Preparing', 'ReadyForPickup', 'Collected', 'Cancelled', 'NoShow'];

export function orderStatusLabel(status: OrderStatus): string {
  return t(`status.${status}`);
}

export type StatusTone = 'info' | 'warning' | 'success' | 'neutral' | 'danger';

export function orderStatusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case 'Confirmed':
      return 'info';
    case 'Preparing':
      return 'warning';
    case 'ReadyForPickup':
      return 'success';
    case 'Collected':
      return 'neutral';
    case 'Cancelled':
    case 'NoShow':
      return 'danger';
  }
}

export function isActiveStatus(status: OrderStatus) {
  return status === 'Confirmed' || status === 'Preparing' || status === 'ReadyForPickup';
}

/** Mirrors OrderMapping.AllowedActions (list items don't carry allowedActions). */
export function actionsForStatus(status: OrderStatus): OrderAction[] {
  switch (status) {
    case 'Confirmed':
      return ['prepare', 'ready', 'collect', 'cancel', 'no-show'];
    case 'Preparing':
      return ['ready', 'collect', 'cancel', 'no-show'];
    case 'ReadyForPickup':
      return ['collect', 'cancel', 'no-show'];
    default:
      return [];
  }
}

/** The usual next step for one-tap operational buttons: prepare → ready → collect. */
export function primaryAction(status: OrderStatus, allowed: readonly OrderAction[] = actionsForStatus(status)): OrderAction | null {
  const sequence: OrderAction[] =
    status === 'Confirmed' ? ['prepare', 'ready', 'collect'] : status === 'Preparing' ? ['ready', 'collect'] : status === 'ReadyForPickup' ? ['collect'] : [];
  return sequence.find((a) => allowed.includes(a)) ?? null;
}

export function orderActionLabel(action: OrderAction): string {
  switch (action) {
    case 'prepare':
      return t('admin.orders.actionPrepare');
    case 'ready':
      return t('admin.orders.actionReady');
    case 'collect':
      return t('admin.orders.actionCollect');
    case 'cancel':
      return t('admin.orders.actionCancel');
    case 'no-show':
      return t('admin.orders.actionNoShow');
  }
}

export function orderActionShortLabel(action: OrderAction): string {
  switch (action) {
    case 'prepare':
      return t('admin.orders.prepare');
    case 'ready':
      return t('admin.orders.ready');
    case 'collect':
      return t('admin.orders.collect');
    default:
      return orderActionLabel(action);
  }
}
