import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Alert, Loading, Badge, Textarea } from '../../components/ui';
import { ArrowLeft, Download, Save, Trash2, Sliders, FileText } from 'lucide-react';
import { 
  fetchPaperApi, 
  fetchTemplatesApi, 
  fetchPresetsApi, 
  fetchInstitutionProfileApi, 
  fetchPaperHtmlApi, 
  downloadPaperPdfApi, 
  downloadPaperDocxApi, 
  createPresetApi, 
  deletePresetApi,
  type ExportOptions
} from '../../api/papers';
import type { Paper, ExamTemplate, ExportPreset } from '../../types';

export function PaperExportWorkspace() {
  const { id: paperId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Styling and configuration options state
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('default');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  
  // Layout Options
  const [layout, setLayout] = useState<'single_column' | 'two_column'>('single_column');
  const [margin, setMargin] = useState<'narrow' | 'normal' | 'wide'>('normal');
  const [fontFamily, setFontFamily] = useState('times_new_roman');
  const [fontSize, setFontSize] = useState(11);
  const [lineSpacing, setLineSpacing] = useState(1.25);
  
  // Branding Options
  const [showInstitutionLogo, setShowInstitutionLogo] = useState(true);
  const [institutionName, setInstitutionName] = useState('ExamForge Academy');
  const [examinationName, setExaminationName] = useState('Mock Examination');
  const [customHeaderText, setCustomHeaderText] = useState('');
  const [showPageNumber, setShowPageNumber] = useState(true);
  const [footerInstitutionName, setFooterInstitutionName] = useState('ExamForge Academy');
  const [customFooterText, setCustomFooterText] = useState('');
  
  // Watermark Options
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.04);
  const [watermarkSize, setWatermarkSize] = useState(64);
  const [watermarkRotation, setWatermarkRotation] = useState(-25);

  // Extras
  const [showCoverPage, setShowCoverPage] = useState(false);
  const [numberingMode, setNumberingMode] = useState<'continuous' | 'section_wise'>('continuous');
  const [exportTypeFormat, setExportTypeFormat] = useState('paper_with_solutions');

  // Load initial data
  useEffect(() => {
    if (!paperId) return;
    
    async function loadWorkspaceData() {
      try {
        const [paperData, templatesData, presetsData, profileData] = await Promise.all([
          fetchPaperApi(paperId!),
          fetchTemplatesApi(),
          fetchPresetsApi(),
          fetchInstitutionProfileApi()
        ]);
        
        setPaper(paperData);
        setTemplates(templatesData);
        setPresets(presetsData);
        
        // Inherit from Institution Profile by default
        if (profileData) {
          if (profileData.institutionName) {
            setInstitutionName(profileData.institutionName);
            setFooterInstitutionName(profileData.institutionName);
          }
          if (profileData.defaultHeader) {
            setCustomHeaderText(profileData.defaultHeader);
          }
          if (profileData.defaultFooter) {
            setCustomFooterText(profileData.defaultFooter);
          }
        } else if (paperData.created_by_profile?.school_institute) {
          setInstitutionName(paperData.created_by_profile.school_institute);
          setFooterInstitutionName(paperData.created_by_profile.school_institute);
        }

        if (paperData.exam_type?.name) {
          setExaminationName(paperData.exam_type.name);
        }

        // Apply paper's existing export settings if they exist
        const savedSettings = paperData.export_settings;
        if (savedSettings) {
          if (savedSettings.layout) setLayout(savedSettings.layout);
          if (savedSettings.margin) setMargin(savedSettings.margin);
          if (savedSettings.font_family) setFontFamily(savedSettings.font_family);
          if (savedSettings.font_size) setFontSize(savedSettings.font_size);
          if (savedSettings.line_spacing) setLineSpacing(savedSettings.line_spacing);
          if (savedSettings.show_institution_logo !== undefined) setShowInstitutionLogo(savedSettings.show_institution_logo);
          if (savedSettings.institution_name) setInstitutionName(savedSettings.institution_name);
          if (savedSettings.examination_name) setExaminationName(savedSettings.examination_name);
          if (savedSettings.custom_header_text) setCustomHeaderText(savedSettings.custom_header_text);
          if (savedSettings.show_page_number !== undefined) setShowPageNumber(savedSettings.show_page_number);
          if (savedSettings.footer_institution_name) setFooterInstitutionName(savedSettings.footer_institution_name);
          if (savedSettings.custom_footer_text) setCustomFooterText(savedSettings.custom_footer_text);
          if (savedSettings.template) setSelectedTemplateCode(savedSettings.template);
          if (savedSettings.show_cover_page !== undefined) setShowCoverPage(savedSettings.show_cover_page);
          if (savedSettings.numbering_mode) setNumberingMode(savedSettings.numbering_mode);
          if (savedSettings.watermark_text !== undefined) setWatermarkText(savedSettings.watermark_text || '');
          if (savedSettings.watermark_opacity !== undefined) setWatermarkOpacity(savedSettings.watermark_opacity);
          if (savedSettings.watermark_size !== undefined) setWatermarkSize(savedSettings.watermark_size);
          if (savedSettings.watermark_rotation !== undefined) setWatermarkRotation(savedSettings.watermark_rotation);
        } else if (paperData.status === 'draft') {
          setWatermarkText('DRAFT');
        }
      } catch (err) {
        console.error('Failed to load workspace', err);
        setMessage({ type: 'error', text: 'Failed to load paper details or configurations.' });
      } finally {
        setIsLoading(false);
      }
    }

    loadWorkspaceData();
  }, [paperId]);

  // Aggregate options
  const getOptions = (): ExportOptions => {
    return {
      allowDraft: true,
      layout,
      margin,
      fontFamily,
      fontSize,
      lineSpacing,
      showInstitutionLogo,
      institutionName,
      examinationName,
      subjectName: paper?.subject?.name || undefined,
      className: paper ? String(paper.class) : undefined,
      customHeaderText,
      showPageNumber,
      footerInstitutionName,
      customFooterText,
      template: selectedTemplateCode,
      showCoverPage,
      numberingMode,
      watermarkText: watermarkText || null,
      watermarkOpacity,
      watermarkSize,
      watermarkRotation,
      exportTypeFormat,
    };
  };

  // Update Preview when configurations change
  useEffect(() => {
    if (isLoading || !paperId) return;

    let active = true;
    const fetchPreviewHtml = async () => {
      setPreviewLoading(true);
      try {
        const html = await fetchPaperHtmlApi(paperId!, getOptions());
        if (active) {
          setHtmlContent(html);
        }
      } catch (err) {
        console.error('Failed to fetch preview html', err);
      } finally {
        if (active) setPreviewLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchPreviewHtml();
    }, 500);

    return () => {
      active = false;
      clearTimeout(delayDebounceFn);
    };
  }, [
    isLoading,
    paperId,
    layout,
    margin,
    fontFamily,
    fontSize,
    lineSpacing,
    showInstitutionLogo,
    institutionName,
    examinationName,
    customHeaderText,
    showPageNumber,
    footerInstitutionName,
    customFooterText,
    selectedTemplateCode,
    showCoverPage,
    numberingMode,
    watermarkText,
    watermarkOpacity,
    watermarkSize,
    watermarkRotation,
    exportTypeFormat,
  ]);

  // Handle template switch
  const handleTemplateChange = (code: string) => {
    setSelectedTemplateCode(code);
    const selected = templates.find(t => t.code === code || t.name === code);
    if (selected && selected.layoutDefaults) {
      setLayout(selected.layoutDefaults.layout);
      setMargin(selected.layoutDefaults.margin);
      setFontFamily(selected.layoutDefaults.fontFamily);
      setFontSize(selected.layoutDefaults.fontSize);
      setLineSpacing(selected.layoutDefaults.lineSpacing);
    }
  };

  // Handle Preset switch
  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find(p => p.id === presetId || p._id === presetId);
    if (preset) {
      setLayout(preset.layout);
      setMargin(preset.margin);
      setFontFamily(preset.fontFamily);
      setFontSize(preset.fontSize);
      setLineSpacing(preset.lineSpacing);
      setShowInstitutionLogo(preset.showInstitutionLogo);
      if (preset.institutionName) setInstitutionName(preset.institutionName);
      if (preset.examinationName) setExaminationName(preset.examinationName);
      if (preset.customHeaderText) setCustomHeaderText(preset.customHeaderText);
      setShowPageNumber(preset.showPageNumber);
      if (preset.footerInstitutionName) setFooterInstitutionName(preset.footerInstitutionName);
      if (preset.customFooterText) setCustomFooterText(preset.customFooterText);
      setWatermarkText(preset.watermarkText || '');
      setWatermarkOpacity(preset.watermarkOpacity);
      setWatermarkSize(preset.watermarkSize);
      setWatermarkRotation(preset.watermarkRotation);
      setShowCoverPage(preset.showCoverPage);
      setNumberingMode(preset.numberingMode);
    }
  };

  // Save new preset
  const handleSavePreset = async () => {
    const name = window.prompt('Enter name for the new Preset:');
    if (!name?.trim()) return;

    try {
      const payload = {
        name,
        layout,
        margin,
        fontFamily,
        fontSize,
        lineSpacing,
        showInstitutionLogo,
        institutionName,
        examinationName,
        customHeaderText,
        showPageNumber,
        footerInstitutionName,
        customFooterText,
        watermarkText: watermarkText || null,
        watermarkOpacity,
        watermarkSize,
        watermarkRotation,
        showCoverPage,
        numberingMode
      };
      const newPreset = await createPresetApi(payload);
      setPresets([...presets, newPreset]);
      setSelectedPresetId(newPreset.id || newPreset._id!);
      setMessage({ type: 'success', text: `Saved preset "${name}" successfully.` });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to save export preset.' });
    }
  };

  // Delete Preset
  const handleDeletePreset = async (presetId: string) => {
    if (!presetId) return;
    if (!window.confirm('Delete this preset?')) return;
    try {
      await deletePresetApi(presetId);
      setPresets(presets.filter(p => p.id !== presetId && p._id !== presetId));
      setSelectedPresetId('');
      setMessage({ type: 'success', text: 'Export preset deleted.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to delete preset.' });
    }
  };

  // Download actions
  const handleDownloadPdf = async () => {
    if (!paperId) return;
    try {
      setMessage({ type: 'success', text: 'Compiling PDF sheet... download will start shortly.' });
      const blob = await downloadPaperPdfApi(paperId!, getOptions());
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper?.paper_code || 'paper'}-${exportTypeFormat}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to compile and download PDF.' });
    }
  };

  const handleDownloadDocx = async () => {
    if (!paperId) return;
    try {
      setMessage({ type: 'success', text: 'Generating Microsoft Word DOCX... download will start shortly.' });
      const blob = await downloadPaperDocxApi(paperId!, getOptions());
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper?.paper_code || 'paper'}-${exportTypeFormat}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to compile and download editable DOCX.' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col space-y-4">
      {/* Workspace Header */}
      <div className="flex items-center justify-between border-b pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/papers')} 
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Publishing Workspace</h2>
              <Badge variant={paper?.status === 'published' ? 'success' : 'warning'}>
                {paper?.status?.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">Configure layouts, templates, watermarks and export types dynamically.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadDocx} className="flex items-center gap-1.5 text-xs py-1.5 px-3">
            <Download size={14} /> DOCX
          </Button>
          <Button variant="primary" onClick={handleDownloadPdf} className="flex items-center gap-1.5 text-xs py-1.5 px-3">
            <Download size={14} /> PDF
          </Button>
        </div>
      </div>

      {message && (
        <Alert 
          variant={message.type} 
          title={message.text} 
          className="flex-shrink-0 py-2.5" 
        />
      )}

      {/* Main Split Pane Workspace */}
      <div className="flex-grow flex gap-4 min-h-0 overflow-hidden">
        {/* Left Side: Settings Panel */}
        <div className="w-[360px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Presets & Templates */}
          <Card className="p-4 space-y-3 shadow-sm border border-slate-200 flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b pb-1.5">
              <Sliders size={14} /> Presets & Blueprints
            </h3>
            
            <div className="flex items-end gap-1.5">
              <div className="flex-grow">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Publishing Preset</label>
                <select
                  value={selectedPresetId}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
                >
                  <option value="">-- No Preset Selected --</option>
                  {presets.map(p => (
                    <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {selectedPresetId && (
                <button
                  onClick={() => handleDeletePreset(selectedPresetId)}
                  className="p-2 border rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors h-[38px] flex items-center"
                  title="Delete selected preset"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSavePreset}
                className="w-full text-xs py-1.5 bg-blue-50 text-blue-600 font-semibold border border-blue-200 rounded hover:bg-blue-100 transition-all flex items-center justify-center gap-1"
              >
                <Save size={12} /> Save Current Settings as Preset
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Blueprint Template Structure</label>
              <select
                value={selectedTemplateCode}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
              >
                <option value="default">Default Exam Template</option>
                {templates.map(t => (
                  <option key={t.id || t._id} value={t.code || t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </Card>

          {/* Export Configurations & Formatting */}
          <Card className="p-4 space-y-3 shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-1.5">Layout & Formatting</h3>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Layout Columns</label>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
              >
                <option value="single_column">Single Column Layout</option>
                <option value="two_column">Two Columns Layout</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Margin Preset</label>
              <select
                value={margin}
                onChange={(e) => setMargin(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
              >
                <option value="narrow">Narrow Margins (10mm)</option>
                <option value="normal">Normal Margins (16mm)</option>
                <option value="wide">Wide Margins (25mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Font Family</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
              >
                <option value="times_new_roman">Times New Roman</option>
                <option value="cambria">Cambria</option>
                <option value="arial">Arial</option>
                <option value="inter">Inter (Modern Sans)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Font Size (pt)"
                type="number"
                step="0.5"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
              <Input
                label="Line Spacing"
                type="number"
                step="0.05"
                value={lineSpacing}
                onChange={(e) => setLineSpacing(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Numbering Mode</label>
              <select
                value={numberingMode}
                onChange={(e) => setNumberingMode(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
              >
                <option value="continuous">Continuous Numbering (Q1 to Qn)</option>
                <option value="section_wise">Section-wise (A1, A2, B1, B2...)</option>
              </select>
            </div>
          </Card>

          {/* Brandings and Headers */}
          <Card className="p-4 space-y-3 shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-1.5">Branding & Headers</h3>
            
            <label className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={showInstitutionLogo}
                onChange={(e) => setShowInstitutionLogo(e.target.checked)}
                className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-700 uppercase">Show Logo Header</span>
            </label>

            <Input
              label="Institution Header Name"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
            />

            <Input
              label="Examination Subtitle Name"
              value={examinationName}
              onChange={(e) => setExaminationName(e.target.value)}
            />

            <Textarea
              label="General Instructions Override"
              value={customHeaderText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomHeaderText(e.target.value)}
              rows={3}
            />

            <label className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={showPageNumber}
                onChange={(e) => setShowPageNumber(e.target.checked)}
                className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-700 uppercase">Include Footer Page Numbers</span>
            </label>

            <Input
              label="Footer Institution Name"
              value={footerInstitutionName}
              onChange={(e) => setFooterInstitutionName(e.target.value)}
            />

            <Textarea
              label="Footer Custom Note"
              value={customFooterText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomFooterText(e.target.value)}
              rows={2}
            />
          </Card>

          {/* Watermarks and Cover page */}
          <Card className="p-4 space-y-3 shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-1.5">Watermark & Cover Page</h3>
            
            <label className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={showCoverPage}
                onChange={(e) => setShowCoverPage(e.target.checked)}
                className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-700 uppercase">Generate Cover Page</span>
            </label>

            <Input
              label="Watermark Text"
              placeholder="e.g. DRAFT, CONFIDENTIAL"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
            />

            {watermarkText && (
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="Opacity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.5"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                />
                <Input
                  label="Size (pt)"
                  type="number"
                  min="20"
                  max="150"
                  value={watermarkSize}
                  onChange={(e) => setWatermarkSize(Number(e.target.value))}
                />
                <Input
                  label="Rotation"
                  type="number"
                  min="-90"
                  max="90"
                  value={watermarkRotation}
                  onChange={(e) => setWatermarkRotation(Number(e.target.value))}
                />
              </div>
            )}
          </Card>

          {/* Export format targets */}
          <Card className="p-4 space-y-3 shadow-sm border border-slate-200 flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-1.5">Export Contents Target</h3>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Export Scope</label>
              <select
                value={exportTypeFormat}
                onChange={(e) => setExportTypeFormat(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800/50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white"
              >
                <option value="paper_only">Question Paper Only</option>
                <option value="paper_with_answers">Question Paper + Answer Key</option>
                <option value="paper_with_solutions">Question Paper + Detailed Solutions</option>
                <option value="answer_key_only">Answer Key Only</option>
                <option value="solutions_only">Detailed Solutions Only</option>
              </select>
            </div>
          </Card>
        </div>

        {/* Right Side: Interactive Live Preview Pane */}
        <div className="flex-grow flex flex-col min-w-0 border rounded-lg bg-slate-100 overflow-hidden relative shadow-inner">
          {previewLoading && (
            <div className="absolute inset-0 bg-slate-200/50 backdrop-blur-[1px] flex items-center justify-center z-50">
              <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg shadow-md border border-slate-200">
                <Loading size="md" />
                <span className="text-xs font-semibold text-slate-600">Updating live preview...</span>
              </div>
            </div>
          )}
          
          {htmlContent ? (
            <iframe 
              srcDoc={htmlContent} 
              className="w-full h-full border-none bg-white" 
              title="Print Sheet Preview"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 gap-2">
              <FileText size={48} className="stroke-[1.5]" />
              <p className="font-semibold">No Preview Loaded</p>
              <p className="text-xs max-w-sm">Adjust configurations to load the interactive publishing sheet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
