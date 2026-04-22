import { NavLink } from 'react-router-dom';
import { cn } from '../ui/cn';
import { MotionSidebarItem } from '../ui/motion';
import {
  IconCalendar,
  IconCircles,
  IconFileText,
  IconGrid,
  IconBell,
  IconMapPin,
  IconSchool,
  IconSettings,
  IconSubscription,
  IconUsers,
} from '../ui/icons';

const nav = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconGrid },
  { to: '/users', label: 'Users', Icon: IconUsers },
  { to: '/subscriptions', label: 'Subscriptions', Icon: IconSubscription },
  { to: '/universities', label: 'Universities', Icon: IconSchool },
  { to: '/timetables', label: 'Timetables', Icon: IconCalendar },
  { to: '/performance', label: 'Performance', Icon: IconBell },
  { to: '/calendar-updates', label: 'Calendar updates', Icon: IconCalendar },
  { to: '/locations', label: 'Locations', Icon: IconMapPin },
  { to: '/circles', label: 'Circles', Icon: IconCircles },
  { to: '/broadcast', label: 'Broadcast', Icon: IconBell },
  { to: '/logs', label: 'Logs', Icon: IconFileText },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="h-full w-[280px] shrink-0 border-r border-slate-200 bg-white/80 px-3 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
      <div className="px-2 pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-elev1">
            G
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black tracking-tight text-slate-900 dark:text-slate-100">
              Rencana Admin
            </div>
            <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">University dashboard</div>
          </div>
        </div>
      </div>

      <nav className="mt-2 flex flex-col gap-1">
        {nav.map((n, i) => (
          <MotionSidebarItem key={n.to} index={i}>
            <NavLink
              to={n.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                  isActive
                    ? 'bg-slate-900 text-white shadow-elev1 dark:bg-white dark:text-slate-950'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900/60',
                )
              }
            >
              <n.Icon className="h-5 w-5 opacity-90" />
              <span className="truncate">{n.label}</span>
            </NavLink>
          </MotionSidebarItem>
        ))}
      </nav>
    </aside>
  );
}

