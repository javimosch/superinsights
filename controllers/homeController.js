exports.getHome = (req, res, next) => {
  try {
    if (req.session && req.session.user) {
      return res.redirect('/projects');
    }

    res.render('index', {
      title: 'SuperInsights',
      message: 'Welcome to the SuperInsights starter app',
    });
  } catch (err) {
    next(err);
  }
};
