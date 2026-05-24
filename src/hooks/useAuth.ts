import { useAuthContext } from '../context/AuthContext';
import type { UserRole } from '../types';

export function useAuth() {
  const {
    user,
    profile,
    isLoading,
    isAuthenticated,
    isInitialized,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile,
    forgotPassword,
    resetPassword,
  } = useAuthContext();

  const isRole = (role: UserRole | UserRole[]) => {
    if (!profile) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(profile.role);
  };

  const isAdmin = isRole('super_admin');
  const isFaculty = isRole('faculty');
  const isStudent = isRole('student');

  const canManageQuestions = isAdmin;
  const canGeneratePapers = isFaculty || isAdmin;
  const canCreateTests = isFaculty || isAdmin;
  const canViewAllUsers = isAdmin;
  const canApproveQuestions = isAdmin;

  return {
    user,
    profile,
    isLoading,
    isAuthenticated,
    isInitialized,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile,
    forgotPassword,
    resetPassword,
    isRole,
    isAdmin,
    isFaculty,
    isStudent,
    canManageQuestions,
    canGeneratePapers,
    canCreateTests,
    canViewAllUsers,
    canApproveQuestions,
  };
}
