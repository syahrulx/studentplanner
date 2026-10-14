import { AdminSectionTabs } from '../components/AdminSectionTabs';
import { CalendarUpdatesRoute } from './CalendarUpdatesRoute';
import { CrowdsourcedCalendarsRoute } from './CrowdsourcedCalendarsRoute';

export function AcademicCalendarsRoute() {
  return (
    <AdminSectionTabs
      title="Academic calendars"
      description="Publish official university calendars and review the calendars students send in."
      tabs={[
        { id: 'official', label: 'Official calendars', description: 'Set a university’s semester dates. Students there get them automatically.', content: <CalendarUpdatesRoute /> },
        { id: 'offers', label: 'Existing offers', description: 'Every published calendar offer, grouped by university.', content: <CalendarUpdatesRoute view="offers" /> },
        { id: 'community', label: 'Community submissions', description: 'Review UiTM submissions and calendars students published from the app.', content: <CrowdsourcedCalendarsRoute /> },
      ]}
    />
  );
}
