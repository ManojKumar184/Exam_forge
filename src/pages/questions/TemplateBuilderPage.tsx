import { useState, useEffect } from 'react';
import { Card, Button, Input, Textarea, Alert, PageHeader, Loading, Badge } from '../../components/ui';
import { Plus, Trash2, Copy, Edit, Save, ArrowLeft, FileText } from 'lucide-react';
import { 
  fetchTemplatesApi, 
  createTemplateApi, 
  updateTemplateApi, 
  deleteTemplateApi, 
  duplicateTemplateApi 
} from '../../api/papers';
import type { ExamTemplate } from '../../types';

export function TemplateBuilderPage() {
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<ExamTemplate> | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setIsLoading(true);
    try {
      const data = await fetchTemplatesApi();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates', err);
      setMessage({ type: 'error', text: 'Failed to fetch exam templates.' });
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateNew = () => {
    setEditingTemplate({
      name: 'New Custom Template',
      code: null,
      subjectStructure: ['Physics', 'Chemistry', 'Mathematics'],
      sections: [
        {
          name: 'Section A - MCQ',
          allowedQuestionTypes: ['mcq'],
          marksPerQuestion: 4,
          negativeMarksPerQuestion: 1,
          questionCount: 20
        }
      ],
      instructions: 'Write instructions here...',
      layoutDefaults: {
        layout: 'single_column',
        margin: 'normal',
        fontFamily: 'times_new_roman',
        fontSize: 11,
        lineSpacing: 1.25
      },
      exportDefaults: {},
      isSystem: false
    });
  };

  const handleEdit = (tpl: ExamTemplate) => {
    // Deep clone to avoid mutating state directly
    setEditingTemplate(JSON.parse(JSON.stringify(tpl)));
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await duplicateTemplateApi(id);
      setMessage({ type: 'success', text: `Duplicated template as "${copy.name}".` });
      loadTemplates();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to duplicate template.' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await deleteTemplateApi(id);
      setMessage({ type: 'success', text: 'Template deleted successfully.' });
      loadTemplates();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to delete template.' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || !editingTemplate.name) return;
    
    setIsSaving(true);
    setMessage(null);
    try {
      if (editingTemplate.id || editingTemplate._id) {
        const id = editingTemplate.id || editingTemplate._id!;
        await updateTemplateApi(id, editingTemplate);
        setMessage({ type: 'success', text: 'Template updated successfully.' });
      } else {
        await createTemplateApi(editingTemplate);
        setMessage({ type: 'success', text: 'Template created successfully.' });
      }
      setEditingTemplate(null);
      loadTemplates();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to save template.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Section builders helpers
  const handleAddSection = () => {
    if (!editingTemplate) return;
    const sections = [...(editingTemplate.sections || [])];
    sections.push({
      name: `Section ${String.fromCharCode(65 + sections.length)} - New Section`,
      allowedQuestionTypes: ['mcq'],
      marksPerQuestion: 4,
      negativeMarksPerQuestion: 0,
      questionCount: 10
    });
    setEditingTemplate({ ...editingTemplate, sections });
  };

  const handleRemoveSection = (idx: number) => {
    if (!editingTemplate) return;
    const sections = [...(editingTemplate.sections || [])];
    sections.splice(idx, 1);
    setEditingTemplate({ ...editingTemplate, sections });
  };

  const handleSectionChange = (idx: number, field: string, value: any) => {
    if (!editingTemplate) return;
    const sections = [...(editingTemplate.sections || [])];
    sections[idx] = { ...sections[idx], [field]: value };
    setEditingTemplate({ ...editingTemplate, sections });
  };

  const toggleSubject = (sub: string) => {
    if (!editingTemplate) return;
    const current = [...(editingTemplate.subjectStructure || [])];
    const idx = current.indexOf(sub);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(sub);
    }
    setEditingTemplate({ ...editingTemplate, subjectStructure: current });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  // Builder Page Form View
  if (editingTemplate) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => setEditingTemplate(null)} 
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {editingTemplate.id || editingTemplate._id ? 'Edit Template' : 'Create Custom Template'}
              </h2>
              <p className="text-xs text-slate-500">Define layouts, marking schemes and structural blueprints.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving} className="flex items-center gap-1.5">
              <Save size={16} /> Save Template
            </Button>
          </div>
        </div>

        <form className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left configurations column */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-5 space-y-4 shadow-sm border border-slate-200">
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider border-b pb-2">Layout Defaults</h3>
              
              <Input
                label="Template Name"
                required
                placeholder="e.g. Weekly Assessment"
                value={editingTemplate.name || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
              />

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500">Layout columns</label>
                <select
                  value={editingTemplate.layoutDefaults?.layout || 'single_column'}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    layoutDefaults: { ...editingTemplate.layoutDefaults!, layout: e.target.value as any }
                  })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
                >
                  <option value="single_column">Single Column Layout</option>
                  <option value="two_column">Two Column Layout</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500">Margins</label>
                <select
                  value={editingTemplate.layoutDefaults?.margin || 'normal'}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    layoutDefaults: { ...editingTemplate.layoutDefaults!, margin: e.target.value as any }
                  })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
                >
                  <option value="narrow">Narrow (10mm)</option>
                  <option value="normal">Normal (16mm)</option>
                  <option value="wide">Wide (25mm)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500">Font Family</label>
                <select
                  value={editingTemplate.layoutDefaults?.fontFamily || 'times_new_roman'}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    layoutDefaults: { ...editingTemplate.layoutDefaults!, fontFamily: e.target.value }
                  })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
                >
                  <option value="times_new_roman">Times New Roman</option>
                  <option value="cambria">Cambria</option>
                  <option value="arial">Arial</option>
                  <option value="inter">Inter (Modern Sans)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Font Size (pt)"
                  type="number"
                  step="0.5"
                  value={editingTemplate.layoutDefaults?.fontSize || 11}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    layoutDefaults: { ...editingTemplate.layoutDefaults!, fontSize: Number(e.target.value) }
                  })}
                />
                <Input
                  label="Line Spacing"
                  type="number"
                  step="0.05"
                  value={editingTemplate.layoutDefaults?.lineSpacing || 1.25}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    layoutDefaults: { ...editingTemplate.layoutDefaults!, lineSpacing: Number(e.target.value) }
                  })}
                />
              </div>
            </Card>

            <Card className="p-5 space-y-3 shadow-sm border border-slate-200">
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider border-b pb-2">Subject Distribution</h3>
              <p className="text-xs text-slate-500">Allowed subjects in papers generated using this template.</p>
              
              <div className="flex flex-col gap-2 pt-1">
                {['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'General'].map((sub) => {
                  const active = editingTemplate.subjectStructure?.includes(sub);
                  return (
                    <label key={sub} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded border transition-all">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleSubject(sub)}
                        className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-sm font-semibold text-slate-700">{sub}</span>
                    </label>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Right layout structures column */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Exam Section Blueprint</h3>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleAddSection} 
                  className="flex items-center gap-1 text-xs px-2.5 py-1"
                >
                  <Plus size={14} /> Add Section
                </Button>
              </div>

              <div className="space-y-4">
                {(editingTemplate.sections || []).map((sec, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200 relative space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                        Section {String.fromCharCode(65 + idx)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(idx)}
                        disabled={(editingTemplate.sections?.length || 0) <= 1}
                        className="text-slate-400 hover:text-red-500 disabled:opacity-40 transition-colors p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <Input
                      label="Section Display Name"
                      required
                      placeholder="e.g. MCQ - Single Option Correct"
                      value={sec.name}
                      onChange={(e) => handleSectionChange(idx, 'name', e.target.value)}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Input
                          label="Questions Count"
                          type="number"
                          min="1"
                          value={sec.questionCount}
                          onChange={(e) => handleSectionChange(idx, 'questionCount', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Input
                          label="Marks / Q"
                          type="number"
                          min="0"
                          value={sec.marksPerQuestion}
                          onChange={(e) => handleSectionChange(idx, 'marksPerQuestion', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Input
                          label="Negative Marks"
                          type="number"
                          min="0"
                          value={sec.negativeMarksPerQuestion}
                          onChange={(e) => handleSectionChange(idx, 'negativeMarksPerQuestion', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Allowed Types</label>
                        <div className="flex gap-2 pt-1.5">
                          {['mcq', 'numerical', 'descriptive'].map((t) => {
                            const isSelected = sec.allowedQuestionTypes.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  const currentTypes = [...sec.allowedQuestionTypes];
                                  const tIdx = currentTypes.indexOf(t);
                                  if (tIdx >= 0) {
                                    if (currentTypes.length > 1) currentTypes.splice(tIdx, 1);
                                  } else {
                                    currentTypes.push(t);
                                  }
                                  handleSectionChange(idx, 'allowedQuestionTypes', currentTypes);
                                }}
                                className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase transition-all ${
                                  isSelected 
                                    ? 'bg-slate-800 text-white border-slate-800' 
                                    : 'bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 shadow-sm border border-slate-200 space-y-4">
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider border-b pb-2">Instructions</h3>
              <Textarea
                label="Instructions Header Text"
                placeholder="Instructions displayed at the header of generated papers."
                value={editingTemplate.instructions || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, instructions: e.target.value })}
                rows={5}
              />
            </Card>
          </div>
        </form>
      </div>
    );
  }

  // List templates view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader 
          title="Exam Templates" 
          subtitle="Manage pre-packaged structures (JEE, NEET, CBSE) or customize blueprints for automated papers." 
        />
        <Button onClick={handleCreateNew} className="flex items-center gap-1">
          <Plus size={16} /> Create Template
        </Button>
      </div>

      {message && (
        <Alert variant={message.type} title={message.text} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((tpl) => (
          <Card key={tpl.id || tpl._id} className="p-5 flex flex-col justify-between shadow-sm border border-slate-200 hover:shadow-md transition-shadow relative overflow-hidden group">
            {tpl.isSystem && (
              <div className="absolute top-0 right-0 bg-blue-600 text-white font-bold text-[8px] uppercase tracking-widest px-3 py-1 rounded-bl shadow-sm">
                System Built-in
              </div>
            )}
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-500 h-5 w-5" />
                <h3 className="font-bold text-slate-800 text-base group-hover:text-blue-600 transition-colors">
                  {tpl.name}
                </h3>
              </div>
              
              <div className="flex flex-wrap gap-1">
                {(tpl.subjectStructure || []).map((sub) => (
                  <Badge key={sub} variant="default" className="text-[10px] font-semibold">
                    {sub}
                  </Badge>
                ))}
              </div>

              <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded border">
                <div><strong>Sections:</strong> {tpl.sections?.length || 0} sections defined</div>
                <div><strong>Default columns:</strong> {tpl.layoutDefaults?.layout === 'two_column' ? 'Two Columns' : 'Single Column'}</div>
                <div><strong>Font defaults:</strong> {tpl.layoutDefaults?.fontFamily} ({tpl.layoutDefaults?.fontSize}pt)</div>
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-3 border-t">
              {tpl.isSystem ? (
                <Button 
                  variant="outline" 
                  onClick={() => handleDuplicate(tpl.id || tpl._id!)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs"
                >
                  <Copy size={12} /> Duplicate
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => handleEdit(tpl)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs"
                  >
                    <Edit size={12} /> Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleDuplicate(tpl.id || tpl._id!)}
                    className="p-2"
                  >
                    <Copy size={12} />
                  </Button>
                  <button 
                    type="button"
                    onClick={() => handleDelete(tpl.id || tpl._id!)}
                    className="p-2 border rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
