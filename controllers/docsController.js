const fs = require('fs');
const path = require('path');

const docsController = {
  getDocs: async (req, res) => {
    try {
      const { marked } = await import('marked');
      const section = req.params.section || 'sdk';

      let content = '';
      let title = 'SuperInsights Documentation';

      if (section === 'sdk') {
        // Serve the SDK README content
        const sdkReadmePath = path.join(__dirname, '..', 'public', 'sdk', 'README.md');
        content = fs.readFileSync(sdkReadmePath, 'utf8');
        title = 'SuperInsights Browser SDK';
      } else {
        // For future sections, we could serve other docs
        const docsPath = path.join(__dirname, '..', 'docs', `${section}.md`);
        if (fs.existsSync(docsPath)) {
          content = fs.readFileSync(docsPath, 'utf8');
          title = `${section.charAt(0).toUpperCase() + section.slice(1)} Documentation`;
        } else {
          return res.status(404).render('404', { title: 'Documentation Not Found' });
        }
      }

      // Convert markdown to HTML
      const htmlContent = marked(content);

      res.render('docs/index', {
        title,
        content: htmlContent,
        section
      });
    } catch (error) {
      console.error('docsController getDocs error:', { message: error.message, stack: error.stack });
      res.status(500).render('error', {
        title: 'Documentation Error',
        message: 'Unable to load documentation'
      });
    }
  }
};

module.exports = docsController;
