import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export interface RecentBakery {
  slug: string;
  name: string;
  city: string | null;
  visitedAt: number;
}

const KEY = 'br.recentBakeries';
const MAX = 8;
const listeners = new Set<() => void>();

export async function listRecentBakeries(): Promise<RecentBakery[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentBakery[]).filter((b) => typeof b.slug === 'string') : [];
  } catch {
    return [];
  }
}

export async function addRecentBakery(entry: Omit<RecentBakery, 'visitedAt'>): Promise<void> {
  const list = (await listRecentBakeries()).filter((b) => b.slug !== entry.slug);
  list.unshift({ ...entry, visitedAt: Date.now() });
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

export async function removeRecentBakery(slug: string): Promise<void> {
  const list = (await listRecentBakeries()).filter((b) => b.slug !== slug);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

export function useRecentBakeries() {
  const [items, setItems] = useState<RecentBakery[]>([]);
  const reload = useCallback(() => {
    void listRecentBakeries().then(setItems);
  }, []);
  useEffect(() => {
    reload();
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);
  return items;
}
