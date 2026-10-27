import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Pricing from './pages/Pricing.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ChangePassword from './pages/auth/ChangePassword.jsx';
import UrlMask from './components/UrlMask.jsx';
import Forbidden from './pages/Forbidden.jsx';
import StudentShell from './layouts/StudentShell.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import StudentRent from './pages/student/StudentRent.jsx';
import StudentComplaints from './pages/student/StudentComplaints.jsx';
import StudentProfile from './pages/student/StudentProfile.jsx';
import NotificationsPage from './pages/notifications/NotificationsPage.jsx';
import PropertiesPage from './pages/properties/PropertiesPage.jsx';
import PropertyDetailPage from './pages/properties/PropertyDetailPage.jsx';
import ResidentsPage from './pages/residents/ResidentsPage.jsx';
import ResidentDetailPage from './pages/residents/ResidentDetailPage.jsx';
import RentPage from './pages/rent/RentPage.jsx';
import RefundsPage from './pages/refunds/RefundsPage.jsx';
import ComplaintsPage from './pages/complaints/ComplaintsPage.jsx';
import DashboardPage from './pages/dashboard/DashboardPage.jsx';
import ReportsPage from './pages/reports/ReportsPage.jsx';
import ExpensesPage from './pages/expenses/ExpensesPage.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
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
            <Route path={`${ROLE_HOME[role]}/residents`} element={guard([P.RESIDENTS_VIEW], <ResidentsPage />)} />
            <Route path={`${ROLE_HOME[role]}/residents/:residentId`} element={guard([P.RESIDENTS_VIEW], <ResidentDetailPage />)} />
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
    </>
  );
}
