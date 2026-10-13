import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authSession, onSessionExpired, setCurrentTenantId } from '@/api/client';
import type { MeDto, MembershipDto, Permission } from '@/api/types';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: Status;
  user: MeDto | null;
  /** Memberships the user can work in (active tenants first). */
  memberships: MembershipDto[];
  membership: MembershipDto | null;
  tenantId: string | null;
  locationId: string | null;
  sessionExpired: boolean;
  login(email: string, password: string): Promise<MeDto>;
  logout(): Promise<void>;
  selectTenant(tenantId: string | null): void;
  setLocationId(locationId: string | null): void;
  can(permission: Permission): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TENANT_KEY = 'br.staff.tenantId';
const locationKey = (tenantId: string) => `br.staff.location.${tenantId}`;

function pickDefaultTenant(user: MeDto, stored: string | null): string | null {
  if (stored && user.memberships.some((m) => m.tenantId === stored)) return stored;
  return user.memberships.length === 1 ? user.memberships[0]!.tenantId : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<MeDto | null>(null);
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [locationId, setLocationIdState] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const mounted = useRef(true);

  const applyTenant = useCallback(async (id: string | null) => {
    setCurrentTenantId(id);
    setTenantIdState(id);
    try {
      if (id) {
        await AsyncStorage.setItem(TENANT_KEY, id);
        setLocationIdState(await AsyncStorage.getItem(locationKey(id)));
      } else {
        await AsyncStorage.removeItem(TENANT_KEY);
        setLocationIdState(null);
      }
    } catch {
      setLocationIdState(null);
    }
  }, []);

  const signIn = useCallback(
    async (me: MeDto) => {
      const stored = await AsyncStorage.getItem(TENANT_KEY).catch(() => null);
      await applyTenant(pickDefaultTenant(me, stored));
      setUser(me);
      setSessionExpired(false);
      setStatus('signedIn');
    },
    [applyTenant],
  );

  const reset = useCallback(() => {
    setCurrentTenantId(null);
    setUser(null);
    setTenantIdState(null);
    setLocationIdState(null);
    setStatus('signedOut');
    queryClient.removeQueries({ queryKey: ['staff'] });
  }, [queryClient]);

  useEffect(() => {
    mounted.current = true;
    onSessionExpired(() => {
      if (!mounted.current) return;
      setSessionExpired(true);
      reset();
    });
    authSession
      .restore()
      .then((me) => (me ? signIn(me) : setStatus('signedOut')))
      .catch(() => setStatus('signedOut')); // offline at start: staff can retry by signing in
    return () => {
      mounted.current = false;
      onSessionExpired(null);
    };
  }, [reset, signIn]);

  const login = useCallback(
    async (email: string, password: string) => {
      const me = await authSession.login(email, password);
      await signIn(me);
      return me;
    },
    [signIn],
  );

  const logout = useCallback(async () => {
    await authSession.logout();
    setSessionExpired(false);
    reset();
  }, [reset]);

  const selectTenant = useCallback(
    (id: string | null) => {
      queryClient.removeQueries({ queryKey: ['staff'] });
      void applyTenant(id);
    },
    [applyTenant, queryClient],
  );

  const setLocationId = useCallback(
    (id: string | null) => {
      setLocationIdState(id);
      if (!tenantId) return;
      const key = locationKey(tenantId);
      void (id ? AsyncStorage.setItem(key, id) : AsyncStorage.removeItem(key)).catch(() => undefined);
    },
    [tenantId],
  );

  const value = useMemo<AuthContextValue>(() => {
    const memberships = user?.memberships ?? [];
    const membership = memberships.find((m) => m.tenantId === tenantId) ?? null;
    return {
      status,
      user,
      memberships,
      membership,
      tenantId,
      locationId,
      sessionExpired,
      login,
      logout,
      selectTenant,
      setLocationId,
      can: (permission) => !!membership?.permissions.includes(permission),
    };
  }, [status, user, tenantId, locationId, sessionExpired, login, logout, selectTenant, setLocationId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
