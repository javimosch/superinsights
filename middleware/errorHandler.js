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

function errorHandler(err, req, res, next) {
  const status = res.statusCode >= 400 ? res.statusCode : 500;

  res.locals = res.locals || {};
  res.locals._requestErrorLogged = true;

  const userId = req?.session?.user?.id;
  const projectId = req?.project?._id;

  console.error('[request_error]', {
    method: req.method,
    url: req.originalUrl,
    status,
    ip: req.ip,
    userId: userId ? String(userId) : null,
    projectId: projectId ? String(projectId) : null,
  });
  console.error(err);

  res.status(status);

  if (req.accepts('html')) {
    return res.render('error', {
      message: err.message || 'Server error',
      status,
    });
  }

  if (req.accepts('json')) {
    return res.json({ error: err.message || 'Server error', status });
  }

  return res.type('txt').send(err.message || 'Server error');
}

module.exports = { notFound, errorHandler };
