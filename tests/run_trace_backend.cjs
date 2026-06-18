const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/examforge';

async function trace() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const { loadClassificationCatalog, parseDocumentMetadata } = require('../backend/src/extraction/metadataClassifier.js');
  const { loadSyllabusCatalog } = require('../backend/src/ai/syllabusCatalog.js');
  const { applySemanticCatalogHints } = require('../backend/src/ai/semanticTagging.js');
  const { mergeClassification } = require('../backend/src/ai/classificationPipeline.js');
  const { getRulesProvider } = require('../backend/src/ai/providerRegistry.js');
  const Upload = require('../backend/src/models/Upload.js').Upload;

  const catalog = await loadClassificationCatalog();
  const syllabusCatalog = await loadSyllabusCatalog().catch(() => null);
  if (syllabusCatalog) catalog.syllabus = syllabusCatalog;

  console.log('Catalog - Subjects:', catalog.subjects.length, 'Topics:', catalog.topics.length, 'ExamTypes:', catalog.examTypes.length);
  catalog.subjects.forEach(s => console.log('  Subj:', s.name, s._id));
  catalog.examTypes.forEach(e => console.log('  Exam:', e.name, e._id));

  if (syllabusCatalog) {
    console.log('\nSyllabus nodes:', syllabusCatalog.allNodes.length);
    syllabusCatalog.examPatterns.forEach(ep => console.log('  EP:', ep.name, ep._id));
    syllabusCatalog.classes.forEach(c => console.log('  Class:', c.name, c._id));
    syllabusCatalog.subjects.forEach(s => console.log('  Subj:', s.name, s._id, 'parent:', s.parentId));
  }

  const uploads = await Upload.find({}).sort({ createdAt: -1 }).limit(5).lean();
  console.log('\nUPLOADS:');
  uploads.forEach(u => console.log(' ', u._id, u.originalName, u.status, (u.stagedQuestions||[]).length, 'qs'));

  const target = uploads.find(u => u.stagedQuestions && u.stagedQuestions.length >= 5) || uploads[0];
  if (!target) { console.log('No uploads'); process.exit(0); }

  const uploadContext = {
    class: undefined, subjectId: null,
    examTypeId: (target.uploadOptions||{}).exam_type_id || (target.uploadOptions||{}).examTypeId || null,
    filename: target.originalName, source: 'upload', sourceFile: target.originalName,
  };

  const header = target.stagedQuestions.slice(0,3).map(q=>q.questionText||'').join(' ');
  const docMeta = parseDocumentMetadata(header, catalog, uploadContext, syllabusCatalog);
  console.log('\nDocMeta: defaultClass=' + docMeta.defaultClass + ' classesFound=' + JSON.stringify(docMeta.classesFound) + ' subjectId=' + docMeta.subjectId + ' examTypeId=' + docMeta.examTypeId);
  console.log('Warnings:', JSON.stringify(docMeta.warnings));

  const samples = target.stagedQuestions.slice(0,5);
  const rules = getRulesProvider();

  samples.forEach((q,i) => {
    const txt = (q.questionText||'').substring(0,100);
    console.log('\n--- Q#'+(i+1)+' type:'+(q.questionType||'?')+' text:"'+txt+'..."');
    const r = rules.classify(q, catalog, docMeta, uploadContext);
    console.log('  RULES: class='+r.class+' subj='+(r.subjectName||'null')+' topic='+(r.topicName||'null')+' conf='+r.confidence);
    const s = applySemanticCatalogHints(q, catalog, {class:r.class,subjectId:r.subjectId,chapterId:r.chapterId,examTypeId:r.examTypeId});
    console.log('  SEMANTIC: subj='+s.subjectId+' ch='+s.chapterId+' conf='+s.semanticConfidence);
    const m = mergeClassification(r, s, null, q, catalog);
    console.log('  MERGE: class='+m.class+' subj='+m.subjectId+' ch='+m.chapterId+' conf='+m.aiConfidence+'% status='+m.status);
    console.log('  syllabusMappings:', JSON.stringify(m.syllabusMappings));
    console.log('  fieldConf:', JSON.stringify(m.fieldConfidence));
    if(m.subjectId) console.log('  >> subj name:', (catalog.subjects.find(x=>x._id.toString()===m.subjectId.toString())||{}).name);
  });

  console.log('\n=== TRACE COMPLETE ===');
  await mongoose.disconnect();
}
trace().catch(e => { console.error(e); process.exit(1); });
