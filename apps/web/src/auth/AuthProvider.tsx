import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { refreshSession, session } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { AuthResponse, LoginRequest, MeDto, MembershipDto } from '@/api/types';
import { safeStorage } from '@/lib/storage';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

const TENANT_KEY = 'br.tenant';

interface AuthContextValue {
  status: AuthStatus;
  me: MeDto | null;
  membership: MembershipDto | null;
  /** Restores the session from the refresh cookie (once). */
  ensureSession: () => Promise<boolean>;
  login: (body: LoginRequest) => Promise<MeDto>;
  /** Applies an AuthResponse obtained elsewhere (e.g. accepting an invitation). */
  applyAuth: (auth: AuthResponse) => void;
  logout: () => Promise<void>;
  selectTenant: (tenantId: string) => void;
  /** True when the session ended because the refresh failed (not by explicit logout). */
  sessionExpired: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveTenant(me: MeDto | null): string | null {
  if (!me || me.memberships.length === 0) return null;
  const stored = safeStorage.get(TENANT_KEY);
  const match = me.memberships.find((m) => m.tenantId === stored);
  return (match ?? me.memberships[0]!).tenantId;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [me, setMe] = useState<MeDto | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const statusRef = useRef<AuthStatus>('idle');
  const explicitLogout = useRef(false);

  const updateStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(
    () =>
      session.subscribe((auth) => {
        if (auth) {
          const tid = resolveTenant(auth.user);
          session.setTenantId(tid);
          setTenantId(tid);
          setMe(auth.user);
          setSessionExpired(false);
          updateStatus('authenticated');
        } else {
          const wasAuthenticated = statusRef.current === 'authenticated';
          session.setTenantId(null);
          setMe(null);
          setTenantId(null);
          if (wasAuthenticated && !explicitLogout.current) setSessionExpired(true);
          explicitLogout.current = false;
          updateStatus('anonymous');
          queryClient.removeQueries({ queryKey: ['admin'] });
          queryClient.removeQueries({ queryKey: ['platform'] });
        }
      }),
    [queryClient, updateStatus],
  );

  const ensureSession = useCallback(async () => {
    if (statusRef.current === 'authenticated') return true;
    if (statusRef.current === 'anonymous') return false;
    updateStatus('loading');
    const auth = await refreshSession();
    if (!auth) updateStatus('anonymous');
    return !!auth;
  }, [updateStatus]);

  const login = useCallback(async (body: LoginRequest) => {
    const auth = await authApi.login(body);
    session.apply(auth);
    return auth.user;
  }, []);

  const applyAuth = useCallback((auth: AuthResponse) => session.apply(auth), []);

  const logout = useCallback(async () => {
    explicitLogout.current = true;
    try {
      await authApi.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    session.apply(null);
    queryClient.clear();
  }, [queryClient]);

  const selectTenant = useCallback(
    (id: string) => {
      safeStorage.set(TENANT_KEY, id);
      session.setTenantId(id);
      setTenantId(id);
      queryClient.removeQueries({ queryKey: ['admin'] });
    },
    [queryClient],
  );

  const membership = useMemo(() => me?.memberships.find((m) => m.tenantId === tenantId) ?? null, [me, tenantId]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, membership, ensureSession, login, applyAuth, logout, selectTenant, sessionExpired }),
    [status, me, membership, ensureSession, login, applyAuth, logout, selectTenant, sessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
