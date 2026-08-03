import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginRoute } from './routes/LoginRoute';
import { AdminLayout } from './routes/AdminLayout';
import { DashboardRoute } from './routes/DashboardRoute';
import { UsersRoute } from './routes/UsersRoute';
import { TimetablesRoute } from './routes/TimetablesRoute';
import { LogsRoute } from './routes/LogsRoute';
import { LocationsRoute } from './routes/LocationsRoute';
import { CirclesRoute } from './routes/CirclesRoute';
import { EventsRoute } from './routes/EventsRoute';
import { SubscriptionsRoute } from './routes/SubscriptionsRoute';
import { TaskCategoriesRoute } from './routes/TaskCategoriesRoute';
import { StudentPerformanceRoute } from './routes/StudentPerformanceRoute';
import { ServicesRoute } from './routes/ServicesRoute';
import { UserReportsRoute } from './routes/UserReportsRoute';
import { MinigamesRoute } from './routes/MinigamesRoute';
import { AcademicCalendarsRoute } from './routes/AcademicCalendarsRoute';
import { CommunicationsRoute } from './routes/CommunicationsRoute';
import { InstitutionsRoute } from './routes/InstitutionsRoute';
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
            <Route path="institutions" element={<InstitutionsRoute />} />
            <Route path="universities" element={<Navigate to="/institutions" replace />} />
            <Route path="timetables" element={<TimetablesRoute />} />
            <Route path="performance" element={<StudentPerformanceRoute />} />
            <Route path="academic-calendars" element={<AcademicCalendarsRoute />} />
            <Route path="calendar-updates" element={<Navigate to="/academic-calendars" replace />} />
            <Route path="crowdsourced-calendars" element={<Navigate to="/academic-calendars?tab=community" replace />} />
            <Route path="locations" element={<LocationsRoute />} />
            <Route path="circles" element={<CirclesRoute />} />
            <Route path="events" element={<EventsRoute />} />
            <Route path="authorities" element={<Navigate to="/institutions?tab=authorities" replace />} />
            <Route path="services" element={<ServicesRoute />} />
            <Route path="campuses" element={<Navigate to="/institutions?tab=campuses" replace />} />
            <Route path="organizations" element={<Navigate to="/institutions?tab=organisations" replace />} />
            <Route path="communications" element={<CommunicationsRoute />} />
            <Route path="broadcast" element={<Navigate to="/communications" replace />} />
            <Route path="logs" element={<LogsRoute />} />
            <Route path="task-categories" element={<TaskCategoriesRoute />} />
            <Route path="user-reports" element={<UserReportsRoute />} />
            <Route path="whats-new" element={<Navigate to="/communications?tab=whats-new" replace />} />
            <Route path="minigames" element={<MinigamesRoute />} />
            <Route path="settings" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
