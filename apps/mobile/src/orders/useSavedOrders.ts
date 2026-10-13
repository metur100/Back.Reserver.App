import { useCallback, useEffect, useState } from 'react';
import { listSavedOrders, subscribeSavedOrders, type SavedOrder } from './savedOrders';

export function useSavedOrders() {
  const [orders, setOrders] = useState<SavedOrder[] | null>(null);
  const reload = useCallback(() => {
    void listSavedOrders().then(setOrders);
  }, []);
  useEffect(() => {
    reload();
    return subscribeSavedOrders(reload);
  }, [reload]);
  return { orders, loading: orders === null, reload };
}
