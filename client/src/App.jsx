import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
const Pricing = lazy(() => import('./pages/Pricing.jsx'));
import Login from './pages/auth/Login.jsx';
const Register = lazy(() => import('./pages/auth/Register.jsx'));
const ChangePassword = lazy(() => import('./pages/auth/ChangePassword.jsx'));
import UrlMask from './components/UrlMask.jsx';
import Forbidden from './pages/Forbidden.jsx';
import StudentShell from './layouts/StudentShell.jsx';
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard.jsx'));
const StudentRent = lazy(() => import('./pages/student/StudentRent.jsx'));
const StudentComplaints = lazy(() => import('./pages/student/StudentComplaints.jsx'));
const StudentProfile = lazy(() => import('./pages/student/StudentProfile.jsx'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage.jsx'));
const PropertiesPage = lazy(() => import('./pages/properties/PropertiesPage.jsx'));
const PropertyDetailPage = lazy(() => import('./pages/properties/PropertyDetailPage.jsx'));
const ResidentsPage = lazy(() => import('./pages/residents/ResidentsPage.jsx'));
const ResidentDetailPage = lazy(() => import('./pages/residents/ResidentDetailPage.jsx'));
const RentPage = lazy(() => import('./pages/rent/RentPage.jsx'));
const RefundsPage = lazy(() => import('./pages/refunds/RefundsPage.jsx'));
const ComplaintsPage = lazy(() => import('./pages/complaints/ComplaintsPage.jsx'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage.jsx'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage.jsx'));
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage.jsx'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword.jsx'));
import AppShell from './layouts/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RequirePermission from './components/RequirePermission.jsx';
import ComingSoon from './components/ComingSoon.jsx';
import { ROLE_HOME } from './lib/roles.js';
import { PERMISSIONS as P } from './lib/permissions.js';

// Owners manage inventory and residents; wardens and maintenance see it read-only unless granted permissions.
const INVENTORY_ROLES = ['owner', 'warden', 'maintenance'];

const guard = (any, page) => <RequirePermission any={any}>{page}</RequirePermission>;

export default function App() {
  return (
    <>
    <UrlMask />
    <Suspense fallback={<div className="min-h-screen bg-slate-50" aria-busy="true" />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/forbidden" element={<Forbidden />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePassword />} />
      </Route>

      {INVENTORY_ROLES.map((role) => (
        <Route key={role} element={<ProtectedRoute roles={[role]} />}>
          <Route element={<AppShell />}>
            <Route path={ROLE_HOME[role]} element={role === 'owner' ? <DashboardPage /> : <PropertiesPage />} />
            {role === 'owner' && <Route path={`${ROLE_HOME[role]}/properties`} element={<PropertiesPage />} />}
            {role !== 'maintenance' && <Route path={`${ROLE_HOME[role]}/expenses`} element={guard([P.FINANCES_VIEW], <ExpensesPage />)} />}
            {role !== 'maintenance' && <Route path={`${ROLE_HOME[role]}/reports`} element={guard([P.FINANCES_VIEW, P.REPORTS_VIEW], <ReportsPage />)} />}
            <Route path={`${ROLE_HOME[role]}/properties/:propertyId`} element={<PropertyDetailPage />} />
            {role !== 'maintenance' && <Route path={`${ROLE_HOME[role]}/residents`} element={guard([P.RESIDENTS_VIEW], <ResidentsPage />)} />}
            {role !== 'maintenance' && <Route path={`${ROLE_HOME[role]}/residents/:residentId`} element={guard([P.RESIDENTS_VIEW], <ResidentDetailPage />)} />}
            <Route path={`${ROLE_HOME[role]}/complaints`} element={<ComplaintsPage />} />
            <Route path={`${ROLE_HOME[role]}/notifications`} element={<NotificationsPage />} />
            {role !== 'maintenance' && <Route path={`${ROLE_HOME[role]}/rent`} element={guard([P.PAYMENTS_VIEW], <RentPage />)} />}
            {role !== 'maintenance' && <Route path={`${ROLE_HOME[role]}/refunds`} element={guard([P.PAYMENTS_VIEW], <RefundsPage />)} />}
          </Route>
        </Route>
      ))}

      <Route element={<ProtectedRoute roles={['student']} />}>
        <Route element={<StudentShell />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/rent" element={<StudentRent />} />
          <Route path="/student/complaints" element={<StudentComplaints />} />
          <Route path="/student/notifications" element={<NotificationsPage />} />
          <Route path="/student/profile" element={<StudentProfile />} />
        </Route>
      </Route>

      <Route path="*" element={<ComingSoon title="Not found" />} />
    </Routes>
    </Suspense>
    </>
  );
}
