const express = require('express');
const path = require('path');
const morgan = require('morgan');

const indexRouter = require('./routes/index');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev'));

// Routes
app.use('/', indexRouter);

// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
