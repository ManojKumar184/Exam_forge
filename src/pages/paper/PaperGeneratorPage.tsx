import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Input, Select, Badge, Alert, Modal, EmptyState } from '../../components/ui';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Wand2, Settings, Save
} from 'lucide-react';
import type { Question } from '../../types';

interface SelectedQuestion extends Question {
  customMarks: number;
  sectionId: string;
  orderIndex: number;
}

interface Section {
  id: string;
  name: string;
  marksPerQuestion: number;
  questions: SelectedQuestion[];
}

export function PaperGeneratorPage() {
  const navigate = useNavigate();
  const { profile, canGeneratePapers } = useAuth();
  const {
    subjects, examTypes, questions,
    fetchSubjects, fetchExamTypes, fetchQuestions, createPaper
  } = useDataStore();

  const [isLoading, setIsLoading] = useState(false);

  // Paper configuration
  const [title, setTitle] = useState('');
  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classLevel, setClassLevel] = useState<number>(11);
  const [totalMarks, setTotalMarks] = useState<number>(100);
  const [duration, setDuration] = useState<number>(180);

  // Configuration
  const [sections, setSections] = useState<Section[]>([
    { id: 'A', name: 'Section A - MCQ', marksPerQuestion: 4, questions: [] },
    { id: 'B', name: 'Section B - Short Answer', marksPerQuestion: 4, questions: [] },
    { id: 'C', name: 'Section C - Long Answer', marksPerQuestion: 8, questions: [] },
  ]);

  // Add question modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string>('A');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    fetchQuestions({ status: 'approved' });
  }, []);

  const currentSection = sections.find(s => s.id === currentSectionId);

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  const usedQuestionIds = useMemo(() => {
    return new Set(sections.flatMap(s => s.questions.map(q => q.id)));
  }, [sections]);

  const availableQuestions = useMemo(() => {
    return questions
      .filter(q => {
        if (usedQuestionIds.has(q.id)) return false;
        if (subjectId && q.subject_id !== subjectId) return false;
        if (classLevel && q.class !== classLevel) return false;
        if (selectedDifficulty && q.difficulty !== selectedDifficulty) return false;
        if (searchTerm && !q.question_text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
      });
  }, [questions, subjectId, classLevel, selectedDifficulty, searchTerm, usedQuestionIds]);

  const autoSelectQuestions = () => {
    if (!subjectId || !examTypeId) {
      alert('Please select subject and exam type first');
      return;
    }

    const mcqQuestions = availableQuestions
      .filter(q => q.question_type === 'mcq')
      .slice(0, 15);

    const descriptiveQuestions = availableQuestions
      .filter(q => q.question_type === 'descriptive' || q.question_type === 'numerical')
      .slice(0, 10);

    const newSections = [...sections];
    newSections[0].questions = mcqQuestions.map((q, i) => ({
      ...q,
      customMarks: newSections[0].marksPerQuestion,
      sectionId: 'A',
      orderIndex: i
    }));
    newSections[1].questions = descriptiveQuestions.slice(0, 5).map((q, i) => ({
      ...q,
      customMarks: newSections[1].marksPerQuestion,
      sectionId: 'B',
      orderIndex: i
    }));
    newSections[2].questions = descriptiveQuestions.slice(5, 10).map((q, i) => ({
      ...q,
      customMarks: newSections[2].marksPerQuestion,
      sectionId: 'C',
      orderIndex: i
    }));

    setSections(newSections);
  };

  const addQuestionToSection = (question: Question) => {
    if (!currentSection) return;

    setSections(prev =>
      prev.map(s => {
        if (s.id === currentSectionId) {
          const newQ: SelectedQuestion = {
            ...question,
            customMarks: s.marksPerQuestion,
            sectionId: s.id,
            orderIndex: s.questions.length
          };
          return { ...s, questions: [...s.questions, newQ] };
        }
        return s;
      })
    );
    setShowAddModal(false);
  };

  const removeQuestionFromSection = (sectionId: string, questionId: string) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id === sectionId) {
          return { ...s, questions: s.questions.filter(q => q.id !== questionId) };
        }
        return s;
      })
    );
  };

  const moveQuestion = (sectionId: string, index: number, direction: 'up' | 'down') => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        const newQuestions = [...s.questions];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= newQuestions.length) return s;
        [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
        return { ...s, questions: newQuestions };
      })
    );
  };

  const handleSavePaper = async () => {
    if (!title || !subjectId || !examTypeId) {
      alert('Please fill all required fields');
      return;
    }

    if (totalQuestions === 0) {
      alert('Please add at least one question');
      return;
    }

    setIsLoading(true);

    try {
      const paperCode = `PAPER-${Date.now().toString(36).toUpperCase()}`;
      const paperQuestions = sections.flatMap(s =>
        s.questions.map((q, index) => ({
          question_id: q.id,
          section: s.id,
          section_order: 0,
          question_order: index,
          custom_marks: q.customMarks
        }))
      );

      const { error } = await createPaper({
        title,
        description: `${examTypes.find(e => e.id === examTypeId)?.name} - ${subjects.find(s => s.id === subjectId)?.name}`,
        paper_code: paperCode,
        exam_type_id: examTypeId,
        subject_id: subjectId,
        class: classLevel,
        total_marks: totalMarks,
        total_questions: totalQuestions,
        duration_minutes: duration,
        is_online: false,
        status: 'draft',
        created_by: profile?.id || '',
        sections: sections.map((s) => ({
          name: s.name,
          questionCount: s.questions.length,
          marksPerQuestion: s.marksPerQuestion,
        })),
        questions: paperQuestions as any,
      });
      if (error) throw error;

      navigate('/papers');
    } catch (error: any) {
      console.error('Error saving paper:', error);
      alert('Failed to save paper: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!canGeneratePapers) {
    return (
      <Alert variant="error" title="Access Denied">
        You don't have permission to generate papers.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Generate Question Paper</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Create exam papers from approved questions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/papers')}>
            Cancel
          </Button>
          <Button onClick={handleSavePaper} isLoading={isLoading} leftIcon={<Save className="w-4 h-4" />}>
            Save Paper
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <Card className="lg:col-span-1 p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Paper Configuration
          </h2>

          <div className="space-y-4">
            <Input
              label="Paper Title"
              placeholder="e.g., Physics Final Exam 2024"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Select
              label="Exam Type"
              options={examTypes.map(e => ({ value: e.id, label: e.name }))}
              value={examTypeId}
              onChange={(e) => setExamTypeId(e.target.value)}
              placeholder="Select exam type"
            />

            <Select
              label="Subject"
              options={subjects.map(s => ({ value: s.id, label: s.name }))}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Select subject"
            />

            <Select
              label="Class"
              options={[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: c.toString(), label: `Class ${c}` }))}
              value={classLevel.toString()}
              onChange={(e) => setClassLevel(parseInt(e.target.value))}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Total Marks"
                type="number"
                value={totalMarks.toString()}
                onChange={(e) => setTotalMarks(parseInt(e.target.value) || 0)}
              />
              <Input
                label="Duration (mins)"
                type="number"
                value={duration.toString()}
                onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              leftIcon={<Wand2 className="w-4 h-4" />}
              onClick={autoSelectQuestions}
              disabled={!subjectId || !examTypeId}
            >
              Auto-Select Questions
            </Button>
          </div>

          {/* Section Settings */}
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="font-medium text-slate-700 dark:text-slate-300 mb-3">Sections</h3>
            <div className="space-y-3">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{section.name}</p>
                    <p className="text-xs text-slate-500">{section.questions.length} questions</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={section.marksPerQuestion.toString()}
                      onChange={(e) => {
                        const marks = parseInt(e.target.value) || 0;
                        setSections(prev =>
                          prev.map(s => s.id === section.id ? { ...s, marksPerQuestion: marks } : s)
                        );
                      }}
                      className="w-16 h-8 text-sm"
                    />
                    <span className="text-xs text-slate-500">marks/Q</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Questions Panel */}
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Questions ({totalQuestions} selected)
            </h2>
          </div>

          {sections.every(s => s.questions.length === 0) ? (
            <EmptyState
              title="No questions added"
              description="Add questions to each section or use auto-select"
              action={
                <Button onClick={() => setShowAddModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
                  Add Questions
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-slate-700 dark:text-slate-300">{section.name}</h3>
                    <div className="flex items-center gap-3">
                      <Badge>{section.questions.length} Q | {section.questions.reduce((s, q) => s + q.customMarks, 0)} M</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCurrentSectionId(section.id);
                          setShowAddModal(true);
                        }}
                        leftIcon={<Plus className="w-4 h-4" />}
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  {section.questions.length > 0 ? (
                    <div className="space-y-2">
                      {section.questions.map((question, index) => (
                        <div
                          key={question.id}
                          className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg group"
                        >
                          <span className="text-sm font-medium text-slate-500 w-6">Q{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-900 dark:text-white line-clamp-2">
                              {question.question_text}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge size="sm" variant={
                                question.difficulty === 'easy' ? 'success' :
                                question.difficulty === 'medium' ? 'warning' : 'error'
                              }>
                                {question.difficulty}
                              </Badge>
                              <Badge size="sm">{question.marks}M</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={question.customMarks.toString()}
                              onChange={(e) => {
                                const marks = parseInt(e.target.value) || 0;
                                setSections(prev =>
                                  prev.map(s => {
                                    if (s.id === section.id) {
                                      return {
                                        ...s,
                                        questions: s.questions.map(q =>
                                          q.id === question.id ? { ...q, customMarks: marks } : q
                                        )
                                      };
                                    }
                                    return s;
                                  })
                                );
                              }}
                              className="w-16 h-8 text-sm"
                            />
                            <button
                              onClick={() => moveQuestion(section.id, index, 'up')}
                              disabled={index === 0}
                              className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => moveQuestion(section.id, index, 'down')}
                              disabled={index === section.questions.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeQuestionFromSection(section.id, question.id)}
                              className="p-1 text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      <p className="text-sm text-slate-500">No questions in this section</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add Question Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Questions"
        size="xl"
      >
        <div className="p-6">
          <div className="flex gap-4 mb-4">
            <Select
              label="Section"
              options={sections.map(s => ({ value: s.id, label: s.name }))}
              value={currentSectionId}
              onChange={(e) => setCurrentSectionId(e.target.value)}
            />
            <Input
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select
              placeholder="Difficulty"
              options={[
                { value: '', label: 'All' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' }
              ]}
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            />
          </div>

          {availableQuestions.length === 0 ? (
            <EmptyState
              title="No questions available"
              description="Try adjusting your filters or import more questions"
            />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {availableQuestions.map((question) => (
                <div
                  key={question.id}
                  className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                  onClick={() => addQuestionToSection(question)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-white line-clamp-2">
                      {question.question_text}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge size="sm" variant={
                        question.difficulty === 'easy' ? 'success' :
                        question.difficulty === 'medium' ? 'warning' : 'error'
                      }>
                        {question.difficulty}
                      </Badge>
                      <Badge size="sm">{question.question_type.toUpperCase()}</Badge>
                      <Badge size="sm">{question.marks}M</Badge>
                      <Badge size="sm">Class {question.class}</Badge>
                    </div>
                  </div>
                  <Plus className="w-5 h-5 text-blue-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
