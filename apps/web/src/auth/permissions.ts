import type { MembershipDto, MembershipRole, Permission } from '@/api/types';

export function hasPermission(membership: MembershipDto | null | undefined, permission: Permission): boolean {
  return !!membership && membership.permissions.includes(permission);
}

export function hasAny(membership: MembershipDto | null | undefined, ...permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(membership, p));
}

/** Mirrors RolePermissions on the server (display only — the server enforces). */
const STAFF_DEFAULT: Permission[] = ['OrdersView', 'OrdersProcess', 'PickupCollect'];
const MANAGER_DEFAULT: Permission[] = [
  ...STAFF_DEFAULT,
  'OrdersCancel',
  'CustomerContactView',
  'ProductsManage',
  'InventoryManage',
  'PickupScheduleManage',
  'ReportsView',
];
const OWNER_ALL: Permission[] = [...MANAGER_DEFAULT, 'LocationsManage', 'StaffManage', 'SettingsManage', 'SubscriptionManage'];

export const ALL_PERMISSIONS: Permission[] = [
  'OrdersView',
  'OrdersProcess',
  'PickupCollect',
  'OrdersCancel',
  'CustomerContactView',
  'ProductsManage',
  'InventoryManage',
  'LocationsManage',
  'PickupScheduleManage',
  'StaffManage',
  'ReportsView',
  'SettingsManage',
  'SubscriptionManage',
];

export function roleCeiling(role: MembershipRole): Permission[] {
  switch (role) {
    case 'Owner':
      return OWNER_ALL;
    case 'Manager':
      return MANAGER_DEFAULT;
    case 'Staff':
      return [...STAFF_DEFAULT, 'OrdersCancel', 'CustomerContactView'];
  }
}

export function roleDefault(role: MembershipRole): Permission[] {
  switch (role) {
    case 'Owner':
      return OWNER_ALL;
    case 'Manager':
      return MANAGER_DEFAULT;
    case 'Staff':
      return STAFF_DEFAULT;
  }
}
