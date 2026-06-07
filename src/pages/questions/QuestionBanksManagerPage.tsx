import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchQuestionBanksApi,
  createQuestionBankApi,
  updateQuestionBankApi,
  deleteQuestionBankApi,
  reorderQuestionBanksApi,
  type QuestionBank,
} from '../../api/questionBanks';
import { Card, Button, Badge, Input, Select, Modal, Textarea, Loading, EmptyState, PageHeader } from '../../components/ui';
import { Plus, Edit, Trash2, Layers, Calendar, Building, Eye, Star, ArrowUp, ArrowDown, Pin, User } from 'lucide-react';

export function QuestionBanksManagerPage() {
  const { profile, isAdmin, isFaculty } = useAuth();
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'system' | 'institution' | 'faculty' | 'custom'>('custom');
  const [visibility, setVisibility] = useState<'public' | 'institution' | 'private'>('public');
  const [institution, setInstitution] = useState('');

  const fetchBanks = async () => {
    setIsLoading(true);
    try {
      const data = await fetchQuestionBanksApi();
      setBanks(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch question banks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        type,
        visibility,
        institution: type === 'institution' ? institution.trim() : null,
      };
      await createQuestionBankApi(payload);
      toast.success('Question bank created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchBanks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create question bank');
    }
  };

  const handleEdit = (bank: QuestionBank) => {
    setSelectedBank(bank);
    setName(bank.name);
    setDescription(bank.description);
    setType(bank.type);
    setVisibility(bank.visibility);
    setInstitution(bank.institution || '');
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!selectedBank) return;
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        type,
        visibility,
        institution: type === 'institution' ? institution.trim() : null,
      };
      await updateQuestionBankApi(selectedBank._id, payload);
      toast.success('Question bank updated successfully');
      setShowEditModal(false);
      resetForm();
      fetchBanks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update question bank');
    }
  };

  const handleDelete = async (bankId: string, bankType: string) => {
    if (bankType === 'system') {
      toast.error('System question banks cannot be deleted');
      return;
    }
    if (!confirm('Are you sure you want to delete this question bank? Questions associated with it will not be deleted, but they will be removed from this bank.')) {
      return;
    }
    try {
      await deleteQuestionBankApi(bankId);
      toast.success('Question bank deleted successfully');
      fetchBanks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete question bank');
    }
  };

  const handleTogglePin = async (bank: QuestionBank) => {
    try {
      const nextIsPinned = !bank.isPinned;
      let nextOrder = 0;
      if (nextIsPinned) {
        const pinned = banks.filter(b => b.isPinned);
        const maxOrder = pinned.reduce((max, b) => Math.max(max, b.pinnedOrder || 0), 0);
        nextOrder = maxOrder + 1;
      }
      await updateQuestionBankApi(bank._id, {
        isPinned: nextIsPinned,
        pinnedOrder: nextOrder,
      });
      toast.success(nextIsPinned ? 'Question bank pinned' : 'Question bank unpinned');
      fetchBanks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle pin');
    }
  };

  const handleMoveOrder = async (bank: QuestionBank, direction: 'up' | 'down') => {
    const pinnedBanks = banks.filter(b => b.isPinned).sort((a, b) => (a.pinnedOrder || 0) - (b.pinnedOrder || 0));
    const index = pinnedBanks.findIndex(b => b._id === bank._id);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const otherBank = pinnedBanks[index - 1];
      const orders = [
        { id: bank._id, isPinned: true, pinnedOrder: otherBank.pinnedOrder || 0 },
        { id: otherBank._id, isPinned: true, pinnedOrder: bank.pinnedOrder || 0 },
      ];
      try {
        await reorderQuestionBanksApi(orders);
        toast.success('Pin order updated');
        fetchBanks();
      } catch (err: any) {
        toast.error(err.message || 'Failed to reorder banks');
      }
    } else if (direction === 'down' && index < pinnedBanks.length - 1) {
      const otherBank = pinnedBanks[index + 1];
      const orders = [
        { id: bank._id, isPinned: true, pinnedOrder: otherBank.pinnedOrder || 0 },
        { id: otherBank._id, isPinned: true, pinnedOrder: bank.pinnedOrder || 0 },
      ];
      try {
        await reorderQuestionBanksApi(orders);
        toast.success('Pin order updated');
        fetchBanks();
      } catch (err: any) {
        toast.error(err.message || 'Failed to reorder banks');
      }
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setType(isFaculty ? 'faculty' : 'custom');
    setVisibility('public');
    setInstitution('');
    setSelectedBank(null);
  };

  const getTypeVariant = (t: string) => {
    switch (t) {
      case 'system': return 'info';
      case 'institution': return 'warning';
      case 'faculty': return 'success';
      default: return 'default';
    }
  };

  const getVisibilityVariant = (v: string) => {
    switch (v) {
      case 'public': return 'success';
      case 'institution': return 'warning';
      case 'private': return 'error';
      default: return 'default';
    }
  };

  if (isLoading) {
    return <Loading fullScreen text="Loading question banks..." />;
  }

  const pinnedBanks = banks.filter(b => b.isPinned);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question Banks"
        subtitle={`${banks.length} accessible question banks`}
        actions={(isAdmin || isFaculty) && (
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            Create Question Bank
          </Button>
        )}
      />

      {banks.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-12 h-12 text-slate-400" />}
          title="No Question Banks Found"
          description="Create a custom or faculty question bank to begin organizing questions."
          action={(isAdmin || isFaculty) && (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
              Create Question Bank
            </Button>
          )}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banks.map((bank) => {
            const canManage = isAdmin || (bank.createdBy === profile?.id || (bank.createdBy && typeof bank.createdBy === 'object' && bank.createdBy._id === profile?.id));
            const ownerName = bank.createdBy && typeof bank.createdBy === 'object' ? bank.createdBy.full_name : 'System';

            return (
              <Card
                key={bank._id}
                className={`p-5 flex flex-col justify-between hover:shadow-lg transition-all border ${
                  bank.isPinned
                    ? 'border-amber-400 bg-amber-50/5 dark:bg-amber-950/5 shadow-sm ring-1 ring-amber-400/20'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white/95 dark:bg-slate-850'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-slate-900 dark:text-white text-base truncate">
                          {bank.name}
                        </h3>
                        {bank.isPinned && (
                          <Badge variant="warning" className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px]">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Pinned
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[2rem]">
                        {bank.description || 'No description provided.'}
                      </p>
                    </div>
                    <Badge variant={getTypeVariant(bank.type)}>{bank.type}</Badge>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5" />
                      <span>Owner: <strong>{ownerName}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Questions: <strong>{bank.questionCount ?? 0}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Visibility: <Badge variant={getVisibilityVariant(bank.visibility)} size="sm">{bank.visibility}</Badge></span>
                    </div>
                    {bank.institution && (
                      <div className="flex items-center gap-2">
                        <Building className="w-3.5 h-3.5" />
                        <span>Institution: <strong>{bank.institution}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Created: {new Date(bank.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`p-1.5 ${bank.isPinned ? 'text-amber-500' : 'text-slate-400'}`}
                          title={bank.isPinned ? 'Unpin bank' : 'Pin bank'}
                          onClick={() => handleTogglePin(bank)}
                        >
                          <Pin className="w-4 h-4" />
                        </Button>
                        {bank.isPinned && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1.5 text-slate-500"
                              disabled={pinnedBanks.findIndex(b => b._id === bank._id) === 0}
                              onClick={() => handleMoveOrder(bank, 'up')}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1.5 text-slate-500"
                              disabled={pinnedBanks.findIndex(b => b._id === bank._id) === pinnedBanks.length - 1}
                              onClick={() => handleMoveOrder(bank, 'down')}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {canManage ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Edit className="w-3.5 h-3.5" />}
                          onClick={() => handleEdit(bank)}
                        >
                          Edit
                        </Button>
                        {bank.type !== 'system' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => handleDelete(bank._id, bank.type)}
                          >
                            Delete
                          </Button>
                        )}
                      </>
                    ) : (
                      <Badge variant="default">View Only</Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Question Bank" size="md">
        <div className="p-6 space-y-4">
          <Input label="Name" placeholder="e.g. Narayana Question Bank" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Description" placeholder="Provide details about the scope of this bank..." value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={type}
              onChange={(e) => {
                const val = e.target.value as any;
                setType(val);
                if (val === 'system') {
                  setVisibility('public');
                } else if (val === 'faculty') {
                  setVisibility('private');
                }
              }}
              options={[
                ...(isAdmin ? [{ value: 'system', label: 'System' }] : []),
                { value: 'institution', label: 'Institution' },
                { value: 'faculty', label: 'Faculty' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            <Select
              label="Visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              disabled={type === 'system'}
              options={[
                { value: 'public', label: 'Public' },
                { value: 'institution', label: 'Institution Only' },
                { value: 'private', label: 'Faculty Private' },
              ]}
            />
          </div>

          {type === 'institution' && (
            <Input
              label="Institution Name"
              placeholder={profile?.school_institute || 'e.g. Narayana Junior College'}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Question Bank" size="md">
        <div className="p-6 space-y-4">
          <Input label="Name" placeholder="e.g. Narayana Question Bank" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Description" placeholder="Provide details..." value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={type}
              onChange={(e) => {
                const val = e.target.value as any;
                setType(val);
                if (val === 'system') {
                  setVisibility('public');
                } else if (val === 'faculty') {
                  setVisibility('private');
                }
              }}
              options={[
                ...(isAdmin ? [{ value: 'system', label: 'System' }] : []),
                { value: 'institution', label: 'Institution' },
                { value: 'faculty', label: 'Faculty' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            <Select
              label="Visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              disabled={type === 'system'}
              options={[
                { value: 'public', label: 'Public' },
                { value: 'institution', label: 'Institution Only' },
                { value: 'private', label: 'Faculty Private' },
              ]}
            />
          </div>

          {type === 'institution' && (
            <Input
              label="Institution Name"
              placeholder={profile?.school_institute || 'e.g. Narayana Junior College'}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
            <Button variant="ghost" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleUpdate}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
