import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listNotifications } from '../../services/me.js';
import Icon from '../Icon.jsx';

// Unread count comes from the API; it refreshes every minute and whenever notifications are read.
export default function NotificationBell({ to }) {
  const { data } = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: () => listNotifications({ limit: 1 }), refetchInterval: 60_000 });
  const unread = data?.unreadCount ?? 0;
  return (
    <Link to={to} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
      <Icon name="bell" />
      {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-onaccent">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
