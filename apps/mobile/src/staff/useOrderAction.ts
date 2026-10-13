import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { adminApi } from '@/api/client';
import { errorMessage, isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { OrderAction, OrderDetailDto } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { infoDialog } from '@/utils/dialogs';

export interface ActionVariables {
  id: string;
  action: OrderAction;
  reason?: string | null;
}

/**
 * Status change mutation for staff. Updates the detail cache, refreshes lists and reports conflicts
 * (e.g. 409 "bereits abgeholt" when a colleague was faster) with the server's German message.
 */
export function useOrderAction(
  options: {
    onSuccess?: (order: OrderDetailDto, vars: ActionVariables) => void;
    onError?: (error: unknown, vars: ActionVariables) => void;
    silent?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: ({ id, action, reason }: ActionVariables) => adminApi.action(id, action, reason),
    onSuccess: (order, vars) => {
      if (tenantId) queryClient.setQueryData(queryKeys.staff.order(tenantId, order.id), order);
      void queryClient.invalidateQueries({ queryKey: ['staff', tenantId, 'orders'] });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      options.onSuccess?.(order, vars);
    },
    onError: (error, vars) => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      if (isApiError(error) && (error.status === 409 || error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
      }
      if (tenantId) void queryClient.invalidateQueries({ queryKey: queryKeys.staff.order(tenantId, vars.id) });
      options.onError?.(error, vars);
      if (!options.silent) infoDialog(errorMessage(error));
    },
  });
}

/** Records a pickup problem (status unchanged); the note appears in the order history. */
export function useReportProblem(options: { onSuccess?: (order: OrderDetailDto) => void } = {}) {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => adminApi.reportProblem(id, note),
    onSuccess: (order) => {
      if (tenantId) queryClient.setQueryData(queryKeys.staff.order(tenantId, order.id), order);
      options.onSuccess?.(order);
    },
    onError: (error) => infoDialog(errorMessage(error)),
  });
}
