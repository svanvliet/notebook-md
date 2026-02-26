import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { AdminUser } from '../hooks/useAdmin';

type NavItem =
  | { to: string; label: string; icon: string }
  | { label: string; icon: string; children: { to: string; label: string; icon: string }[] };

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/users', label: 'Users', icon: '👤' },
  {
    label: 'Feature Management',
    icon: '⚙️',
    children: [
      { to: '/feature-flags', label: 'Flags', icon: '🚩' },
      { to: '/flights', label: 'Flights', icon: '✈️' },
      { to: '/groups', label: 'Groups', icon: '👥' },
    ],
  },
  { to: '/announcements', label: 'Announcements', icon: '📢' },
  { to: '/audit-log', label: 'Audit Log', icon: '📋' },
];

export default function Layout({
  user,
  onSignOut,
}: {
  user: AdminUser;
  onSignOut: () => void;
}) {
  const location = useLocation();
  const featureMgmtPaths = ['/feature-flags', '/flights', '/groups'];
  const childActive = featureMgmtPaths.some((p) => location.pathname.startsWith(p));
  const [expanded, setExpanded] = useState(childActive);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-gray-300 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-700">
          <h1 className="text-white font-semibold text-lg">📓 Admin</h1>
          <p className="text-xs text-gray-500 mt-0.5">Notebook.md</p>
        </div>

        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            if ('to' in item) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-800 ${
                      isActive ? 'bg-gray-800 text-white' : ''
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              );
            }

            return (
              <div key={item.label}>
                <button
                  onClick={() => setExpanded((prev) => !prev)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-800 ${
                    childActive ? 'text-white' : ''
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  <span className="ml-auto text-xs">{expanded ? '▾' : '▸'}</span>
                </button>
                {expanded && (
                  <div>
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          `flex items-center gap-2 pl-8 pr-4 py-1.5 text-sm hover:bg-gray-800 ${
                            isActive ? 'bg-gray-800 text-white' : ''
                          }`
                        }
                      >
                        <span>{child.icon}</span>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-gray-700 px-4 py-3">
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
          <button
            onClick={onSignOut}
            className="text-xs text-red-400 hover:text-red-300 mt-1"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
        <Outlet />
      </main>
    </div>
  );
}
