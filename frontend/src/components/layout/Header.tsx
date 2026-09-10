import type { AuthUser } from '../../api';
import { Button } from '../ui/Button';

type HeaderProps = { user: AuthUser; onLogout: () => void; onCompose: () => void };

export function Header({ user, onLogout, onCompose }: HeaderProps) {
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {user.image ? <img src={user.image} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">{user.email[0]?.toUpperCase()}</div>}
        <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{user.name ?? 'ReachInbox user'}</p><p className="truncate text-sm text-slate-500">{user.email}</p></div>
      </div>
      <div className="flex items-center gap-2"><Button onClick={onCompose}>Compose New Email</Button><Button variant="ghost" onClick={onLogout}>Logout</Button></div>
    </div>
  </header>;
}
