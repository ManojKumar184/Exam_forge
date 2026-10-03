import * as questionService from '../services/questionService.js';
import { reconstructQuestionInput } from '../services/questionReconstructService.js';
import { logger } from '../utils/logger.js';
import { reconstructionResponsePayloadSchema } from '../validators/questionValidators.js';
import { recordAudit } from '../services/auditLogService.js';

export async function list(req, res) {
  const data = await questionService.listQuestions(req.query, req.user);
  res.json({ success: true, data });
}

export async function count(req, res) {
  const data = await questionService.countQuestions(req.query, req.user);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  const data = await questionService.getQuestionById(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function create(req, res) {
  const data = await questionService.createQuestion(req.body, req.user);
  await recordAudit({ req, action: 'question_created', resource: 'question', resourceId: data.id });
  res.status(201).json({ success: true, data });
}

export async function update(req, res) {
  const data = await questionService.updateQuestion(req.params.id, req.body, req.user);
  await recordAudit({ req, action: 'question_updated', resource: 'question', resourceId: req.params.id });
  res.json({ success: true, data });
}

export async function remove(req, res) {
  await questionService.deleteQuestion(req.params.id, req.user);
  await recordAudit({ req, action: 'question_deleted', resource: 'question', resourceId: req.params.id });
  res.json({ success: true, message: 'Question deleted' });
}

export async function approve(req, res) {
  const data = await questionService.approveQuestion(req.params.id, req.user);
  await recordAudit({ req, action: 'question_approved', resource: 'question', resourceId: req.params.id });
  res.json({ success: true, data });
}

export async function reject(req, res) {
  const data = await questionService.rejectQuestion(
    req.params.id,
    req.user,
    req.body.notes || req.body.review_notes || 'Rejected'
  );
  await recordAudit({ req, action: 'question_rejected', resource: 'question', resourceId: req.params.id });
  res.json({ success: true, data });
}

export async function bulkApprove(req, res) {
  await questionService.bulkApprove(req.body.ids, req.user);
  res.json({ success: true, message: 'Questions approved' });
}

export async function bulkReject(req, res) {
  await questionService.bulkReject(req.body.ids, req.user, req.body.notes || 'Bulk rejected');
  res.json({ success: true, message: 'Questions rejected' });
}

export async function bulkDelete(req, res) {
  await questionService.bulkDelete(req.body.ids, req.user);
  res.json({ success: true, message: 'Questions deleted' });
}

export async function bulkUpdateMetadata(req, res) {
  const data = await questionService.bulkUpdateMetadata(
    req.body.ids,
    req.body.updates,
    req.user
  );
  res.json({ success: true, data });
}

/** Editor assist: parse/OCR/Gemini reconstruct without persisting. */
export async function reconstruct(req, res) {
  const data = await reconstructQuestionInput(req.body);

  // Validate the final response payload with Zod
  const validationResult = reconstructionResponsePayloadSchema.safeParse(data);
  if (!validationResult.success) {
    logger.warn('Reconstruction response failed shape validation', {
      issues: validationResult.error.issues.map(({ path, code }) => ({ path, code })),
      requestId: req.id,
    });
  }

  const finalPayload = validationResult.success ? validationResult.data : data;

  res.json({ success: true, data: finalPayload });
}
