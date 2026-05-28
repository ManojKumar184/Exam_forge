import { useEffect, useState } from 'react';
import { useDataStore } from '../../stores/dataStore';
import {
  Card, Button, Badge, Input, Select, Modal, Textarea, EmptyState, Alert
} from '../../components/ui';
import {
  Check, X, RefreshCw, Sliders, History, Save, FileQuestion, ArrowRight,
  AlertTriangle, Shield, CheckCircle, HelpCircle, FileText
} from 'lucide-react';
import type { Question, QuestionOption } from '../../types';
import { QuestionContentPreview, RichContent, RichOptionContent } from '../../components/content/RichContent';
import { MathRenderer } from '../../components/math/MathRenderer';
import toast from 'react-hot-toast';
import axios from 'axios';
import { apiConfig } from '../../config/api';

export function ModerationQueuePage() {
  const {
    subjects, chapters, examTypes,
    fetchSubjects, fetchChapters, fetchExamTypes,
    approveQuestion, rejectQuestion, updateQuestion
  } = useDataStore();

  const [queue, setQueue] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workspace' | 'edit' | 'audit' | 'confidence'>('workspace');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Editable Form fields
  const [editForm, setEditForm] = useState<{
    question_text: string;
    question_latex: string;
    question_type: Question['question_type'];
    options: QuestionOption[];
    correct_option: number | null;
    numerical_answer: number | null;
    explanation: string;
    class: number;
    difficulty: Question['difficulty'];
    subject_id: string;
    chapter_id: string;
    exam_type_id: string;
    tags: string[];
  }>({
    question_text: '',
    question_latex: '',
    question_type: 'descriptive',
    options: [],
    correct_option: null,
    numerical_answer: null,
    explanation: '',
    class: 11,
    difficulty: 'medium',
    subject_id: '',
    chapter_id: '',
    exam_type_id: '',
    tags: [],
  });

  const [tagsText, setTagsText] = useState('');
  const [isRerunning, setIsRerunning] = useState(false);

  // Fetch pending or needs review questions
  const loadQueue = async () => {
    try {
      // We want to fetch questions that are pending or needs_review
      const response = await axios.get(`${apiConfig.baseUrl}/api/questions`, {
        params: { status: 'pending', limit: 100 },
        headers: { Authorization: `Bearer ${localStorage.getItem('examforge_access_token')}` }
      });
      const pendingItems = response.data?.data?.items || [];

      const reviewResponse = await axios.get(`${apiConfig.baseUrl}/api/questions`, {
        params: { status: 'needs_review', limit: 100 },
        headers: { Authorization: `Bearer ${localStorage.getItem('examforge_access_token')}` }
      });
      const reviewItems = reviewResponse.data?.data?.items || [];

      // Combine both in the queue
      const combined = [...pendingItems, ...reviewItems];
      setQueue(combined);
      
      // Select first question if none selected and queue is not empty
      if (combined.length > 0 && !selectedId) {
        setSelectedId(combined[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load moderation queue');
    }
  };

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    loadQueue();
  }, []);

  const activeQuestion = queue.find(q => q.id === selectedId);

  useEffect(() => {
    if (activeQuestion) {
      setEditForm({
        question_text: activeQuestion.question_text || '',
        question_latex: activeQuestion.question_latex || '',
        question_type: activeQuestion.question_type || 'descriptive',
        options: (activeQuestion.options || []).map((o: any) => ({
          text: o.text || '',
          latex: o.latex || null,
          image: o.image || undefined,
        })),
        correct_option: activeQuestion.correct_option !== undefined ? activeQuestion.correct_option : null,
        numerical_answer: activeQuestion.numerical_answer !== undefined ? activeQuestion.numerical_answer : null,
        explanation: activeQuestion.explanation || '',
        class: activeQuestion.class || 11,
        difficulty: activeQuestion.difficulty || 'medium',
        subject_id: activeQuestion.subject_id || '',
        chapter_id: activeQuestion.chapter_id || '',
        exam_type_id: activeQuestion.exam_type_id || '',
        tags: activeQuestion.tags || [],
      });
      setTagsText((activeQuestion.tags || []).join(', '));
      if (activeQuestion.subject_id) {
        fetchChapters(activeQuestion.subject_id);
      }
    }
  }, [selectedId, activeQuestion]);

  const handleApprove = async () => {
    if (!activeQuestion) return;
    if (!editForm.subject_id || !editForm.exam_type_id) {
      toast.error('Subject and Exam Type are required before approving.');
      setActiveTab('edit');
      return;
    }
    
    try {
      // First save changes, then approve
      await handleSaveDraft(true);
      await approveQuestion(activeQuestion.id);
      toast.success('Question approved and published.');
      setSelectedId(null);
      await loadQueue();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Approval failed.');
    }
  };

  const handleRejectSubmit = async () => {
    if (!activeQuestion || !rejectReason) return;
    try {
      await rejectQuestion(activeQuestion.id, rejectReason);
      toast.success('Question rejected.');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedId(null);
      await loadQueue();
    } catch (err) {
      toast.error('Rejection failed.');
    }
  };

  const handleSaveDraft = async (silent = false) => {
    if (!activeQuestion) return;
    try {
      const payload: Partial<Question> = {
        ...editForm,
        tags: tagsText.split(',').map(t => t.trim()).filter(Boolean)
      };
      await updateQuestion(activeQuestion.id, payload);
      if (!silent) {
        toast.success('Draft saved successfully.');
        await loadQueue();
      }
    } catch (err) {
      if (!silent) toast.error('Failed to save draft.');
      throw err;
    }
  };

  const handleReRunPipeline = async () => {
    if (!activeQuestion) return;
    const rawHtml = activeQuestion.debug_info?.rawClipboardHtml;
    const ocrData = activeQuestion.rendering_metadata?.ocr as any;
    const rawPlain = ocrData?.rawTextPreview || activeQuestion.question_text;
    
    if (!rawHtml && !rawPlain) {
      toast.error('No raw clipboard or OCR payload available to re-run pipeline.');
      return;
    }

    setIsRerunning(true);
    try {
      const response = await axios.post(`${apiConfig.baseUrl}/api/questions/reconstruct`, {
        html: rawHtml || undefined,
        plain: rawPlain,
        rawHtml: rawHtml || undefined,
        images: activeQuestion.question_images || [],
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('examforge_access_token')}` }
      });

      const parsed = response.data?.data;
      if (parsed) {
        setEditForm(prev => ({
          ...prev,
          question_text: parsed.questionText || '',
          question_latex: parsed.questionLatex || '',
          question_type: (parsed.questionType || 'descriptive') as Question['question_type'],
          options: (parsed.options || []).map((o: any) => ({
            text: o.text || '',
            latex: o.latex || null,
            image: o.image || undefined,
          })),
          correct_option: parsed.correctOption !== undefined ? parsed.correctOption : null,
          numerical_answer: parsed.numericalAnswer !== undefined ? parsed.numericalAnswer : null,
          tags: parsed.tags || [],
        }));
        setTagsText((parsed.tags || []).join(', '));
        
        // Temporarily update active question's confidence metrics locally
        activeQuestion.parser_confidence = parsed.parserConfidence;
        activeQuestion.reconstruction_fidelity = parsed.reconstructionFidelity;
        activeQuestion.semantic_confidence = parsed.semanticConfidence;
        activeQuestion.math_preservation_confidence = parsed.mathPreservationConfidence;
        activeQuestion.metadata_confidence = parsed.metadataConfidence;
        activeQuestion.extraction_warnings = parsed.warnings;

        toast.success('Pipeline rerun completed successfully! Review the updated preview.');
        setActiveTab('workspace');
      }
    } catch (err) {
      toast.error('Pipeline rerun failed.');
    } finally {
      setIsRerunning(false);
    }
  };

  const getConfidenceColorClass = (val: number) => {
    const pct = val * 100;
    if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (pct >= 60) return 'text-amber-500 dark:text-amber-400';
    return 'text-rose-500 dark:text-rose-400';
  };

  const getConfidenceBarClass = (val: number) => {
    const pct = val * 100;
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden -mt-1 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Semantic Moderation Queue
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enforce SaaS publishing standards. High confidence items go to Pending; low confidence/duplicates go to Needs Review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning" className="text-xs px-3 py-1">
            {queue.filter(q => q.status === 'pending').length} Pending Approval
          </Badge>
          <Badge variant="info" className="text-xs px-3 py-1">
            {queue.filter(q => q.status === 'needs_review').length} Needs Review
          </Badge>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="flex-1 min-h-[400px]">
          <EmptyState
            title="Moderation queue is clean!"
            description="All questions have been published or processed. Great job!"
            icon={<CheckCircle className="w-12 h-12 text-emerald-500" />}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Left Panel: Queue List */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Queue Items ({queue.length})
              </span>
              <Button size="sm" variant="ghost" onClick={loadQueue} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                Refresh
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
              {queue.map((q) => {
                const isSelected = q.id === selectedId;
                const warningsCount = q.extraction_warnings?.length || 0;
                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedId(q.id)}
                    className={`w-full text-left p-3.5 transition-all duration-150 flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-blue-50/75 dark:bg-blue-900/10 border-l-4 border-blue-600 dark:border-blue-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/30 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
                        ID: ...{q.id.slice(-6)}
                      </span>
                      <Badge variant={q.status === 'needs_review' ? 'info' : 'warning'} size="sm" className="scale-90">
                        {q.status === 'needs_review' ? 'Review' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
                      {q.question_text || 'No stem text provided'}
                    </p>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">C{q.class}</span>
                        <span className="text-[10px] text-slate-400">•</span>
                        <span className="text-[10px] text-slate-400 uppercase">{q.question_type}</span>
                      </div>
                      {warningsCount > 0 && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> {warningsCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Workspace */}
          {activeQuestion ? (
            <div className="flex-1 flex flex-col min-w-0 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
              {/* Workspace Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Moderating ID: <span className="font-mono font-semibold">{activeQuestion.id}</span>
                  </h2>
                  <Badge variant={activeQuestion.status === 'needs_review' ? 'info' : 'warning'}>
                    {activeQuestion.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowRejectModal(true)} leftIcon={<X className="w-4 h-4 text-red-500" />}>
                    Reject
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleSaveDraft()} leftIcon={<Save className="w-4 h-4" />}>
                    Save Draft
                  </Button>
                  <Button size="sm" onClick={handleApprove} leftIcon={<Check className="w-4 h-4" />}>
                    Approve & Publish
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/20 dark:bg-slate-800/20 shrink-0">
                <button
                  onClick={() => setActiveTab('workspace')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeTab === 'workspace'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-white dark:bg-slate-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Workspace Comparison
                </button>
                <button
                  onClick={() => setActiveTab('edit')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeTab === 'edit'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-white dark:bg-slate-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Manual Correction Form
                </button>
                <button
                  onClick={() => setActiveTab('confidence')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeTab === 'confidence'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-white dark:bg-slate-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Confidence Gauges
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeTab === 'audit'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-white dark:bg-slate-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Replay & Audit Diffs
                </button>
              </div>

              {/* Workspace Tab Body */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {activeTab === 'workspace' && (
                  <div className="h-full flex flex-col md:flex-row gap-4">
                    {/* Left Pane: Original Source Payload */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileQuestion className="w-4 h-4 text-slate-400" />
                          Original Raw Payload
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleReRunPipeline}
                          disabled={isRerunning}
                          leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRerunning ? 'animate-spin' : ''}`} />}
                        >
                          {isRerunning ? 'Re-running...' : 'Re-run Ingestion'}
                        </Button>
                      </div>
                      <div className="flex-1 bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 overflow-auto border border-slate-100 dark:border-slate-800/80 font-mono text-xs leading-relaxed max-h-[500px]">
                        {activeQuestion.debug_info?.rawClipboardHtml ? (
                          <div>
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mb-1">// Raw HTML Paste Source</div>
                            <pre className="whitespace-pre-wrap">{activeQuestion.debug_info.rawClipboardHtml}</pre>
                          </div>
                        ) : (activeQuestion.rendering_metadata?.ocr as any)?.rawTextPreview ? (
                          <div>
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mb-1">// Raw OCR Text Source</div>
                            <pre className="whitespace-pre-wrap">{(activeQuestion.rendering_metadata?.ocr as any).rawTextPreview}</pre>
                          </div>
                        ) : (
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold mb-1">// Original Question Text</div>
                            <pre className="whitespace-pre-wrap">{activeQuestion.question_text}</pre>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="hidden md:flex items-center justify-center shrink-0">
                      <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                    </div>

                    {/* Right Pane: Reconstructed Preview */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700/50 pb-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        Reconstructed Semantic Preview
                      </span>
                      <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900 max-h-[500px] overflow-y-auto">
                        <QuestionContentPreview
                          question={{
                            ...activeQuestion,
                            question_text: editForm.question_text,
                            question_latex: editForm.question_latex,
                            question_type: editForm.question_type,
                            options: editForm.options,
                            correct_option: editForm.correct_option,
                          }}
                          showOptions
                        />
                        {editForm.explanation && (
                          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Explanation: </span>
                            <p className="text-slate-600 dark:text-slate-400 mt-1">{editForm.explanation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit Form Tab */}
                {activeTab === 'edit' && (
                  <div className="space-y-4 max-w-4xl">
                    <Textarea
                      label="Question Stem Text"
                      value={editForm.question_text}
                      onChange={(e) => setEditForm(p => ({ ...p, question_text: e.target.value }))}
                      rows={4}
                    />

                    {editForm.question_text && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                        <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">Live Stem Preview</span>
                        <RichContent text={editForm.question_text} compact />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Input
                          label="Question LaTeX Formula (Optional)"
                          value={editForm.question_latex || ''}
                          onChange={(e) => setEditForm(p => ({ ...p, question_latex: e.target.value }))}
                          placeholder="e.g. \int_{0}^{\pi} \sin(x) dx"
                        />
                        {editForm.question_latex && (
                          <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-xs flex justify-center">
                            <MathRenderer latex={editForm.question_latex} display />
                          </div>
                        )}
                      </div>
                      <Select
                        label="Question Type"
                        options={[
                          { value: 'mcq', label: 'Multiple Choice (MCQ)' },
                          { value: 'descriptive', label: 'Descriptive' },
                          { value: 'numerical', label: 'Numerical / Integer' },
                        ]}
                        value={editForm.question_type}
                        onChange={(e) => setEditForm(p => ({ ...p, question_type: e.target.value as Question['question_type'] }))}
                      />
                    </div>

                    {editForm.question_type === 'mcq' && (
                      <div className="space-y-3 pt-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">MCQ Options</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[0, 1, 2, 3].map((idx) => (
                            <div key={idx} className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                              <Input
                                label={`Option ${String.fromCharCode(65 + idx)}`}
                                value={editForm.options[idx]?.text || ''}
                                onChange={(e) => {
                                  const opts = [...editForm.options];
                                  if (!opts[idx]) opts[idx] = { text: '', latex: undefined, image: undefined };
                                  opts[idx].text = e.target.value;
                                  setEditForm(p => ({ ...p, options: opts }));
                                }}
                              />
                              <Input
                                label={`Option ${String.fromCharCode(65 + idx)} LaTeX`}
                                value={editForm.options[idx]?.latex || ''}
                                onChange={(e) => {
                                  const opts = [...editForm.options];
                                  if (!opts[idx]) opts[idx] = { text: '', latex: undefined, image: undefined };
                                  opts[idx].latex = e.target.value || undefined;
                                  setEditForm(p => ({ ...p, options: opts }));
                                }}
                                placeholder="LaTeX math if separate"
                              />
                              {editForm.options[idx] && (
                                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 text-xs">
                                  <span className="font-bold text-slate-400 block mb-0.5">Live Option Preview:</span>
                                  <RichOptionContent option={editForm.options[idx]} index={idx} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <Select
                          label="Correct Option Key"
                          options={[
                            { value: '', label: 'Select correct option' },
                            { value: '0', label: 'Option A' },
                            { value: '1', label: 'Option B' },
                            { value: '2', label: 'Option C' },
                            { value: '3', label: 'Option D' },
                          ]}
                          value={editForm.correct_option !== null ? editForm.correct_option.toString() : ''}
                          onChange={(e) => setEditForm(p => ({ ...p, correct_option: e.target.value !== '' ? parseInt(e.target.value, 10) : null }))}
                        />
                      </div>
                    )}

                    {editForm.question_type === 'numerical' && (
                      <Input
                        label="Numerical / Integer Answer Value"
                        type="number"
                        value={editForm.numerical_answer !== null ? editForm.numerical_answer.toString() : ''}
                        onChange={(e) => setEditForm(p => ({ ...p, numerical_answer: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                      />
                    )}

                    <Textarea
                      label="Explanation / Teacher Feedback"
                      value={editForm.explanation}
                      onChange={(e) => setEditForm(p => ({ ...p, explanation: e.target.value }))}
                      rows={3}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <Select
                        label="SaaS Subject Classification"
                        options={subjects.map(s => ({ value: s.id, label: s.name }))}
                        value={editForm.subject_id}
                        onChange={(e) => setEditForm(p => ({ ...p, subject_id: e.target.value, chapter_id: '' }))}
                      />
                      <Select
                        label="SaaS Chapter / Topic"
                        options={chapters
                          .filter(c => c.subject_id === editForm.subject_id)
                          .map(c => ({ value: c.id, label: c.name }))}
                        value={editForm.chapter_id}
                        onChange={(e) => setEditForm(p => ({ ...p, chapter_id: e.target.value }))}
                        placeholder="Select chapter"
                      />
                      <Select
                        label="SaaS Exam Type Classification"
                        options={examTypes.map(e => ({ value: e.id, label: e.name }))}
                        value={editForm.exam_type_id}
                        onChange={(e) => setEditForm(p => ({ ...p, exam_type_id: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Select
                        label="Target Class"
                        options={[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: c.toString(), label: `Class ${c}` }))}
                        value={editForm.class.toString()}
                        onChange={(e) => setEditForm(p => ({ ...p, class: parseInt(e.target.value, 10) }))}
                      />
                      <Select
                        label="Assessed Difficulty"
                        options={[
                          { value: 'easy', label: 'Easy' },
                          { value: 'medium', label: 'Medium' },
                          { value: 'hard', label: 'Hard' }
                        ]}
                        value={editForm.difficulty}
                        onChange={(e) => setEditForm(p => ({ ...p, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))}
                      />
                      <Input
                        label="Tags (Comma-separated)"
                        value={tagsText}
                        onChange={(e) => setTagsText(e.target.value)}
                        placeholder="e.g. thermodynamics, mechanics, physics"
                      />
                    </div>
                  </div>
                )}

                {/* Confidence Metrics Tab */}
                {activeTab === 'confidence' && (
                  <div className="space-y-6 max-w-3xl">
                    <Alert variant={activeQuestion.status === 'needs_review' ? 'warning' : 'info'} title="Fidelity Diagnostics">
                      {activeQuestion.status === 'needs_review'
                        ? 'Diagnostics flagged minor warnings during ingestion. Check math and structure gauges below.'
                        : 'Question ingestion exceeded fidelity requirements. Ready for final admin approval.'}
                    </Alert>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Metric 1 */}
                      <Card className="p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Parser Structural Confidence</span>
                            <span className={`text-sm font-bold ${getConfidenceColorClass(activeQuestion.parser_confidence || 1.0)}`}>
                              {Math.round((activeQuestion.parser_confidence || 1.0) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                            Determined by option markers structure alignment, length of stem, and block segmentation patterns.
                          </p>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getConfidenceBarClass(activeQuestion.parser_confidence || 1.0)}`}
                            style={{ width: `${(activeQuestion.parser_confidence || 1.0) * 100}%` }}
                          />
                        </div>
                      </Card>

                      {/* Metric 2 */}
                      <Card className="p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Semantic Reconstruction Confidence</span>
                            <span className={`text-sm font-bold ${getConfidenceColorClass(activeQuestion.semantic_confidence || 1.0)}`}>
                              {Math.round((activeQuestion.semantic_confidence || 1.0) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                            Scored based on statement formatting coherence, nested list structures, and question type accuracy.
                          </p>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getConfidenceBarClass(activeQuestion.semantic_confidence || 1.0)}`}
                            style={{ width: `${(activeQuestion.semantic_confidence || 1.0) * 100}%` }}
                          />
                        </div>
                      </Card>

                      {/* Metric 3 */}
                      <Card className="p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Math & LaTeX Preservation</span>
                            <span className={`text-sm font-bold ${getConfidenceColorClass(activeQuestion.math_preservation_confidence || 1.0)}`}>
                              {Math.round((activeQuestion.math_preservation_confidence || 1.0) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                            Checks for raw math placeholder replacement issues and unbalanced dollars or braces in KaTeX.
                          </p>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getConfidenceBarClass(activeQuestion.math_preservation_confidence || 1.0)}`}
                            style={{ width: `${(activeQuestion.math_preservation_confidence || 1.0) * 100}%` }}
                          />
                        </div>
                      </Card>

                      {/* Metric 4 */}
                      <Card className="p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Metadata Classification Confidence</span>
                            <span className={`text-sm font-bold ${getConfidenceColorClass(activeQuestion.metadata_confidence || 1.0)}`}>
                              {Math.round((activeQuestion.metadata_confidence || 1.0) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                            Integrity rating of AI-extracted taxonomy (Subject, Topic/Chapter, Class and Exam type tags).
                          </p>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getConfidenceBarClass(activeQuestion.metadata_confidence || 1.0)}`}
                            style={{ width: `${(activeQuestion.metadata_confidence || 1.0) * 100}%` }}
                          />
                        </div>
                      </Card>

                      {/* Metric 5 */}
                      <Card className="p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Reconstruction Fidelity</span>
                            <span className={`text-sm font-bold ${getConfidenceColorClass(activeQuestion.reconstruction_fidelity ?? 1.0)}`}>
                              {Math.round((activeQuestion.reconstruction_fidelity ?? 1.0) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                            Fidelity rating measuring equation translation correctness, visual image fallback dependencies, and document structure preservation.
                          </p>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getConfidenceBarClass(activeQuestion.reconstruction_fidelity ?? 1.0)}`}
                            style={{ width: `${(activeQuestion.reconstruction_fidelity ?? 1.0) * 100}%` }}
                          />
                        </div>
                      </Card>
                    </div>

                    {activeQuestion.extraction_warnings && activeQuestion.extraction_warnings.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Warnings Log</span>
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3.5 space-y-1.5">
                          {activeQuestion.extraction_warnings.map((warn: string, i: number) => (
                            <div key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5 leading-relaxed">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{warn}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Audit & Replay Timeline Tab */}
                {activeTab === 'audit' && (
                  <div className="space-y-6 max-w-3xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Revision Audit Trail</span>
                    
                    {(!activeQuestion.audit_history || activeQuestion.audit_history.length === 0) ? (
                      <EmptyState
                        title="No revision history"
                        description="This question was ingested and has no subsequent manual edits recorded."
                        icon={<History className="w-8 h-8 text-slate-300" />}
                      />
                    ) : (
                      <div className="relative border-l border-slate-200 dark:border-slate-700 ml-3.5 pl-5 space-y-6">
                        {activeQuestion.audit_history.map((hist: any, idx: number) => (
                          <div key={idx} className="relative">
                            <span className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-blue-600 dark:bg-blue-400 ring-4 ring-white dark:ring-slate-800" />
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                                Action: {hist.action?.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[10px] text-slate-400">•</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(hist.timestamp).toLocaleString()}
                              </span>
                            </div>
                            {hist.notes && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                                Reason/Note: "{hist.notes}"
                              </p>
                            )}
                            {hist.preSnapshot && hist.postSnapshot && (
                              <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
                                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded border border-slate-100 dark:border-slate-800">
                                  <span className="font-bold text-rose-600 dark:text-rose-400 block mb-1">Before edit:</span>
                                  <div className="line-clamp-3">{hist.preSnapshot.questionText}</div>
                                </div>
                                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded border border-slate-100 dark:border-slate-800">
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-1">After edit:</span>
                                  <div className="line-clamp-3">{hist.postSnapshot.questionText}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 p-8 shadow-sm">
              <EmptyState
                title="Select a question"
                description="Click a pending or review flagged question from the left sidebar queue to initiate moderation."
                icon={<HelpCircle className="w-12 h-12 text-slate-400" />}
              />
            </div>
          )}
        </div>
      )}

      {/* Rejection Reason Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Moderation Rejection Reason"
        size="md"
      >
        <div className="p-6 space-y-4">
          <Alert variant="warning">
            Please enter a descriptive reason for rejecting this question. This will be stored in the audit logs.
          </Alert>
          <Textarea
            label="Rejection Reason Notes"
            placeholder="e.g. Option C has corrupted equation syntax..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleRejectSubmit} disabled={!rejectReason}>
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
