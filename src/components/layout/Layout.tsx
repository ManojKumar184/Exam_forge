import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui';
import {
  LayoutDashboard,
  FileQuestion,
  FileText,
  Users,
  Upload,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  GraduationCap,
} from 'lucide-react';

interface SidebarItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  roles: ('super_admin' | 'faculty' | 'student')[];
}

const sidebarItems: SidebarItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['super_admin', 'faculty', 'student'] },
  { name: 'Question Bank', path: '/questions', icon: <FileQuestion className="w-5 h-5" />, roles: ['super_admin'] },
  { name: 'Moderation Queue', path: '/questions/moderation', icon: <FileQuestion className="w-5 h-5" />, roles: ['super_admin'] },
  { name: 'Create Question', path: '/questions/new', icon: <FileQuestion className="w-5 h-5" />, roles: ['super_admin', 'faculty'] },
  { name: 'Upload Questions', path: '/upload', icon: <Upload className="w-5 h-5" />, roles: ['super_admin'] },
  { name: 'Generate Paper', path: '/papers/new', icon: <FileText className="w-5 h-5" />, roles: ['super_admin', 'faculty'] },
  { name: 'My Papers', path: '/papers', icon: <FileText className="w-5 h-5" />, roles: ['super_admin', 'faculty'] },
  { name: 'Online Tests', path: '/tests', icon: <FileText className="w-5 h-5" />, roles: ['super_admin', 'faculty', 'student'] },
  { name: 'Leaderboard', path: '/leaderboard', icon: <BarChart3 className="w-5 h-5" />, roles: ['super_admin', 'faculty', 'student'] },
  { name: 'Users', path: '/users', icon: <Users className="w-5 h-5" />, roles: ['super_admin'] },
  { name: 'Analytics', path: '/analytics', icon: <BarChart3 className="w-5 h-5" />, roles: ['super_admin', 'faculty'] },
  { name: 'Settings', path: '/settings', icon: <Settings className="w-5 h-5" />, roles: ['super_admin', 'faculty', 'student'] },
];

export function Layout() {
  const { profile, signOut, isAdmin, isFaculty } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const filteredItems = sidebarItems.filter((item) =>
    item.roles.includes(profile?.role || 'student')
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getRoleLabel = () => {
    if (isAdmin) return 'Administrator';
    if (isFaculty) return 'Faculty';
    return 'Student';
  };

  return (
    <div className="flex h-dvh min-h-0 bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-0 lg:h-full
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-button">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">ExamForge</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">AI-Powered Platform</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {filteredItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 border-l-[3px] border-primary-600 -ml-px'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
                      }`
                    }
                  >
                    {item.icon}
                    {item.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* User section */}
          <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-sm font-semibold">
                {profile?.full_name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {profile?.full_name || 'User'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{getRoleLabel()}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full mt-2 justify-start text-slate-600 dark:text-slate-400"
              leftIcon={<LogOut className="w-4 h-4" />}
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <header className="shrink-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 lg:hidden transition-colors"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {profile?.full_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {profile?.email}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
