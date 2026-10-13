import { AdminSectionTabs } from '../components/AdminSectionTabs';
import { UniversitiesRoute } from './UniversitiesRoute';
import { CampusesRoute } from './CampusesRoute';
import { OrganizationsRoute } from './OrganizationsRoute';
import { AuthorityRoute } from './AuthorityRoute';

export function InstitutionsRoute() {
  return (
    <AdminSectionTabs
      title="Institutions"
      description="Manage universities and their related campus, organisation and authority records together."
      tabs={[
        { id: 'universities', label: 'Universities', description: 'University records, timetable endpoints and data mappings.', content: <UniversitiesRoute /> },
        { id: 'campuses', label: 'Campuses', description: 'Campuses under each university, used by the community.', content: <CampusesRoute /> },
        { id: 'organisations', label: 'Organisations', description: 'Clubs and organisations, per university or campus.', content: <OrganizationsRoute /> },
        { id: 'authorities', label: 'Authorities', description: 'Authority role requests. Approved users can post official memos.', content: <AuthorityRoute /> },
      ]}
    />
  );
}
