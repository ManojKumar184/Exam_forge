import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Loading } from '../../components/ui';
import { AdminDashboard } from './AdminDashboard';
import { FacultyDashboard } from './FacultyDashboard';
import { StudentDashboard } from './StudentDashboard';

export function DashboardRouter() {
  const { profile, isAdmin, isFaculty, isInitialized } = useAuth();

  if (!isInitialized) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (isFaculty) {
    return <FacultyDashboard />;
  }

  return <StudentDashboard />;
}

export { AdminDashboard } from './AdminDashboard';
export { FacultyDashboard } from './FacultyDashboard';
export { StudentDashboard } from './StudentDashboard';
