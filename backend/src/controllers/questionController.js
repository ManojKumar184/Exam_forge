import * as questionService from '../services/questionService.js';

export async function list(req, res) {
  const data = await questionService.listQuestions(req.query, req.user);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  const data = await questionService.getQuestionById(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function create(req, res) {
  const data = await questionService.createQuestion(req.body, req.user);
  res.status(201).json({ success: true, data });
}

export async function update(req, res) {
  const data = await questionService.updateQuestion(req.params.id, req.body, req.user);
  res.json({ success: true, data });
}

export async function remove(req, res) {
  await questionService.deleteQuestion(req.params.id);
  res.json({ success: true, message: 'Question deleted' });
}

export async function approve(req, res) {
  const data = await questionService.approveQuestion(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function reject(req, res) {
  const data = await questionService.rejectQuestion(
    req.params.id,
    req.user,
    req.body.notes || req.body.review_notes || 'Rejected'
  );
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
  await questionService.bulkDelete(req.body.ids);
  res.json({ success: true, message: 'Questions deleted' });
}
