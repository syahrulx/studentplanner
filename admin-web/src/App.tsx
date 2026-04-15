import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginRoute } from './routes/LoginRoute';
import { AdminLayout } from './routes/AdminLayout';
import { DashboardRoute } from './routes/DashboardRoute';
import { UsersRoute } from './routes/UsersRoute';
import { UniversitiesRoute } from './routes/UniversitiesRoute';
import { TimetablesRoute } from './routes/TimetablesRoute';
import { CalendarUpdatesRoute } from './routes/CalendarUpdatesRoute';
import { LogsRoute } from './routes/LogsRoute';
import { LocationsRoute } from './routes/LocationsRoute';
import { CirclesRoute } from './routes/CirclesRoute';
import { SubscriptionsRoute } from './routes/SubscriptionsRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { StudentPerformanceRoute } from './routes/StudentPerformanceRoute';
import { AuthProvider } from './state/AuthProvider';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Keep /login reachable even when bypass is on so you can sign in and satisfy RLS. */}
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRoute />} />
            <Route path="users" element={<UsersRoute />} />
            <Route path="subscriptions" element={<SubscriptionsRoute />} />
            <Route path="universities" element={<UniversitiesRoute />} />
            <Route path="timetables" element={<TimetablesRoute />} />
            <Route path="performance" element={<StudentPerformanceRoute />} />
            <Route path="calendar-updates" element={<CalendarUpdatesRoute />} />
            <Route path="locations" element={<LocationsRoute />} />
            <Route path="circles" element={<CirclesRoute />} />
            <Route path="logs" element={<LogsRoute />} />
            <Route path="settings" element={<SettingsRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
