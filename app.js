const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { middleware: saasbackendMiddleware } = require(process.env.NODE_ENV === 'production' ? 'saasbackend' : './ref-saasbackend');

const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const projectRouter = require('./routes/projects');
const aiAnalysisRouter = require('./routes/ai-analysis');
const publicRouter = require('./routes/public');
const invitesRouter = require('./routes/invites');
const ingestionRouter = require('./routes/ingestion');
const orgRouter = require('./routes/org');
const docsController = require('./controllers/docsController');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { loadUserOrgs, exposeOrgContextToViews } = require('./middleware/orgContext');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

const sessionSameSite = (process.env.SESSION_SAMESITE || 'lax').toLowerCase();
const sessionDomain = process.env.SESSION_DOMAIN || undefined;

const trustProxyEnabled =
  isProduction || String(process.env.TRUST_PROXY || '') === '1';

if (trustProxyEnabled) {
  app.set('trust proxy', 1);
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );

  const requestedHeaders = req.header('Access-Control-Request-Headers');
  res.header(
    'Access-Control-Allow-Headers',
    requestedHeaders || 'Authorization, X-API-Key, Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.get('/sdk/superinsights.js', (req, res) => {
  if (!isProduction) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  return res.sendFile(path.join(__dirname, 'public', 'sdk', 'superinsights.js'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev'));

app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    proxy: trustProxyEnabled,
    store: MongoStore.create({
      mongoUrl:
        process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/superinsights',
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 14,
    }),
    cookie: {
      httpOnly: true,
      domain: sessionDomain,
      sameSite: sessionSameSite,
      secure: sessionSameSite === 'none' ? 'auto' : isProduction ? 'auto' : false,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.publicUrl = process.env.PUBLIC_URL || null;
  res.locals.request = req;
  next();
});

 app.use(loadUserOrgs);
 app.use(exposeOrgContextToViews);

app.use((req, res, next) => {
  if (String(process.env.DEBUG_AUTH || '') !== '1') return next();

  const originalRedirect = res.redirect.bind(res);
  res.redirect = (url) => {
    const user = req?.session?.user;
    console.error('[debug_auth_redirect]', {
      method: req.method,
      url: req.originalUrl,
      to: url,
      userId: user?.id || null,
      email: user?.email || null,
      role: user?.role || null,
    });
    return originalRedirect(url);
  };

  const user = req?.session?.user;
  console.error('[debug_auth_request]', {
    method: req.method,
    url: req.originalUrl,
    hasCookie: Boolean(req.headers.cookie),
    sidCookiePresent: Boolean(req.headers.cookie && req.headers.cookie.includes('sid=')),
    userId: user?.id || null,
    email: user?.email || null,
    role: user?.role || null,
  });

  return next();
});

app.use((req, res, next) => {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status < 400 || status >= 500) return;

    if (res.locals && res.locals._requestErrorLogged) return;

    const userId = req?.session?.user?.id;
    const projectId = req?.project?._id;

    console.error('[request_4xx]', {
      method: req.method,
      url: req.originalUrl,
      status,
      ip: req.ip,
      userId: userId ? String(userId) : null,
      projectId: projectId ? String(projectId) : null,
    });
  });

  next();
});

app.use(
  '/saas',
  saasbackendMiddleware({
    mongodbUri: process.env.MONGODB_URI,
    corsOrigin: process.env.CORS_ORIGIN || '*',
  })
);

// Routes
app.use('/', indexRouter);
app.use('/', invitesRouter);
app.use('/org', orgRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/ai-analysis', aiAnalysisRouter);
app.use('/projects', projectRouter);

// Public docs routes (no authentication required)
app.get('/docs', docsController.getDocs);
app.get('/docs/:section', docsController.getDocs);
app.use('/docs', publicRouter);

// Other public routes
app.use('/p', publicRouter);

// Ingestion API (CORS-enabled for SDKs)
app.use('/v1', (req, res, next) => {
  return next();
});

app.use('/v1', ingestionRouter);

// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
