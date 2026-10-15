const supportReportService = require('../services/supportReportService');

function getAuthenticatedUserId(req) {
  return req.auth && req.auth.userId
    ? req.auth.userId
    : req.user && req.user.id;
}

// POST /api/v1/support/reports — the signed-in player files a problem report.
async function createReport(req, res, next) {
  try {
    const report = await supportReportService.createReport({
      reporter: req.user,
      body: req.body,
    });
    return res.status(201).json({ message: 'Your report was submitted.', report });
  } catch (error) {
    return next(error);
  }
}

// GET /api/v1/admin/reports?page=1&limit=20&status=OPEN
async function listReports(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    return res.json(await supportReportService.listReports(req.query));
  } catch (error) {
    return next(error);
  }
}

// PATCH /api/v1/admin/reports/:reportId/status with { status: "OPEN" | "RESOLVED" }
async function updateReportStatus(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const report = await supportReportService.updateReportStatus({
      reportId: req.params.reportId,
      body: req.body,
      actingUserId: getAuthenticatedUserId(req),
    });
    return res.json({ message: 'Report status updated', report });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createReport,
  listReports,
  updateReportStatus,
};
