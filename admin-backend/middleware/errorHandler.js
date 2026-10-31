/*
 * Error handling with safe messages only.
 *
 * Anything unexpected is reduced to "Internal server error" so stack traces,
 * configuration values or library errors can never reach an API response.
 */

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const proposedStatus = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const statusCode = proposedStatus >= 400 && proposedStatus <= 599 ? proposedStatus : 500;

  let message;
  if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && statusCode === 400)) {
    message = 'Malformed JSON request';
  } else if (error?.type === 'entity.too.large') {
    message = 'Request body is too large';
  } else if (statusCode >= 500) {
    message = 'Internal server error';
  } else if (error?.expose === true) {
    message = error.message || 'Request failed';
  } else {
    message = 'Invalid request data';
  }

  return res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
