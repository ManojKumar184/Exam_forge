import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Alert, Badge, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { Upload, FileText, File, Image, CheckCircle, AlertCircle, X, ArrowRight } from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  questionsExtracted: number;
  error?: string;
}

export function UploadQuestionsPage() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      status: 'pending',
      progress: 0,
      questionsExtracted: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
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
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFiles = async () => {
    setIsUploading(true);

    for (const fileItem of files) {
      if (fileItem.status !== 'pending') continue;

      setFiles(prev =>
        prev.map(f =>
          f.id === fileItem.id ? { ...f, status: 'uploading', progress: 10 } : f
        )
      );

      try {
        // Upload file to Supabase storage
        const fileName = `${profile?.id}/${Date.now()}-${fileItem.file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('question-uploads')
          .upload(fileName, fileItem.file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('question-uploads')
          .getPublicUrl(fileName);

        setFiles(prev =>
          prev.map(f =>
            f.id === fileItem.id ? { ...f, status: 'processing', progress: 50 } : f
          )
        );

        // Create upload record
        const fileType = fileItem.file.type.includes('pdf')
          ? 'pdf'
          : fileItem.file.type.includes('word') || fileItem.file.name.endsWith('.docx')
          ? 'docx'
          : 'image';

        const { data: uploadRecord, error: recordError } = await supabase
          .from('uploads')
          .insert({
            filename: fileItem.file.name,
            original_name: fileItem.file.name,
            file_path: urlData.publicUrl,
            file_type: fileType,
            file_size: fileItem.file.size,
            status: 'processing',
            uploaded_by: profile?.id,
          })
          .select()
          .single();

        if (recordError) throw recordError;

        // Simulate AI processing (in real app, this would call an Edge Function)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate dummy extracted questions
        const numQuestions = Math.floor(Math.random() * 15) + 5;
        const dummyQuestions = [];
        for (let i = 0; i < numQuestions; i++) {
          dummyQuestions.push({
            question_text: `Sample question ${i + 1} extracted from ${fileItem.file.name}`,
            question_type: ['mcq', 'mcq', 'numerical', 'descriptive'][Math.floor(Math.random() * 4)],
            options: [
              { text: 'Option A' },
              { text: 'Option B' },
              { text: 'Option C' },
              { text: 'Option D' },
            ],
            correct_option: Math.floor(Math.random() * 4),
            difficulty: ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)],
            class: Math.floor(Math.random() * 7) + 6,
            marks: [1, 2, 4, 5][Math.floor(Math.random() * 4)],
            status: 'pending',
            ai_confidence: Math.floor(Math.random() * 40) + 60,
            created_by: profile?.id,
          });
        }

        // Insert questions
        const { error: questionsError } = await supabase
          .from('questions')
          .insert(dummyQuestions);

        if (questionsError) throw questionsError;

        // Update upload record
        await supabase
          .from('uploads')
          .update({
            status: 'completed',
            questions_extracted: numQuestions,
            processed_at: new Date().toISOString(),
          })
          .eq('id', uploadRecord.id);

        setFiles(prev =>
          prev.map(f =>
            f.id === fileItem.id
              ? { ...f, status: 'completed', progress: 100, questionsExtracted: numQuestions }
              : f
          )
        );
      } catch (error: any) {
        console.error('Upload error:', error);
        setFiles(prev =>
          prev.map(f =>
            f.id === fileItem.id
              ? { ...f, status: 'failed', error: error.message || 'Upload failed' }
              : f
          )
        );
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Upload Question Bank</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Upload PDF, DOCX, or image files to extract questions using AI
        </p>
      </div>

      {/* Instructions */}
      <Alert variant="info" title="How it works">
        <ol className="list-decimal list-inside space-y-1 mt-2">
          <li>Upload your question papers (PDF, DOCX, or images)</li>
          <li>AI will automatically extract and classify questions</li>
          <li>Review and approve extracted questions</li>
          <li>Approved questions enter the question bank</li>
        </ol>
      </Alert>

      {/* Upload Area */}
      <Card className="p-6">
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
            ${isDragActive
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
              <p className="text-sm text-slate-500">
                Supports: PDF, DOCX, PNG, JPG, JPEG
              </p>
            </>
          )}
        </div>
      </Card>

      {/* Files List */}
      {files.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Files ({files.length})
          </h3>
          <div className="space-y-3">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
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
                  {/* Progress Bar */}
                  {(fileItem.status === 'uploading' || fileItem.status === 'processing') && (
                    <div className="mt-2 w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${fileItem.progress}%` }}
                      />
                    </div>
                  )}
                  {fileItem.status === 'completed' && (
                    <div className="flex items-center gap-2 mt-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">
                        {fileItem.questionsExtracted} questions extracted
                      </span>
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
                      onClick={() => removeFile(fileItem.id)}
                      className="p-1 text-slate-400 hover:text-red-500"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      {files.length > 0 && !uploadComplete && (
        <div className="flex justify-end gap-4">
          <Button variant="ghost" onClick={() => setFiles([])}>
            Clear All
          </Button>
          <Button
            onClick={uploadFiles}
            isLoading={isUploading}
            disabled={isUploading || files.every(f => f.status !== 'pending')}
          >
            Process Files
          </Button>
        </div>
      )}

      {/* Completion Summary */}
      {uploadComplete && (
        <Card className="p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <div>
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">
                Processing Complete!
              </h3>
              <p className="text-green-700 dark:text-green-400 mt-1">
                Extracted {totalQuestions} questions from {files.length} file(s).
                Questions are pending review.
              </p>
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <Button leftIcon={<ArrowRight className="w-4 h-4" />}>
              Review Questions
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
