import * as testService from '../services/testService.js';
import * as gradingService from '../services/gradingService.js';
import * as analyticsService from '../services/analyticsService.js';

export async function list(req, res) {
  const data = await testService.listTests(req.query, req.user);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  const data = await testService.getTestById(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function create(req, res) {
  const data = await testService.createTest(req.body, req.user);
  res.status(201).json({ success: true, data });
}

export async function update(req, res) {
  const data = await testService.updateTest(req.params.id, req.body, req.user);
  res.json({ success: true, data });
}

export async function start(req, res) {
  const data = await testService.startAttempt(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function autosave(req, res) {
  const data = await testService.autosaveAttempt(req.params.id, req.user, req.body);
  res.json({ success: true, data });
}

export async function submit(req, res) {
  const data = await testService.submitAttempt(req.params.id, req.user, { auto: false });
  res.json({ success: true, data });
}

export async function autoSubmit(req, res) {
  const data = await testService.submitAttempt(req.params.id, req.user, { auto: true });
  res.json({ success: true, data });
}

export async function attempts(req, res) {
  const data = await testService.getAttemptHistory(req.user, req.params.id || req.query.test_id || null);
  res.json({ success: true, data });
}

export async function leaderboard(req, res) {
  const data = await testService.getLeaderboard(req.params.id);
  res.json({ success: true, data });
}

export async function gradingQueue(req, res) {
  const data = await gradingService.getGradingQueue(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function attemptDetail(req, res) {
  const data = await gradingService.getAttemptDetail(
    req.params.id,
    req.params.attemptId,
    req.user
  );
  res.json({ success: true, data });
}

export async function gradeAttempt(req, res) {
  const data = await gradingService.gradeAttemptAnswers(
    req.params.id,
    req.params.attemptId,
    req.body,
    req.user
  );
  res.json({ success: true, data });
}

export async function testAnalytics(req, res) {
  const facultyId = req.user.role === 'faculty' ? req.user._id : null;
  const data = await analyticsService.getTestPerformanceAnalytics(req.params.id, facultyId);
  if (!data) {
    return res.status(404).json({ success: false, message: 'Test not found' });
  }
  res.json({ success: true, data });
}

