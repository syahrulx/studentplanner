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
        { id: 'universities', label: 'Universities', description: '', content: <UniversitiesRoute /> },
        { id: 'campuses', label: 'Campuses', description: '', content: <CampusesRoute /> },
        { id: 'organisations', label: 'Organisations', description: '', content: <OrganizationsRoute /> },
        { id: 'authorities', label: 'Authorities', description: '', content: <AuthorityRoute /> },
      ]}
    />
  );
}
