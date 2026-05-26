import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useDataStore } from '../../stores/dataStore';
import { Card, Button, Alert, Badge, Select } from '../../components/ui';
import { uploadQuestionFileApi } from '../../api/uploads';
import { getApiErrorMessage, apiClient } from '../../api/client';
import {
  Upload,
  FileText,
  File,
  Image,
  CheckCircle,
  AlertCircle,
  X,
  ArrowRight,
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

interface PollingAttempt {
  attemptCount: number;
  timestamp: string;
  stage: string;
  progress: number;
  latencyMs: number;
  cacheHeaders: Record<string, string>;
  stale: boolean;
}

interface FileDiagnostics {
  pollingAttempts: PollingAttempt[];
  stageLogs: string[];
}

export function UploadQuestionsPage() {
  const { subjects, examTypes, fetchSubjects, fetchExamTypes } = useDataStore();
  const [uploadClass, setUploadClass] = useState('11');
  const [uploadSubjectId, setUploadSubjectId] = useState('');
  const [uploadExamTypeId, setUploadExamTypeId] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<string, FileDiagnostics>>({});

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
  }, []);

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

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFiles = async () => {
    setIsUploading(true);
    setUploadComplete(false);

    for (const fileItem of files) {
      if (fileItem.status !== 'pending') continue;

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

        const uploadId = result.upload.id;
        let finalUpload = result.upload;
        let pollCount = 0;

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, status: 'processing', progress: 15 } : f
          )
        );

        while (finalUpload.status === 'pending' || finalUpload.status === 'processing') {
          // Poll every 1.5 seconds
          await new Promise((resolve) => setTimeout(resolve, 1500));
          
          const startTime = performance.now();
          const response = await apiClient.get<{ success: boolean; data: any }>(`/uploads/${uploadId}`);
          const latencyMs = Math.round(performance.now() - startTime);
          finalUpload = response.data.data;
          
          const cacheControl = String(response.headers['cache-control'] || '');
          const pragma = String(response.headers['pragma'] || '');
          const expires = String(response.headers['expires'] || '');
          
          const attemptTime = new Date().toLocaleTimeString();
          pollCount++;
          
          setDiagnosticsMap((prev) => {
            const prevList = prev[fileItem.id]?.pollingAttempts || [];
            const last = prevList[prevList.length - 1];
            const isStale = last ? (last.progress === finalUpload.progress && last.stage === finalUpload.processing_stage) : false;
            
            const newAttempt: PollingAttempt = {
              attemptCount: pollCount,
              timestamp: attemptTime,
              stage: finalUpload.processing_stage || finalUpload.status,
              progress: finalUpload.progress ?? 0,
              latencyMs,
              cacheHeaders: {
                'Cache-Control': cacheControl,
                'Pragma': pragma,
                'Expires': expires,
              },
              stale: isStale,
            };
            
            return {
              ...prev,
              [fileItem.id]: {
                pollingAttempts: [...prevList, newAttempt],
                stageLogs: finalUpload.stage_logs || [],
              },
            };
          });
          
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id
                ? {
                    ...f,
                    status: finalUpload.status === 'completed' ? 'completed' : finalUpload.status === 'failed' ? 'failed' : 'processing',
                    progress: finalUpload.progress ?? 50,
                  }
                : f
            )
          );

          pollCount++;
          if (pollCount > 200) {
            throw new Error('Upload extraction timed out on server');
          }
        }

        if (finalUpload.status === 'failed') {
          throw new Error(finalUpload.processing_error || 'Extraction failed');
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: 'completed',
                  progress: 100,
                  questionsExtracted: finalUpload.questions_extracted || 0,
                  warnings: finalUpload.extraction_warnings || [],
                }
              : f
          )
        );

        if (finalUpload.extraction_warnings?.length) {
          toast(finalUpload.extraction_warnings.join('. '), { icon: '⚠️' });
        }
        toast.success(`Extracted ${finalUpload.questions_extracted} questions from ${fileItem.file.name}`);
      } catch (error) {
        const message = getApiErrorMessage(error);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, status: 'failed', error: message, progress: 0 }
              : f
          )
        );
        toast.error(message);
      }
    }

    setIsUploading(false);
    setUploadComplete(true);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
    if (file.type.includes('word') || file.name.endsWith('.docx'))
      return <FileText className="w-8 h-8 text-blue-500" />;
    if (file.type.includes('image')) return <Image className="w-8 h-8 text-green-500" />;
    return <File className="w-8 h-8 text-slate-500" />;
  };

  const totalQuestions = files.reduce((sum, f) => sum + f.questionsExtracted, 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Upload Question Bank</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Upload PDF or DOCX files — questions are extracted and queued for admin review
        </p>
      </div>

      <Alert variant="info" title="How it works">
        <ol className="list-decimal list-inside space-y-1 mt-2 text-sm">
          <li>Upload PDF or DOCX question papers</li>
          <li>Server parses and extracts structured questions (no fake data)</li>
          <li>Scanned PDFs and images use OCR (Tesseract) — verify in Question Bank</li>
          <li>Uncertain extractions are marked <strong>needs_review</strong></li>
          <li>Approve questions in the Question Bank before faculty can use them</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Scanned PDFs and images require OCR (Phase 4). Image-only uploads are not supported yet.
        </p>
      </Alert>

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Default class"
            options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: String(c), label: `Class ${c}` }))}
            value={uploadClass}
            onChange={(e) => setUploadClass(e.target.value)}
          />
          <Select
            label="Subject (recommended)"
            options={[{ value: '', label: 'Auto-detect' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
            value={uploadSubjectId}
            onChange={(e) => setUploadSubjectId(e.target.value)}
          />
          <Select
            label="Exam type (recommended)"
            options={[{ value: '', label: 'Auto-detect' }, ...examTypes.map((e) => ({ value: e.id, label: e.name }))]}
            value={uploadExamTypeId}
            onChange={(e) => setUploadExamTypeId(e.target.value)}
          />
        </div>
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
            ${
              isDragActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
            }
          `}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          {isDragActive ? (
            <p className="text-blue-600 dark:text-blue-400 font-medium">Drop files here...</p>
          ) : (
            <>
              <p className="text-slate-600 dark:text-slate-400 font-medium mb-2">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-sm text-slate-500">Supports: PDF, DOCX (images — Phase 4 OCR)</p>
            </>
          )}
        </div>
      </Card>

      {files.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Files ({files.length})
          </h3>
          <div className="space-y-3">
            {files.map((fileItem) => (
              <div key={fileItem.id} className="space-y-2 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50/30 dark:bg-slate-800/10">
                <div
                  className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <div className="flex-shrink-0">{getFileIcon(fileItem.file)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {fileItem.file.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {(fileItem.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {(fileItem.status === 'uploading' || fileItem.status === 'processing') && (
                      <div className="mt-2 w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${fileItem.progress}%` }}
                        />
                      </div>
                    )}
                    {fileItem.status === 'completed' && (
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-600 dark:text-green-400">
                            {fileItem.questionsExtracted} questions extracted (pending review)
                          </span>
                        </div>
                        {fileItem.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-600">
                            {w}
                          </p>
                        ))}
                      </div>
                    )}
                    {fileItem.status === 'failed' && (
                      <div className="flex items-center gap-2 mt-1">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-sm text-red-600 dark:text-red-400">
                          {fileItem.error}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        fileItem.status === 'completed'
                          ? 'success'
                          : fileItem.status === 'failed'
                          ? 'error'
                          : fileItem.status === 'processing' || fileItem.status === 'uploading'
                          ? 'info'
                          : 'default'
                      }
                    >
                      {fileItem.status}
                    </Badge>
                    {fileItem.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => removeFile(fileItem.id)}
                        className="p-1 text-slate-400 hover:text-red-500"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {diagnosticsMap[fileItem.id] && (
                  <details className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 shadow-sm">
                    <summary className="cursor-pointer font-bold select-none text-slate-700 dark:text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">📊 Ingestion Diagnostics & Worker State</span>
                      <span className="text-[10px] text-slate-400 font-normal">attempts: {diagnosticsMap[fileItem.id].pollingAttempts.length}</span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="font-semibold text-slate-500 uppercase text-[9px] mb-1">Upload Worker State logs:</div>
                        <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border dark:border-slate-800 font-mono text-[9.5px] max-h-32 overflow-y-auto space-y-0.5">
                          {diagnosticsMap[fileItem.id].stageLogs.length > 0 ? (
                            diagnosticsMap[fileItem.id].stageLogs.map((log, i) => (
                              <div key={i} className="text-indigo-600 dark:text-indigo-400">{log}</div>
                            ))
                          ) : (
                            <div className="text-slate-400">Waiting for worker logs...</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold text-slate-500 uppercase text-[9px] mb-1">Polling attempts lifecycle:</div>
                        <div className="max-h-32 overflow-y-auto border rounded border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <table className="min-w-full text-[9px]">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-850 border-b dark:border-slate-800">
                                <th className="p-1 text-left">#</th>
                                <th className="p-1 text-left">Time</th>
                                <th className="p-1 text-left">Stage</th>
                                <th className="p-1 text-left">Progress</th>
                                <th className="p-1 text-left">Latency</th>
                                <th className="p-1 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diagnosticsMap[fileItem.id].pollingAttempts.map((attempt) => (
                                <tr key={attempt.attemptCount} className="border-b dark:border-slate-800">
                                  <td className="p-1 font-mono font-bold text-slate-500">{attempt.attemptCount}</td>
                                  <td className="p-1 font-mono">{attempt.timestamp}</td>
                                  <td className="p-1 font-mono">{attempt.stage}</td>
                                  <td className="p-1 font-mono">{attempt.progress}%</td>
                                  <td className="p-1 font-mono">{attempt.latencyMs}ms</td>
                                  <td className="p-1">
                                    {attempt.stale ? (
                                      <span className="text-amber-500 font-semibold">Stale (Cached/Unchanged)</span>
                                    ) : (
                                      <span className="text-green-600 font-semibold">Progressing</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold text-slate-500 uppercase text-[9px] mb-1">HTTP Cache Headers Analysis:</div>
                        <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border dark:border-slate-800 font-mono text-[9px] space-y-1">
                          {diagnosticsMap[fileItem.id].pollingAttempts.length > 0 ? (
                            (() => {
                              const last = diagnosticsMap[fileItem.id].pollingAttempts[diagnosticsMap[fileItem.id].pollingAttempts.length - 1];
                              const hasNoStore = /no-store/i.test(last.cacheHeaders['Cache-Control']);
                              return (
                                <>
                                  <div>Cache-Control: <span className="font-bold text-blue-500">{last.cacheHeaders['Cache-Control'] || 'missing'}</span></div>
                                  <div>Pragma: <span className="font-bold text-blue-500">{last.cacheHeaders['Pragma'] || 'missing'}</span></div>
                                  <div>Expires: <span className="font-bold text-blue-500">{last.cacheHeaders['Expires'] || 'missing'}</span></div>
                                  <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-slate-800 font-bold">
                                    Diagnostics Check: {hasNoStore ? (
                                      <span className="text-green-600">✓ Cache disabled (no-store confirmed)</span>
                                    ) : (
                                      <span className="text-red-500">⚠ Cache may be active (missing no-store header)</span>
                                    )}
                                  </div>
                                </>
                              );
                            })()
                          ) : (
                            <div className="text-slate-400">Waiting for headers...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {files.length > 0 && !uploadComplete && (
        <div className="flex justify-end gap-4">
          <Button variant="ghost" onClick={() => setFiles([])}>
            Clear All
          </Button>
          <Button
            onClick={uploadFiles}
            isLoading={isUploading}
            disabled={isUploading || files.every((f) => f.status !== 'pending')}
          >
            Process Files
          </Button>
        </div>
      )}

      {uploadComplete && totalQuestions > 0 && (
        <Card className="p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <div>
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">
                Extraction complete
              </h3>
              <p className="text-green-700 dark:text-green-400 mt-1">
                {totalQuestions} question(s) saved as pending / needs_review. Approve them in the
                question bank.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/questions">
              <Button leftIcon={<ArrowRight className="w-4 h-4" />}>Review Questions</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
