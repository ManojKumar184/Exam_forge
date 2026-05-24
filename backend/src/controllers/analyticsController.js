import * as analyticsService from '../services/analyticsService.js';

export async function adminAnalytics(req, res) {
  const data = await analyticsService.getAdminAnalytics();
  res.json({ success: true, data });
}

export async function facultyAnalytics(req, res) {
  const data = await analyticsService.getFacultyAnalytics(req.user._id);
  res.json({ success: true, data });
}

export async function studentAnalytics(req, res) {
  const data = await analyticsService.getStudentAnalytics(req.user._id);
  res.json({ success: true, data });
}

