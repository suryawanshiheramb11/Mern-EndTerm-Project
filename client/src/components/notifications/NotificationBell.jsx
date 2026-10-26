import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listNotifications } from '../../services/me.js';

// Unread count comes from the API; it refreshes every minute and whenever notifications are read.
export default function NotificationBell({ to }) {
  const { data } = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: () => listNotifications({ limit: 1 }), refetchInterval: 60_000 });
  const unread = data?.unreadCount ?? 0;
  return (
    <Link to={to} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-50">
      🔔
      {unread > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs font-medium text-white">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
