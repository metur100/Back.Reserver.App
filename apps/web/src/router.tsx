import type { ComponentType } from 'react';
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { FullPageLoading, RequireAuth, RequirePermission } from '@/auth/guards';
import { NotFoundPage, RouteErrorPage } from '@/components/common/pages';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { BakeryPage } from '@/features/public/BakeryPage';
import { CheckoutPage } from '@/features/public/CheckoutPage';
import { LandingPage } from '@/features/public/LandingPage';
import { PrivacyPage, TermsPage } from '@/features/public/LegalPages';
import { MyOrdersPage } from '@/features/public/MyOrdersPage';
import { PublicLayout } from '@/features/public/PublicLayout';

const lazyPage = (loader: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await loader()).default });

// Auth pages and the admin shell are split out of the main bundle so customers on phones only download the ordering UI.
const authPage = (name: 'LoginPage' | 'RegisterPage' | 'ConfirmEmailPage' | 'ForgotPasswordPage' | 'ResetPasswordPage' | 'InvitationPage') =>
  async () => ({ Component: (await import('@/features/auth/AuthPages'))[name] });

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullPageLoading />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <LandingPage /> },
          { path: 'datenschutz', element: <PrivacyPage /> },
          { path: 'agb', element: <TermsPage /> },
          { path: 'meine-bestellungen', element: <MyOrdersPage /> },
          // Lazy: pulls in the QR code library only when an order is shown.
          { path: 'bestellung/:reference', lazy: async () => ({ Component: (await import('@/features/public/OrderPage')).OrderPage }) },
        ],
      },
      { path: 'b/:slug', element: <BakeryPage /> },
      { path: 'b/:slug/checkout', element: <CheckoutPage /> },
      {
        element: <AuthLayout />,
        children: [
          { path: 'login', lazy: authPage('LoginPage') },
          { path: 'registrieren', lazy: authPage('RegisterPage') },
          { path: 'email-bestaetigen', lazy: authPage('ConfirmEmailPage') },
          { path: 'passwort-vergessen', lazy: authPage('ForgotPasswordPage') },
          { path: 'passwort-zuruecksetzen', lazy: authPage('ResetPasswordPage') },
          { path: 'einladung', lazy: authPage('InvitationPage') },
        ],
      },
      {
        path: 'admin',
        element: (
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        ),
        children: [
          {
            lazy: async () => ({ Component: (await import('@/features/admin/AdminLayout')).AdminRoot }),
            children: [
          {
            element: (
              <RequirePermission any={['OrdersView']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, lazy: lazyPage(() => import('@/features/admin/DashboardPage')) },
              { path: 'bestellungen', lazy: lazyPage(() => import('@/features/admin/orders/OrdersPage')) },
              { path: 'bestellungen/:orderId', lazy: lazyPage(() => import('@/features/admin/orders/OrderDetailPage')) },
              { path: 'abholung', lazy: lazyPage(() => import('@/features/admin/orders/PickupPage')) },
            ],
          },
          {
            path: 'produkte',
            element: (
              <RequirePermission any={['ProductsManage']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ index: true, lazy: lazyPage(() => import('@/features/admin/products/ProductsPage')) }],
          },
          {
            path: 'produktion',
            element: (
              <RequirePermission any={['InventoryManage', 'OrdersView']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ index: true, lazy: lazyPage(() => import('@/features/admin/production/ProductionPage')) }],
          },
          {
            path: 'standorte',
            element: (
              <RequirePermission any={['LocationsManage', 'PickupScheduleManage']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ index: true, lazy: lazyPage(() => import('@/features/admin/locations/LocationsPage')) }],
          },
          {
            path: 'mitarbeiter',
            element: (
              <RequirePermission any={['StaffManage']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ index: true, lazy: lazyPage(() => import('@/features/admin/staff/StaffPage')) }],
          },
          {
            path: 'auswertungen',
            element: (
              <RequirePermission any={['ReportsView']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ index: true, lazy: lazyPage(() => import('@/features/admin/reports/ReportsPage')) }],
          },
          {
            path: 'einstellungen',
            element: (
              <RequirePermission any={['SettingsManage', 'SubscriptionManage']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ index: true, lazy: lazyPage(() => import('@/features/admin/settings/SettingsPage')) }],
          },
          { path: '*', element: <NotFoundPage homeHref="/admin" /> },
            ],
          },
        ],
      },
      {
        path: 'platform',
        element: (
          <RequireAuth platform>
            <Outlet />
          </RequireAuth>
        ),
        children: [{ index: true, lazy: lazyPage(() => import('@/features/platform/PlatformPage')) }],
      },
      {
        element: <PublicLayout />,
        children: [{ path: '*', element: <NotFoundPage /> }],
      },
    ],
  },
];

/** "/" locally; "/Back.Reserver.App/" on GitHub Pages (set via VITE_BASE_PATH at build time). */
export const routerBasename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

export const createRouter = () => createBrowserRouter(routes, { basename: routerBasename });
