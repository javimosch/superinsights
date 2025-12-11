exports.getHome = (req, res, next) => {
  try {
    res.render('index', {
      title: 'SuperInsights',
      message: 'Welcome to the SuperInsights starter app',
    });
  } catch (err) {
    next(err);
  }
};
