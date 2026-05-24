import * as testService from '../services/testService.js';

export async function getTestLeaderboard(req, res) {
  const data = await testService.getLeaderboard(req.params.testId);
  res.json({ success: true, data });
}

