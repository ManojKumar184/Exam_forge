import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Card, Button, Badge, Input, EmptyState, Modal, Loading, PageHeader
} from '../../components/ui';
import {
  fetchSyllabusTree, createSyllabusNode, updateSyllabusNode, deleteSyllabusNode, SyllabusNode
} from '../../api/syllabus';
import { Plus, Edit2, Trash2, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';

export function SyllabusManagerPage() {
  const [treeData, setTreeData] = useState<SyllabusNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedNode, setSelectedNode] = useState<SyllabusNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'exam_pattern' as SyllabusNode['type'],
    parentId: null as string | null,
    isActive: true,
  });

  const [editFormData, setEditFormData] = useState({
    id: '',
    name: '',
    code: '',
    isActive: true,
  });

  const loadTree = async () => {
    try {
      setIsLoading(true);
      const data = await fetchSyllabusTree();
      setTreeData(data);
      // Auto expand root nodes
      const initialExpanded: Record<string, boolean> = {};
      data.forEach(node => {
        initialExpanded[node._id] = true;
      });
      setExpandedNodes(prev => ({ ...initialExpanded, ...prev }));
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getNextNodeType = (parentType: SyllabusNode['type']): SyllabusNode['type'] => {
    switch (parentType) {
      case 'exam_pattern': return 'class';
      case 'class': return 'subject';
      case 'subject': return 'chapter';
      case 'chapter': return 'topic';
      case 'topic': return 'subtopic';
      default: return 'exam_pattern';
    }
  };

  const handleOpenAdd = (parent: SyllabusNode | null) => {
    if (parent) {
      const nextType = getNextNodeType(parent.type);
      setFormData({
        name: '',
        code: `${parent.code}_`,
        type: nextType,
        parentId: parent._id,
        isActive: true,
      });
    } else {
      setFormData({
        name: '',
        code: '',
        type: 'exam_pattern',
        parentId: null,
        isActive: true,
      });
    }
    setShowAddModal(true);
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSyllabusNode({
        name: formData.name,
        code: formData.code.trim().toUpperCase(),
        type: formData.type,
        parentId: formData.parentId,
        isActive: formData.isActive,
      });
      toast.success('Syllabus node created successfully.');
      setShowAddModal(false);
      loadTree();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleOpenEdit = (node: SyllabusNode) => {
    setEditFormData({
      id: node._id,
      name: node.name,
      code: node.code,
      isActive: node.isActive,
    });
    setShowEditModal(true);
  };

  const handleEditNode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSyllabusNode(editFormData.id, {
        name: editFormData.name,
        code: editFormData.code.trim().toUpperCase(),
        isActive: editFormData.isActive,
      });
      toast.success('Syllabus node updated successfully.');
      setShowEditModal(false);
      if (selectedNode && selectedNode._id === editFormData.id) {
        setSelectedNode(prev => prev ? { ...prev, name: editFormData.name, code: editFormData.code.toUpperCase(), isActive: editFormData.isActive } : null);
      }
      loadTree();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!window.confirm('Are you sure you want to delete this syllabus node? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteSyllabusNode(nodeId);
      toast.success('Syllabus node deleted.');
      if (selectedNode && selectedNode._id === nodeId) {
        setSelectedNode(null);
      }
      loadTree();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  // Helper to filter nodes in-memory by search query
  const filterTree = (nodes: SyllabusNode[], query: string): SyllabusNode[] => {
    if (!query.trim()) return nodes;
    
    const lowerQuery = query.toLowerCase();
    
    return nodes
      .map(node => {
        const matchesName = node.name.toLowerCase().includes(lowerQuery);
        const matchesCode = node.code.toLowerCase().includes(lowerQuery);
        const matchesType = node.type.toLowerCase().includes(lowerQuery);
        
        let filteredChildren: SyllabusNode[] = [];
        if (node.children) {
          filteredChildren = filterTree(node.children, query);
        }
        
        if (matchesName || matchesCode || matchesType || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          } as SyllabusNode;
        }
        return null;
      })
      .filter((n): n is SyllabusNode => n !== null);
  };

  const filteredTree = filterTree(treeData, searchQuery);

  const getTypeBadgeColor = (type: SyllabusNode['type']) => {
    switch (type) {
      case 'exam_pattern': return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
      case 'class': return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
      case 'subject': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      case 'chapter': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
      case 'topic': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300';
      case 'subtopic': return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const renderTreeNode = (node: SyllabusNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = !!expandedNodes[node._id];
    const isSelected = selectedNode?._id === node._id;

    return (
      <div key={node._id} className="select-none">
        <div
          className={`flex items-center justify-between py-2 px-3 my-0.5 rounded-lg cursor-pointer transition-colors duration-150 ${
            isSelected
              ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border-l-[3px] border-primary-600'
              : 'hover:bg-slate-100 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => setSelectedNode(node)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(node._id, e)}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-6" />
            )}
            <span className={`text-sm font-medium truncate ${!node.isActive ? 'line-through text-slate-400' : ''}`}>
              {node.name}
            </span>
            <span className="text-xs text-slate-400 font-mono tracking-wider truncate hidden sm:inline">
              [{node.code}]
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${getTypeBadgeColor(node.type)}`}>
              {node.type.replace('_', ' ')}
            </span>
            
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-100">
              {node.level < 5 && (
                <button
                  title="Add child node"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAdd(node);
                  }}
                  className="p-1 rounded text-slate-400 hover:text-primary-600 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                title="Edit node"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(node);
                }}
                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              {!hasChildren && (
                <button
                  title="Delete node"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNode(node._id);
                  }}
                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-slate-100 dark:border-slate-800 ml-4">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Syllabus Manager"
          subtitle="Define and structure standard academic curricula"
        />
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => handleOpenAdd(null)}>
          Create Exam Pattern
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tree panel */}
        <Card className="lg:col-span-2 p-6 flex flex-col min-h-[500px]">
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search syllabus nodes by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[600px] border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loading text="Loading syllabus tree..." />
              </div>
            ) : filteredTree.length === 0 ? (
              <EmptyState
                title="No Nodes Found"
                description={searchQuery ? 'Try adjusting your search criteria' : 'Create an exam pattern to get started'}
              />
            ) : (
              <div className="group space-y-1">
                {filteredTree.map((node) => renderTreeNode(node, 0))}
              </div>
            )}
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="p-6 h-fit space-y-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-3">
            Node Details
          </h3>

          {selectedNode ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold mb-1">
                  Type / Level
                </span>
                <Badge className="capitalize font-semibold">
                  {selectedNode.type.replace('_', ' ')} (Level {selectedNode.level})
                </Badge>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold mb-1">
                  Name
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white bg-slate-100/60 dark:bg-slate-800 px-3 py-2 rounded-lg">
                  {selectedNode.name}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold mb-1">
                  System Code
                </span>
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-800 px-3 py-2 rounded-lg tracking-wider">
                  {selectedNode.code}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold mb-1">
                  Status
                </span>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${selectedNode.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    {selectedNode.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                {selectedNode.level < 5 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => handleOpenAdd(selectedNode)}
                  >
                    Add Child
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  leftIcon={<Edit2 className="w-4 h-4" />}
                  onClick={() => handleOpenEdit(selectedNode)}
                >
                  Edit Node
                </Button>
                {(!selectedNode.children || selectedNode.children.length === 0) && (
                  <Button
                    variant="ghost"
                    className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    leftIcon={<Trash2 className="w-4 h-4" />}
                    onClick={() => handleDeleteNode(selectedNode._id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic text-center py-12">
              Select a node from the syllabus tree to view or edit details
            </p>
          )}
        </Card>
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={formData.parentId ? 'Add Syllabus Node' : 'Create Exam Pattern'}
      >
        <form onSubmit={handleCreateNode} className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Physics, Laws of Motion, Kinematics..."
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
          />
          <div>
            <Input
              label="Node Code (Unique)"
              placeholder="e.g. JEEM_PHY, NLM_FNT..."
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Uppercase unique identifier used for syllabus mappings
            </p>
          </div>
          <div className="flex items-center gap-4 pt-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Active Status
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Node</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Syllabus Node"
      >
        <form onSubmit={handleEditNode} className="space-y-4">
          <Input
            label="Name"
            value={editFormData.name}
            onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
            required
          />
          <div>
            <Input
              label="Node Code"
              value={editFormData.code}
              onChange={(e) => setEditFormData(prev => ({ ...prev, code: e.target.value }))}
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Uppercase unique identifier used for syllabus mappings
            </p>
          </div>
          <div className="flex items-center gap-4 pt-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Active Status
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={editFormData.isActive}
                onChange={(e) => setEditFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
