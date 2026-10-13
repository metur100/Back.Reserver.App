import type { OrderAction, OrderStatus, Permission } from '@/api/types';

/**
 * Next "one-tap" action for an order on the "Heute" list, mirroring OrderMapping.AllowedActions on the server
 * filtered by the user's permissions: Vorbereiten → Bereit → Abgeholt.
 */
export function primaryActionFor(status: OrderStatus, can: (p: Permission) => boolean): OrderAction | null {
  switch (status) {
    case 'Confirmed':
      if (can('OrdersProcess')) return 'prepare';
      return can('PickupCollect') ? 'collect' : null;
    case 'Preparing':
      if (can('OrdersProcess')) return 'ready';
      return can('PickupCollect') ? 'collect' : null;
    case 'ReadyForPickup':
      return can('PickupCollect') ? 'collect' : null;
    default:
      return null;
  }
}

/** Statuses that still need work today ("Offen"). */
export const OPEN_STATUSES: OrderStatus[] = ['Confirmed', 'Preparing', 'ReadyForPickup'];

export function canReportProblem(can: (p: Permission) => boolean): boolean {
  return can('PickupCollect') || can('OrdersProcess');
}
