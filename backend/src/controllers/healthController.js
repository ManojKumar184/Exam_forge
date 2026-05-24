export function health(req, res) {
  res.json({
    success: true,
    data: {
      service: 'examforge-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
}
