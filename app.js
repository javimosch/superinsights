const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const projectRouter = require('./routes/projects');
const ingestionRouter = require('./routes/ingestion');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev'));

app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
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

// Routes
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/projects', projectRouter);

// Ingestion API (CORS-enabled for SDKs)
app.use('/v1', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use('/v1', ingestionRouter);

// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
