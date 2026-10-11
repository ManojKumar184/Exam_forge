import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getActiveInstitutionId, setActiveInstitutionId } from '../api/client';
import { useCatalogStore } from '../stores/catalogStore';
import { useQuestionStore } from '../stores/questionStore';
import { usePaperStore } from '../stores/paperStore';
import { useTestStore } from '../stores/testStore';
import { useUserStore } from '../stores/userStore';
import type { InstitutionRole } from '../types';

export interface TenantInstitution { id: string; name: string; type?: string; role?: InstitutionRole }
interface TenantContextValue {
  institutions: TenantInstitution[];
  activeInstitutionId: string;
  membershipRole: InstitutionRole | null;
  setInstitutions: (rows: TenantInstitution[]) => void;
  activateInstitution: (id: string, role?: InstitutionRole) => void;
}
const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [institutions, setInstitutions] = useState<TenantInstitution[]>([]);
  const [activeInstitutionId, setActiveId] = useState(() => getActiveInstitutionId() || '');
  const [membershipRole, setRole] = useState<InstitutionRole | null>(null);
  useEffect(() => {
    useCatalogStore.setState({ subjects: [], chapters: [], examTypes: [], error: null });
    useQuestionStore.setState({ questions: [], error: null, isLoading: false });
    usePaperStore.setState({ papers: [], error: null, isLoading: false });
    useTestStore.setState({ onlineTests: [], testAttempts: [], error: null, isLoading: false });
    useUserStore.setState({ users: [], error: null, isLoading: false });
  }, []);
  const updateInstitutions = useCallback((rows: TenantInstitution[]) => {
    setInstitutions(rows);
    const active = getActiveInstitutionId();
    const selected = rows.find((item) => item.id === active) || (rows.length === 1 ? rows[0] : undefined);
    if (selected) {
      setActiveInstitutionId(selected.id);
      setActiveId(selected.id);
      setRole(selected.role || null);
    } else {
      setActiveId('');
      setRole(null);
    }
  }, []);
  const activateInstitution = (id: string, role?: InstitutionRole) => {
    if (!institutions.some((item) => item.id === id)) return;
    if (id !== activeInstitutionId) {
      useCatalogStore.setState({ subjects: [], chapters: [], examTypes: [], error: null });
      useQuestionStore.setState({ questions: [], error: null, isLoading: false });
      usePaperStore.setState({ papers: [], error: null, isLoading: false });
      useTestStore.setState({ onlineTests: [], testAttempts: [], error: null, isLoading: false });
      useUserStore.setState({ users: [], error: null, isLoading: false });
    }
    setActiveInstitutionId(id);
    setActiveId(id);
    setRole(role || institutions.find((item) => item.id === id)?.role || null);
    if (id !== activeInstitutionId) window.location.reload();
  };
  const value = useMemo(() => ({ institutions, activeInstitutionId, membershipRole, setInstitutions: updateInstitutions, activateInstitution }), [institutions, activeInstitutionId, membershipRole, updateInstitutions]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant must be used within TenantProvider');
  return context;
}
export function useOptionalTenant() { return useContext(TenantContext); }
