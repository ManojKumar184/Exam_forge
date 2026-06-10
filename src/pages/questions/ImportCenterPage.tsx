import { useCallback, useEffect, useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Alert, Badge, Select, PageHeader } from '../../components/ui';
import {
  uploadQuestionFileApi,
  getUploadStatusApi,
  fetchUploadsApi,
  updateStagedQuestionApi,
  rejectStagedQuestionApi,
  commitStagedQuestionsApi,
  reprocessUploadApi,
  duplicateUploadSessionApi,
  getStagedQuestionDuplicatesApi,
} from '../../api/uploads';
import { createQuestionApi } from '../../api/questions';
import { getApiErrorMessage } from '../../api/client';
import { QuestionContentPreview } from '../../components/content/RichContent';
import { QuestionEditorForm } from '../../components/questions/QuestionEditorForm';
import {
  Upload,
  FileText,
  Image,
  CheckCircle,
  AlertCircle,
  X,
  ArrowRight,
  Search,
  History,
  Clipboard,
  Sparkles,
  RefreshCw,
  Copy,
  Edit2,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  PenSquare,
  Eye,
} from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  questionsExtracted: number;
  warnings: string[];
  error?: string;
}

export function ImportCenterPage() {
  const { profile } = useAuth();
  const { subjects, chapters, examTypes, fetchSubjects, fetchExamTypes, fetchChapters } = useDataStore();

  // Navigation & Tabs state
  const [activeTab, setActiveTab] = useState<'ingest' | 'staging' | 'history' | 'create'>('ingest');
  
  // Selected upload for staging view
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [uploadDetail, setUploadDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Ingestion settings
  const [uploadClass, setUploadClass] = useState('11');
  const [uploadSubjectId, setUploadSubjectId] = useState('');
  const [uploadExamTypeId, setUploadExamTypeId] = useState('');

  // File Ingest state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);



  // History Tab state
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterType, setHistoryFilterType] = useState('');
  const [historyFilterOwner, setHistoryFilterOwner] = useState('');

  // Staging Pagination & Selection state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedStagedIndices, setSelectedStagedIndices] = useState<number[]>([]);
  const [stagingFilter, setStagingFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'warnings'>('all');

  // Edit Modal state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Dynamic Duplicates check state
  const [checkingDuplicateIndex, setCheckingDuplicateIndex] = useState<number | null>(null);
  const [duplicateAnalysisMap, setDuplicateAnalysisMap] = useState<Record<number, any>>({});

  // Question preview modal state
  const [previewQuestion, setPreviewQuestion] = useState<any | null>(null);

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchUploadsApi();
      setHistoryList(data);
    } catch (err) {
      toast.error('Failed to load import history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadUploadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getUploadStatusApi(id);
      setUploadDetail(data);
      setCurrentPage(1);
      setSelectedStagedIndices([]);
      setDuplicateAnalysisMap({});
    } catch (err) {
      toast.error('Failed to load upload detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Poll active uploads
  const pollActiveUpload = async (id: string, fileItemId?: string) => {
    let finalUploadObj: any = null;
    let pollCount = 0;

    while (pollCount < 200) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        finalUploadObj = await getUploadStatusApi(id);
        
        if (fileItemId) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItemId
                ? {
                    ...f,
                    status: finalUploadObj.status,
                    progress: finalUploadObj.progress ?? 50,
                  }
                : f
            )
          );
        }

        if (finalUploadObj.status === 'completed' || finalUploadObj.status === 'failed') {
          break;
        }
      } catch (err) {
        break;
      }
      pollCount++;
    }

    if (finalUploadObj && finalUploadObj.status === 'completed') {
      toast.success(`Extraction complete! Loaded into Staging.`);
      // Update file status
      if (fileItemId) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItemId
              ? {
                  ...f,
                  status: 'completed',
                  progress: 100,
                  questionsExtracted: finalUploadObj.questions_extracted || 0,
                  warnings: finalUploadObj.extraction_warnings || [],
                }
              : f
          )
        );
      }
      // Switch view to staging
      setSelectedUploadId(id);
      setUploadDetail(finalUploadObj);
      setActiveTab('staging');
      loadHistory();
    } else {
      const errMsg = finalUploadObj?.processing_error || 'Extraction failed on server';
      if (fileItemId) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItemId
              ? { ...f, status: 'failed', error: errMsg, progress: 0 }
              : f
          )
        );
      }
      toast.error(errMsg);
    }
  };

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      status: 'pending',
      progress: 0,
      questionsExtracted: 0,
      warnings: [],
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
    },
    multiple: true,
  });

  const uploadFiles = async () => {
    setIsUploading(true);
    const pendingFiles = files.filter(f => f.status === 'pending');

    for (const fileItem of pendingFiles) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, status: 'uploading', progress: 10 } : f
        )
      );

      try {
        const result = await uploadQuestionFileApi(fileItem.file, {
          class: parseInt(uploadClass, 10),
          subject_id: uploadSubjectId || undefined,
          exam_type_id: uploadExamTypeId || undefined,
        });

        pollActiveUpload(result.upload.id, fileItem.id);
      } catch (err) {
        const message = getApiErrorMessage(err);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, status: 'failed', error: message } : f
          )
        );
        toast.error(message);
      }
    }
    setIsUploading(false);
  };

  // Staging operations
  const checkStagingQuestionDuplicates = async (index: number) => {
    if (!selectedUploadId) return;
    setCheckingDuplicateIndex(index);
    try {
      const result = await getStagedQuestionDuplicatesApi(selectedUploadId, index);
      setDuplicateAnalysisMap(prev => ({ ...prev, [index]: result }));
    } catch (err) {
      toast.error('Failed to run duplicate checks');
    } finally {
      setCheckingDuplicateIndex(null);
    }
  };

  const approveStagedQuestion = async (index: number) => {
    if (!selectedUploadId) return;
    try {
      const data = await commitStagedQuestionsApi(selectedUploadId, [index]);
      setUploadDetail(data);
      toast.success('Question committed to private workspace!');
      loadHistory();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const rejectStagedQuestion = async (index: number) => {
    if (!selectedUploadId) return;
    try {
      const data = await rejectStagedQuestionApi(selectedUploadId, index);
      setUploadDetail(data);
      toast.success(data.staged_questions?.[index]?.is_rejected ? 'Question rejected' : 'Question restored');
      loadHistory();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const bulkApprove = async () => {
    if (!selectedUploadId || selectedStagedIndices.length === 0) return;
    const loading = toast.loading('Committing selected questions to Workspace...');
    try {
      const data = await commitStagedQuestionsApi(selectedUploadId, selectedStagedIndices);
      setUploadDetail(data);
      setSelectedStagedIndices([]);
      toast.success('Selected questions committed to private workspace!', { id: loading });
      loadHistory();
    } catch (err) {
      toast.error(getApiErrorMessage(err), { id: loading });
    }
  };

  const bulkReject = async () => {
    if (!selectedUploadId || selectedStagedIndices.length === 0) return;
    let data = uploadDetail;
    const loading = toast.loading('Toggling rejection status...');
    try {
      for (const idx of selectedStagedIndices) {
        data = await rejectStagedQuestionApi(selectedUploadId, idx);
      }
      setUploadDetail(data);
      setSelectedStagedIndices([]);
      toast.success('Batch update complete', { id: loading });
      loadHistory();
    } catch (err) {
      toast.error(getApiErrorMessage(err), { id: loading });
    }
  };

  const handleReprocessSession = async () => {
    if (!selectedUploadId) return;
    const loading = toast.loading('Initiating session reprocessing...');
    try {
      const data = await reprocessUploadApi(selectedUploadId);
      toast.success('Reprocessing worker initiated.', { id: loading });
      pollActiveUpload(data.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err), { id: loading });
    }
  };

  const handleDuplicateSession = async () => {
    if (!selectedUploadId) return;
    const loading = toast.loading('Duplicating staging session...');
    try {
      const data = await duplicateUploadSessionApi(selectedUploadId);
      toast.success('Staging session duplicated.', { id: loading });
      setSelectedUploadId(data.id);
      setUploadDetail(data);
      loadHistory();
    } catch (err) {
      toast.error(getApiErrorMessage(err), { id: loading });
    }
  };

  // Edit inline staging question
  const openEditModal = (idx: number, q: any) => {
    setEditingIndex(idx);
    setEditForm({
      question_text: q.question_text || '',
      question_latex: q.question_latex || '',
      question_type: q.question_type || 'descriptive',
      difficulty: q.difficulty || 'medium',
      class: q.class || 11,
      year: q.year || null,
      marks: q.marks || null,
      subject_id: q.subject_id || '',
      chapter_id: q.chapter_id || '',
      exam_type_id: q.exam_type_id || '',
      correct_option: q.correct_option !== undefined ? q.correct_option : null,
      numerical_answer: q.numerical_answer !== undefined ? q.numerical_answer : null,
      explanation: q.explanation || '',
      answer_text: q.answer_text || '',
      tags: (q.tags || []).join(', '),
      options: (q.options || []).map((o: any) => ({
        text: typeof o === 'string' ? o : o.text || '',
        latex: typeof o === 'string' ? undefined : o.latex || undefined,
      })),
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedUploadId || editingIndex === null || !editForm) return;
    setIsSavingEdit(true);
    try {
      const payload = {
        ...editForm,
        year: editForm.year || null,
        marks: editForm.marks ? Number(editForm.marks) : null,
        tags: editForm.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        // Filter out empty options if descriptive/integer, else send options
        options: editForm.question_type === 'mcq' ? editForm.options : [],
      };
      
      const data = await updateStagedQuestionApi(selectedUploadId, editingIndex, payload);
      setUploadDetail(data);
      setEditingIndex(null);
      setEditForm(null);
      toast.success('Staged question updated successfully');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleOptionChange = (optIdx: number, val: string) => {
    if (!editForm) return;
    const newOpts = [...editForm.options];
    newOpts[optIdx] = { ...newOpts[optIdx], text: val };
    setEditForm({ ...editForm, options: newOpts });
  };

  // History filtering
  const filteredHistory = useMemo(() => {
    return historyList.filter(h => {
      const matchSearch = h.original_name.toLowerCase().includes(historySearch.toLowerCase()) ||
                          h.filename.toLowerCase().includes(historySearch.toLowerCase());
      const matchType = historyFilterType ? h.file_type === historyFilterType : true;
      const matchOwner = historyFilterOwner ? h.uploaded_by_user?.full_name?.toLowerCase().includes(historyFilterOwner.toLowerCase()) : true;
      return matchSearch && matchType && matchOwner;
    });
  }, [historyList, historySearch, historyFilterType, historyFilterOwner]);

  // Staging filtering & pagination
  const filteredStagedQuestions = useMemo(() => {
    if (!uploadDetail?.staged_questions) return [];
    return uploadDetail.staged_questions.map((q: any, idx: number) => ({ ...q, originalIndex: idx })).filter((q: any) => {
      if (stagingFilter === 'approved') return q.is_approved;
      if (stagingFilter === 'rejected') return q.is_rejected;
      if (stagingFilter === 'pending') return !q.is_approved && !q.is_rejected;
      if (stagingFilter === 'warnings') return q.extraction_warnings && q.extraction_warnings.length > 0;
      if (stagingFilter === 'validation') return q.validation_result?.issues?.length > 0;
      return true; // all
    });
  }, [uploadDetail, stagingFilter]);

  const paginatedStagedQuestions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStagedQuestions.slice(start, start + itemsPerPage);
  }, [filteredStagedQuestions, currentPage]);

  const totalPages = Math.ceil(filteredStagedQuestions.length / itemsPerPage) || 1;

  // Staging Quality Metrics calculations
  const metrics = useMemo(() => {
    if (!uploadDetail?.staged_questions) return { avgConfidence: 0, warningCount: 0, validationIssueCount: 0, approved: 0, rejected: 0, pending: 0 };
    const qList = uploadDetail.staged_questions;
    const approved = qList.filter((q: any) => q.is_approved).length;
    const rejected = qList.filter((q: any) => q.is_rejected).length;
    const pending = qList.filter((q: any) => !q.is_approved && !q.is_rejected).length;
    const warningCount = qList.filter((q: any) => q.extraction_warnings?.length > 0).length;
    const validationIssueCount = qList.filter((q: any) => q.validation_result?.issues?.length > 0).length;

    let confSum = 0;
    qList.forEach((q: any) => {
      confSum += (q.parser_confidence || q.ai_confidence || 80);
    });
    const avgConfidence = qList.length > 0 ? Math.round(confSum / qList.length) : 0;

    return { avgConfidence, warningCount, validationIssueCount, approved, rejected, pending };
  }, [uploadDetail]);

  const getFileTypeIcon = (type: string) => {
    if (type === 'pdf') return <FileText className="w-4 h-4 text-red-500" />;
    if (type === 'docx') return <FileText className="w-4 h-4 text-blue-500" />;
    if (type === 'image') return <Image className="w-4 h-4 text-green-500" />;
    return <Clipboard className="w-4 h-4 text-indigo-500" />;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        title="Import Center"
        subtitle="Universal portal for questions ingestion, structured extraction staging, and manual paste processing."
      />

      {/* Tab Selector Header */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-1.5 rounded-xl shadow-card gap-1">
        <button
          onClick={() => setActiveTab('ingest')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'ingest'
              ? 'bg-blue-600 text-white shadow-button scale-100'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <Upload className="w-4 h-4" />
          Ingest Center
        </button>
        <button
          onClick={() => {
            setActiveTab('staging');
            if (selectedUploadId && (!uploadDetail || uploadDetail.id !== selectedUploadId)) {
              loadUploadDetail(selectedUploadId);
            }
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all relative ${
            activeTab === 'staging'
              ? 'bg-blue-600 text-white shadow-button scale-100'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Staging Queue
          {uploadDetail && metrics.pending > 0 && (
            <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 animate-pulse">
              {metrics.pending}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('create'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'create'
              ? 'bg-emerald-600 text-white shadow-button scale-100'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <PenSquare className="w-4 h-4" />
          Create
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            loadHistory();
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-blue-600 text-white shadow-button scale-100'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <History className="w-4 h-4" />
          Import History
        </button>
      </div>

      {/* TABS CONTAINER */}
      <div>
        {/* INGEST TAB */}
        {activeTab === 'ingest' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              {/* File Dropzone */}
              <Card className="p-6 space-y-4 shadow-card border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between border-b dark:border-slate-750 pb-2">
                  <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    File Upload Ingest
                  </h2>
                  <span className="text-xs text-slate-500">Supports: DOCX, PDF, Images</span>
                </div>

                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
                    ${
                      isDragActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    }
                  `}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-10 h-10 mx-auto text-slate-400 mb-4 animate-bounce" />
                  {isDragActive ? (
                    <p className="text-blue-600 dark:text-blue-400 font-semibold">Drop files here...</p>
                  ) : (
                    <>
                      <p className="text-slate-700 dark:text-slate-350 font-medium mb-1">
                        Drag & drop files here, or click to browse
                      </p>
                      <p className="text-xs text-slate-400">PDF, DOCX, or scanned exam question paper images.</p>
                    </>
                  )}
                </div>
              </Card>

              {/* File Items queue */}
              {files.length > 0 && (
                <Card className="p-5 space-y-3 shadow-card">
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm">Active Ingestion Uploads</h3>
                  <div className="space-y-3">
                    {files.map((fileItem) => (
                      <div key={fileItem.id} className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border dark:border-slate-750">
                        {getFileTypeIcon(fileItem.file.name.split('.').pop() || '')}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-white text-xs truncate">
                            {fileItem.file.name}
                          </p>
                          <p className="text-[10px] text-slate-400">{(fileItem.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          {fileItem.status === 'processing' && (
                            <div className="w-full bg-slate-250 dark:bg-slate-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                              <div
                                className="bg-blue-600 h-full rounded-full transition-all duration-300 animate-pulse"
                                style={{ width: `${fileItem.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <Badge
                          variant={
                            fileItem.status === 'completed'
                              ? 'success'
                              : fileItem.status === 'failed'
                              ? 'error'
                              : fileItem.status === 'processing'
                              ? 'info'
                              : 'default'
                          }
                        >
                          {fileItem.status}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setFiles([])}>Clear queue</Button>
                    <Button
                      size="sm"
                      onClick={uploadFiles}
                      isLoading={isUploading}
                      disabled={isUploading || files.every(f => f.status !== 'pending')}
                    >
                      Start Processing
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            {/* Ingestion Settings Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="p-5 space-y-4 shadow-card border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/10">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm pb-2 border-b dark:border-slate-750 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-500" />
                  Import Settings
                </h3>

                <Select
                  label="Default Target Class"
                  options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: String(c), label: `Class ${c}` }))}
                  value={uploadClass}
                  onChange={(e) => setUploadClass(e.target.value)}
                />
                <Select
                  label="Subject Map"
                  options={[{ value: '', label: 'Auto-detect Curricula' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
                  value={uploadSubjectId}
                  onChange={(e) => setUploadSubjectId(e.target.value)}
                />
                <Select
                  label="Exam Pattern Type"
                  options={[{ value: '', label: 'Auto-detect Exam Type' }, ...examTypes.map((e) => ({ value: e.id, label: e.name }))]}
                  value={uploadExamTypeId}
                  onChange={(e) => setUploadExamTypeId(e.target.value)}
                />

                <Alert variant="info" title="How Ingest Staging Works">
                  <div className="text-[11px] text-slate-500 space-y-1.5">
                    <p>1. Files/text are parsed in chunks on the server.</p>
                    <p>2. Questions are stored temporarily in a **Staging Area**.</p>
                    <p>3. Review the extracted outputs, options, and latex rendering.</p>
                    <p>4. Approve questions to save them privately to **My Workspace**.</p>
                  </div>
                </Alert>
              </Card>
            </div>
          </div>
        )}

        {/* STAGING QUEUE TAB */}
        {activeTab === 'staging' && (
          <div className="space-y-6">
            {/* Header & Meta Panel */}
            {loadingDetail ? (
              <Card className="p-8 text-center border border-slate-100 dark:border-slate-800">
                <div className="text-center py-6 text-slate-400">Loading staging details...</div>
              </Card>
            ) : uploadDetail ? (
              <Card className="p-5 shadow-card border dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b dark:border-slate-750 pb-4 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      {getFileTypeIcon(uploadDetail.file_type)}
                      Staging: {uploadDetail.original_name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Uploaded by: <span className="font-semibold">{uploadDetail.uploaded_by_user?.full_name || 'Faculty'}</span> · Ingest date: {new Date(uploadDetail.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      onClick={handleReprocessSession}
                    >
                      Reprocess Ingest
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Copy className="w-3.5 h-3.5" />}
                      onClick={handleDuplicateSession}
                    >
                      Duplicate Staging
                    </Button>
                  </div>
                </div>

                {/* VERSIONING & PERFORMANCE STATS */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border dark:border-slate-750">
                    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Extracted</div>
                    <div className="text-xl font-bold text-slate-800 dark:text-white mt-0.5">{uploadDetail.questions_extracted}</div>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                    <div className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">Approved</div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.approved}</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
                    <div className="text-red-600 dark:text-red-400 text-[10px] font-bold uppercase tracking-wider">Rejected</div>
                    <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-0.5">{metrics.rejected}</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                    <div className="text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">Workspace Pending</div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{metrics.pending}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border dark:border-slate-750">
                    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Avg Confidence</div>
                    <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{metrics.avgConfidence}%</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border dark:border-slate-750">
                    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Warning Flags</div>
                    <div className="text-xl font-bold text-amber-500 mt-0.5">{metrics.warningCount}</div>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900/30">
                    <div className="text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider">Validation Issues</div>
                    <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{metrics.validationIssueCount}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 mt-3 pt-3 border-t dark:border-slate-750">
                  <span>Reconstruction: <strong className="text-slate-500">{uploadDetail.reconstruction_version}</strong></span>
                  <span>·</span>
                  <span>Classification Model: <strong className="text-slate-500">{uploadDetail.classification_version}</strong></span>
                  <span>·</span>
                  <span>Class Override: <strong className="text-slate-500">{uploadDetail.upload_options?.class || 'None'}</strong></span>
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center border border-slate-100 dark:border-slate-800">
                <Sparkles className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <h3 className="font-bold text-slate-700 dark:text-slate-350 text-sm">No Active Staging Session</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Upload a document or paste text in Ingest Center, or select a past import from the Import History tab.
                </p>
                <Button size="sm" className="mt-4" onClick={() => setActiveTab('ingest')}>Go to Ingestion</Button>
              </Card>
            )}

            {/* STAGING QUEUE ITEMS */}
            {uploadDetail && (
              <div className="space-y-4">
                {/* Filters and Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white/60 dark:bg-slate-800/60 p-3 rounded-xl shadow-sm border dark:border-slate-750">
                  <div className="flex items-center gap-1">
                    {(['all', 'pending', 'approved', 'rejected', 'warnings', 'validation'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          setStagingFilter(filter);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                          stagingFilter === filter
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  {selectedStagedIndices.length > 0 && (
                    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-lg border border-blue-100 dark:border-blue-800">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                        {selectedStagedIndices.length} selected
                      </span>
                      <Button size="xs" onClick={bulkApprove} leftIcon={<Check className="w-3 h-3" />}>Bulk Save</Button>
                      <Button size="xs" variant="ghost" onClick={bulkReject} leftIcon={<Trash2 className="w-3 h-3" />} className="text-red-500">Bulk Reject</Button>
                    </div>
                  )}
                </div>

                {/* Question List Cards */}
                {paginatedStagedQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {paginatedStagedQuestions.map((q: any) => {
                      const isSelected = selectedStagedIndices.includes(q.originalIndex);
                      const duplicateAnalysis = duplicateAnalysisMap[q.originalIndex];

                      return (
                        <Card
                          key={q.originalIndex}
                          className={`p-5 transition-all shadow-sm border ${
                            q.is_approved
                              ? 'border-emerald-200 bg-emerald-50/10 dark:border-emerald-800/30'
                              : q.is_rejected
                              ? 'border-red-200 bg-red-50/10 dark:border-red-800/30 opacity-70'
                              : isSelected
                              ? 'border-blue-400 dark:border-blue-700 bg-blue-50/5 dark:bg-blue-900/5'
                              : 'border-slate-200 dark:border-slate-850 hover:border-slate-350'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            {/* Checkbox */}
                            {!q.is_approved && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStagedIndices(prev => [...prev, q.originalIndex]);
                                  } else {
                                    setSelectedStagedIndices(prev => prev.filter(i => i !== q.originalIndex));
                                  }
                                }}
                                className="mt-1 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            )}

                            {/* Card Body */}
                            <div className="flex-1 min-w-0 space-y-3">
                              {/* Metadata Badges Header */}
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b dark:border-slate-750 pb-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-500">#{q.originalIndex + 1}</span>
                                  <Badge variant="default" size="sm">Class {q.class}</Badge>
                                  {q.question_type && <Badge variant="info" size="sm">{q.question_type.toUpperCase()}</Badge>}
                                  {q.difficulty && (
                                    <Badge
                                      variant={q.difficulty === 'easy' ? 'success' : q.difficulty === 'medium' ? 'info' : 'error'}
                                      size="sm"
                                    >
                                      {q.difficulty.toUpperCase()}
                                    </Badge>
                                  )}
                                  {q.is_approved && <Badge variant="success" size="sm">Workspace Saved</Badge>}
                                  {q.is_rejected && <Badge variant="error" size="sm">Rejected</Badge>}
                                </div>

                                <div className="text-xs text-indigo-500 font-semibold bg-indigo-50/50 dark:bg-indigo-950/20 px-2 py-0.5 rounded border dark:border-indigo-900/30">
                                  Confidence: {q.parser_confidence ? Math.round(q.parser_confidence * 100) : 80}%
                                </div>
                              </div>

                              {/* Review Required Banner */}
                              {(q.parser_confidence < 0.7 || q.status === 'needs_review') && (
                                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 rounded border border-rose-200 dark:border-rose-800/30">
                                  <div className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5 animate-pulse">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    Review Required (Low confidence extraction or format warnings)
                                  </div>
                                </div>
                              )}

                              {/* Structural Validation Results */}
                              {q.validation_result && !q.validation_result.valid && (
                                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 rounded border border-rose-200/50 dark:border-rose-800/30 space-y-1">
                                  <div className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Structural Validation ({q.validation_result.issues.length} issue{q.validation_result.issues.length !== 1 ? 's' : ''}):
                                  </div>
                                  {q.validation_result.issues.map((issue: string, i: number) => (
                                    <p key={i} className="text-[11px] text-rose-700 dark:text-rose-300">· {issue}</p>
                                  ))}
                                </div>
                              )}

                              {/* Ingestion Warning List */}
                              {q.extraction_warnings && q.extraction_warnings.length > 0 && (
                                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200/50 dark:border-amber-800/30 space-y-1">
                                  <div className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Parser Warnings:
                                  </div>
                                  {q.extraction_warnings.map((w: string, i: number) => (
                                    <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300">· {w}</p>
                                  ))}
                                </div>
                              )}

                              {/* Question Contents Preview */}
                              <QuestionContentPreview
                                question={q}
                                showOptions
                                showCorrect
                                showExplanation
                              />

                              {/* View/Preview button */}
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => setPreviewQuestion(q)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 px-2.5 py-1 rounded-lg border border-indigo-200/50 dark:border-indigo-800/30 transition-all hover:shadow-sm"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Preview
                                </button>
                              </div>

                              {/* Duplicate Protection Display */}
                              {q.duplicate_confidence !== null && (
                                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border dark:border-slate-750 mt-2">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-350 flex items-center gap-1.5">
                                      <Info className="w-3.5 h-3.5 text-blue-500" />
                                      Staging Duplicate Analysis: Duplicate Confidence: <span className="font-bold text-indigo-600 dark:text-indigo-400">{Math.round((q.duplicate_confidence || 0) * 100)}%</span>
                                    </div>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      isLoading={checkingDuplicateIndex === q.originalIndex}
                                      onClick={() => checkStagingQuestionDuplicates(q.originalIndex)}
                                    >
                                      Check Latest
                                    </Button>
                                  </div>

                                  {/* Possible Matches lists */}
                                  {(duplicateAnalysis || q.possible_matches?.length > 0) && (
                                    <div className="mt-2 pl-4 border-l border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-slate-500">
                                      <div className="text-[10px] uppercase font-bold text-slate-400">Possible Matches:</div>
                                      {(duplicateAnalysis?.possibleMatches || q.possible_matches || []).map((m: any, i: number) => (
                                        <div key={i} className="flex justify-between gap-4 py-0.5 border-b dark:border-slate-800/50">
                                          <span className="truncate max-w-lg">· Q-ID: {m.id} | "{m.question_text}"</span>
                                          <span className="font-semibold text-indigo-600 shrink-0">Confidence: {Math.round(m.confidence * 100)}% ({m.method})</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Actions Toolbar */}
                              {!q.is_approved && (
                                <div className="flex justify-end gap-2 border-t dark:border-slate-750 pt-3 mt-3">
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    leftIcon={<Edit2 className="w-3 h-3" />}
                                    onClick={() => openEditModal(q.originalIndex, q)}
                                  >
                                    Edit Question
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    leftIcon={<Trash2 className="w-3 h-3" />}
                                    className={q.is_rejected ? 'text-green-600' : 'text-red-500'}
                                    onClick={() => rejectStagedQuestion(q.originalIndex)}
                                  >
                                    {q.is_rejected ? 'Restore' : 'Reject'}
                                  </Button>
                                  {!q.is_rejected && (
                                    <Button
                                      size="xs"
                                      leftIcon={<Check className="w-3 h-3" />}
                                      onClick={() => approveStagedQuestion(q.originalIndex)}
                                    >
                                      Approve & Save
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}

                    {/* Pagination Footer */}
                    <div className="flex items-center justify-between border-t dark:border-slate-750 pt-4 bg-white/40 dark:bg-slate-800/10 p-3 rounded-lg">
                      <span className="text-xs text-slate-500">
                        Showing {itemsPerPage * (currentPage - 1) + 1} - {Math.min(itemsPerPage * currentPage, filteredStagedQuestions.length)} of {filteredStagedQuestions.length} staging items
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
                          leftIcon={<ChevronLeft className="w-4 h-4" />}
                        >
                          Previous
                        </Button>
                        <span className="text-xs self-center px-2 text-slate-650 font-medium">Page {currentPage} of {totalPages}</span>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))}
                          rightIcon={<ChevronRight className="w-4 h-4" />}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Card className="p-8 text-center border dark:border-slate-800">
                    <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">All Clear!</h3>
                    <p className="text-xs text-slate-400 mt-1">No staged questions matching the selected filters.</p>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* CREATE TAB — Manual Question Authoring */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            <QuestionEditorForm
              initial={undefined}
              subjects={subjects}
              chapters={chapters}
              examTypes={examTypes}
              submitLabel="Create Question"
              onCancel={() => setActiveTab('ingest')}
              onSubmit={async (payload) => {
                const res = await createQuestionApi(payload as any);
                if (!res) throw new Error('Create failed');
                toast.success('Question created successfully!');
                setActiveTab('ingest');
              }}
            />
          </div>
        )}

        {/* IMPORT HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* History Filters */}
            <Card className="p-4 shadow-card border dark:border-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search by file name..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Select
                  value={historyFilterType}
                  onChange={(e) => setHistoryFilterType(e.target.value)}
                  options={[
                    { value: '', label: 'All Ingest Types' },
                    { value: 'docx', label: 'Word (DOCX)' },
                    { value: 'pdf', label: 'PDF Paper' },
                    { value: 'image', label: 'OCR Image' },
                    { value: 'manual', label: 'Manual Import' },
                  ]}
                />
                {profile?.role === 'super_admin' && (
                  <input
                    type="text"
                    placeholder="Filter by owner..."
                    value={historyFilterOwner}
                    onChange={(e) => setHistoryFilterOwner(e.target.value)}
                    className="w-full px-4 py-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setHistorySearch(''); setHistoryFilterType(''); setHistoryFilterOwner(''); }}>Reset Filters</Button>
                </div>
              </div>
            </Card>

            {/* History Grid */}
            {loadingHistory ? (
              <div className="text-center py-12 text-slate-400">Loading history logs...</div>
            ) : filteredHistory.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredHistory.map((h) => {
                  const approved = h.questions_approved ?? 0;
                  const total = h.questions_extracted ?? 0;
                  return (
                    <Card key={h.id} className="p-5 border dark:border-slate-800 flex flex-col justify-between shadow-sm">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between border-b dark:border-slate-750 pb-2 gap-2">
                          <h3 className="font-bold text-slate-800 dark:text-white text-xs truncate flex items-center gap-2">
                            {getFileTypeIcon(h.file_type)}
                            {h.original_name}
                          </h3>
                          <Badge
                            variant={h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'info'}
                          >
                            {h.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div><span className="text-slate-400">Owner:</span> <strong className="text-slate-650 dark:text-slate-350">{h.uploaded_by_user?.full_name || 'Faculty'}</strong></div>
                          <div><span className="text-slate-400">Date:</span> <strong className="text-slate-650 dark:text-slate-350">{new Date(h.created_at).toLocaleDateString()}</strong></div>
                          <div><span className="text-slate-400">Total Extracted:</span> <strong className="text-slate-650 dark:text-slate-350">{total}</strong></div>
                          <div><span className="text-slate-400">Saved Workspace:</span> <strong className="text-emerald-600">{approved}</strong></div>
                        </div>

                        <div className="text-[10px] text-slate-400">
                          Versions: Reconstruction: {h.reconstruction_version} | Classify: {h.classification_version}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 border-t dark:border-slate-750 pt-3 mt-3">
                        <Button
                          size="xs"
                          variant="ghost"
                          leftIcon={<RefreshCw className="w-3 h-3" />}
                          onClick={async () => {
                            const loading = toast.loading('Initiating re-run extraction...');
                            try {
                              const res = await reprocessUploadApi(h.id);
                              toast.success('Reprocess task initiated', { id: loading });
                              pollActiveUpload(res.id);
                            } catch (err) {
                              toast.error(getApiErrorMessage(err), { id: loading });
                            }
                          }}
                        >
                          Reprocess
                        </Button>
                        <Button
                          size="xs"
                          leftIcon={<ArrowRight className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setSelectedUploadId(h.id);
                            loadUploadDetail(h.id);
                            setActiveTab('staging');
                          }}
                        >
                          Revisit Staging
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-8 text-center border dark:border-slate-800">
                <History className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">No History Found</h3>
                <p className="text-xs text-slate-400 mt-1">No past ingestion uploads or pastes match your query.</p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* QUESTION PREVIEW MODAL */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto relative bg-white dark:bg-slate-800 border dark:border-slate-750 shadow-2xl rounded-xl">
            <button
              onClick={() => setPreviewQuestion(null)}
              className="sticky top-0 float-right z-10 p-1.5 bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2 pb-3 border-b dark:border-slate-750">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                  #{previewQuestion.originalIndex + 1}
                </span>
                <Badge variant="default" size="sm">Class {previewQuestion.class}</Badge>
                {previewQuestion.question_type && <Badge variant="info" size="sm">{previewQuestion.question_type.toUpperCase()}</Badge>}
                {previewQuestion.difficulty && (
                  <Badge variant={previewQuestion.difficulty === 'easy' ? 'success' : previewQuestion.difficulty === 'medium' ? 'info' : 'error'} size="sm">
                    {previewQuestion.difficulty.toUpperCase()}
                  </Badge>
                )}
                {previewQuestion.is_approved && <Badge variant="success" size="sm">Saved</Badge>}
              </div>
              <QuestionContentPreview
                question={previewQuestion}
                showOptions
                showCorrect
                showExplanation
              />
              <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-slate-750 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Subject</p>
                  <p className="font-medium text-slate-900 dark:text-white">{previewQuestion.subject_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Difficulty</p>
                  <p className="font-medium text-slate-900 dark:text-white capitalize">{previewQuestion.difficulty || 'N/A'}</p>
                </div>
                {previewQuestion.marks && (
                  <div>
                    <p className="text-slate-500 text-xs">Marks</p>
                    <p className="font-medium text-slate-900 dark:text-white">{previewQuestion.marks}</p>
                  </div>
                )}
                {previewQuestion.estimated_time && (
                  <div>
                    <p className="text-slate-500 text-xs">Est. Time</p>
                    <p className="font-medium text-slate-900 dark:text-white">{previewQuestion.estimated_time}s</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* QUESTION INLINE EDIT MODAL */}
      {editingIndex !== null && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4 bg-white dark:bg-slate-800 border dark:border-slate-750 shadow-2xl relative">
            <button
              onClick={() => { setEditingIndex(null); setEditForm(null); }}
              className="absolute right-4 top-4 p-1 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-1.5 border-b dark:border-slate-750 pb-2">
              <Edit2 className="w-5 h-5 text-blue-500" />
              Edit Staging Question Details
            </h3>

            {/* Row 1: Type, Difficulty, Class */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Question Type"
                value={editForm.question_type}
                onChange={(e) => setEditForm({ ...editForm, question_type: e.target.value })}
                options={[
                  { value: 'mcq', label: 'Multiple Choice (MCQ)' },
                  { value: 'descriptive', label: 'Descriptive' },
                  { value: 'numerical', label: 'Numerical Answer' },
                ]}
              />
              <Select
                label="Difficulty"
                value={editForm.difficulty}
                onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                options={[
                  { value: 'easy', label: 'Easy' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'hard', label: 'Hard' },
                ]}
              />
              <Select
                label="Class"
                value={String(editForm.class)}
                onChange={(e) => setEditForm({ ...editForm, class: Number(e.target.value) })}
                options={[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: String(c), label: `Class ${c}` }))}
              />
            </div>

            {/* Row 2: Subject, Chapter, Exam Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Subject"
                value={editForm.subject_id}
                onChange={(e) => {
                  setEditForm({ ...editForm, subject_id: e.target.value, chapter_id: '' });
                  if (e.target.value) fetchChapters(e.target.value);
                }}
                options={[
                  { value: '', label: 'Auto-detected' },
                  ...subjects.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <Select
                label="Chapter"
                value={editForm.chapter_id}
                onChange={(e) => setEditForm({ ...editForm, chapter_id: e.target.value })}
                options={[
                  { value: '', label: 'Not specified' },
                  ...chapters
                    .filter((c: any) => c.subject_id === editForm.subject_id)
                    .map((c: any) => ({ value: c.id, label: c.chapter_number ? `${c.chapter_number}. ${c.name}` : c.name })),
                ]}
                disabled={!editForm.subject_id}
              />
              <Select
                label="Exam Type"
                value={editForm.exam_type_id}
                onChange={(e) => setEditForm({ ...editForm, exam_type_id: e.target.value })}
                options={[
                  { value: '', label: 'Auto-detected' },
                  ...examTypes.map((e) => ({ value: e.id, label: e.name })),
                ]}
              />
            </div>

            {/* Row 3: Marks, Year */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Marks (optional)</label>
                <input
                  type="number"
                  value={editForm.marks !== null ? editForm.marks : ''}
                  onChange={(e) => setEditForm({ ...editForm, marks: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                  className="w-full p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Year (optional, e.g. [2024])</label>
                <input
                  type="text"
                  value={editForm.year !== null ? editForm.year : ''}
                  onChange={(e) => setEditForm({ ...editForm, year: e.target.value !== '' ? e.target.value : null })}
                  placeholder="[2024] or [Jan 2024]"
                  className="w-full p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Question STEM text</label>
              <textarea
                value={editForm.question_text}
                onChange={(e) => setEditForm({ ...editForm, question_text: e.target.value })}
                rows={4}
                className="w-full p-2.5 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm font-sans"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">LaTeX Formula override (optional)</label>
              <input
                type="text"
                value={editForm.question_latex}
                onChange={(e) => setEditForm({ ...editForm, question_latex: e.target.value })}
                className="w-full p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm font-mono"
              />
            </div>

            {/* MCQ Options inputs */}
            {editForm.question_type === 'mcq' && (
              <div className="space-y-2 border-t dark:border-slate-750 pt-3">
                <label className="text-xs font-bold text-slate-400">MCQ Options list</label>
                <div className="grid grid-cols-1 gap-2">
                  {editForm.options.map((opt: any, optIdx: number) => (
                    <div key={optIdx} className="flex flex-col gap-1 p-2 border dark:border-slate-750 rounded-lg bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-500 w-5 shrink-0">{String.fromCharCode(65 + optIdx)}.</span>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => handleOptionChange(optIdx, e.target.value)}
                          className="flex-1 p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
                          placeholder="Option text"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Select
                  label="Correct Option Index"
                  value={editForm.correct_option !== null ? String(editForm.correct_option) : ''}
                  onChange={(e) => setEditForm({ ...editForm, correct_option: e.target.value !== '' ? parseInt(e.target.value, 10) : null })}
                  options={[
                    { value: '', label: 'None Selected' },
                    ...editForm.options.map((_: any, i: number) => ({ value: String(i), label: `Option ${String.fromCharCode(65 + i)}` }))
                  ]}
                />
              </div>
            )}

            {/* Numerical Answer input */}
            {editForm.question_type === 'numerical' && (
              <div className="space-y-2 border-t dark:border-slate-755 pt-3">
                <label className="text-xs font-bold text-slate-400">Numerical Value Answer</label>
                <input
                  type="number"
                  step="any"
                  value={editForm.numerical_answer !== null ? editForm.numerical_answer : ''}
                  onChange={(e) => setEditForm({ ...editForm, numerical_answer: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                  className="w-full p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
              </div>
            )}

            {/* Answer text for descriptive */}
            {editForm.question_type === 'descriptive' && (
              <div className="space-y-1 border-t dark:border-slate-750 pt-3">
                <label className="text-xs font-bold text-slate-400">Answer Text (for descriptive)</label>
                <textarea
                  value={editForm.answer_text}
                  onChange={(e) => setEditForm({ ...editForm, answer_text: e.target.value })}
                  rows={2}
                  className="w-full p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Explanation / Solutions Text</label>
              <textarea
                value={editForm.explanation}
                onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                rows={2}
                className="w-full p-2.5 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Comma Separated Tags</label>
              <input
                type="text"
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                className="w-full p-2 border dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 border-t dark:border-slate-750 pt-3">
              <Button variant="ghost" onClick={() => { setEditingIndex(null); setEditForm(null); }}>Cancel</Button>
              <Button onClick={handleSaveEdit} isLoading={isSavingEdit}>Save Staged Question</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
