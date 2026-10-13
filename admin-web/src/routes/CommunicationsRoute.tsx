import { AdminSectionTabs } from '../components/AdminSectionTabs';
import { BroadcastRoute } from './BroadcastRoute';
import { WhatsNewRoute } from './WhatsNewRoute';

export function CommunicationsRoute() {
  return (
    <AdminSectionTabs
      title="Communications"
      description="Send push notifications and manage the in-app release note."
      tabs={[
        {
          id: 'broadcasts',
          label: 'Broadcasts',
          description: 'Send a push notification to a chosen audience. Each user’s push opt-in and category settings are respected.',
          content: <BroadcastRoute />,
        },
        {
          id: 'whats-new',
          label: "What's new",
          description: 'The release note shown when users open the app. Only one can be active at a time.',
          content: <WhatsNewRoute />,
        },
      ]}
    />
  );
}
