import { AdminSectionTabs } from '../components/AdminSectionTabs';
import { BroadcastRoute } from './BroadcastRoute';
import { WhatsNewRoute } from './WhatsNewRoute';

export function CommunicationsRoute() {
  return (
    <AdminSectionTabs
      title="Communications"
      description="Send broadcasts and manage in-app release notes without switching between separate sections."
      tabs={[
        { id: 'broadcasts', label: 'Broadcasts', description: 'Send a notification to a selected audience.', content: <BroadcastRoute /> },
        { id: 'whats-new', label: "What's new", description: 'Manage the release note shown when users open the app.', content: <WhatsNewRoute /> },
      ]}
    />
  );
}
