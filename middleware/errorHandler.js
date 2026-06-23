function notFound(req, res, next) {
  res.status(404);

  if (req.accepts('html')) {
    return res.render('404', { url: req.originalUrl });
  }

  if (req.accepts('json')) {
    return res.json({ error: 'Not found', url: req.originalUrl });
  }

  return res.type('txt').send('Not found');
}

const { logError } = require('../utils/aggregatedLogger');
const { logRawError } = require('../utils/rawLogger');

function errorHandler(err, req, res, next) {
  const status = res.statusCode >= 400 ? res.statusCode : 500;

  res.locals = res.locals || {};
  res.locals._requestErrorLogged = true;

  const userId = req?.session?.user?.id;
  const email = req?.session?.user?.email;
  const projectId = req?.project?._id;

  try {
    logError(err && err.message ? err.message : 'Unknown error', {
      userId: userId ? String(userId) : null,
      email: email ? String(email) : null,
      projectId: projectId ? String(projectId) : null,
      status,
      method: req.method,
      path: req.originalUrl,
    });

    logRawError(err, {
      userId: userId ? String(userId) : null,
      email: email ? String(email) : null,
      projectId: projectId ? String(projectId) : null,
      status,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });
  } catch (e) {
    // ignore
  }

  console.error('[request_error]', {
    method: req.method,
    url: req.originalUrl,
    status,
    ip: req.ip,
    userId: userId ? String(userId) : null,
    email: email ? String(email) : null,
    projectId: projectId ? String(projectId) : null,
  });
  console.error(err);

  res.status(status);

  // Never leak internal error details to clients in production. 5xx errors
  // surface internals (stack frames, DB driver/collection names, Mongoose
  // buffering messages) so they collapse to a generic string; 4xx messages are
  // intentional client-facing validation/auth text and are kept. Full detail is
  // already captured server-side above (logRawError + console.error).
  const isProduction = process.env.NODE_ENV === 'production';
  const clientMessage =
    status >= 500 && isProduction
      ? 'Internal server error'
      : err.message || 'Server error';

  if (req.accepts('html')) {
    return res.render('error', {
      message: clientMessage,
      status,
    });
  }

  if (req.accepts('json')) {
    return res.json({ error: clientMessage, status });
  }

  return res.type('txt').send(clientMessage);
}

module.exports = { notFound, errorHandler };
