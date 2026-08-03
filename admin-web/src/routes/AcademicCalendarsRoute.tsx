import { AdminSectionTabs } from '../components/AdminSectionTabs';
import { CalendarUpdatesRoute } from './CalendarUpdatesRoute';
import { CrowdsourcedCalendarsRoute } from './CrowdsourcedCalendarsRoute';

export function AcademicCalendarsRoute() {
  return (
    <AdminSectionTabs
      title="Academic Calendars"
      description="Publish official calendars and review community contributions in one place. Existing calendar data is unchanged."
      tabs={[
        { id: 'official', label: 'Official calendars', description: 'University calendars published by the team.', content: <CalendarUpdatesRoute /> },
        { id: 'community', label: 'Community submissions', description: 'Crowdsourced and UiTM calendar review.', content: <CrowdsourcedCalendarsRoute /> },
      ]}
    />
  );
}
