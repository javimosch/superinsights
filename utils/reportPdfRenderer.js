const PDFDocument = require('pdfkit');

function formatDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch (e) {
    return String(d || '');
  }
}

function renderKeyValue(doc, label, value, { width = 500 } = {}) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true, width });
  doc.font('Helvetica').text(value == null ? '—' : String(value), { width });
}

function renderSectionTitle(doc, title) {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(14).text(title);
  doc.fontSize(11);
  doc.moveDown(0.3);
}

function buildPdfBuffer(context) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];

      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const meta = context && context.meta ? context.meta : {};

      doc.font('Helvetica-Bold').fontSize(18).text(`${meta.projectIcon || '📊'} ${meta.projectName || 'Project'} — Report`);
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(11);
      renderKeyValue(doc, 'Data type', meta.dataType);
      renderKeyValue(doc, 'Period', `${formatDate(meta.start)} → ${formatDate(meta.end)}`);
      renderKeyValue(doc, 'Generated', formatDate(meta.generatedAt));

      renderSectionTitle(doc, 'Summary');
      renderKeyValue(doc, 'Total count', context?.summary?.totalCount != null ? context.summary.totalCount : 0);

      if (context && context.pageviews) {
        renderSectionTitle(doc, 'Pageviews');
        renderKeyValue(doc, 'Total views', context.pageviews.totalViews);
        renderKeyValue(doc, 'Unique visitors', context.pageviews.uniqueVisitors);
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').text('Top pages');
        doc.font('Helvetica');
        const rows = context.pageviews.topPages || [];
        if (!rows.length) {
          doc.text('—');
        } else {
          for (const r of rows) {
            doc.text(`${r.url} — ${r.views} views (${r.uniqueVisitors} unique)`);
          }
        }
      }

      if (context && context.events) {
        renderSectionTitle(doc, 'Events');
        renderKeyValue(doc, 'Total events', context.events.totalEvents);
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').text('Top events');
        doc.font('Helvetica');
        const rows = context.events.topEvents || [];
        if (!rows.length) {
          doc.text('—');
        } else {
          for (const r of rows) {
            doc.text(`${r.eventName} — ${r.count}`);
          }
        }
      }

      if (context && context.errors) {
        renderSectionTitle(doc, 'Errors');
        renderKeyValue(doc, 'Total errors', context.errors.totalErrors);
        renderKeyValue(doc, 'Unique fingerprints', context.errors.uniqueFingerprints);
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').text('Top errors');
        doc.font('Helvetica');
        const rows = context.errors.topFingerprints || [];
        if (!rows.length) {
          doc.text('—');
        } else {
          for (const r of rows) {
            doc.text(`${r.errorType || 'Error'} — ${r.count} — ${r.message}`);
          }
        }
      }

      if (context && context.performance) {
        renderSectionTitle(doc, 'Performance');
        renderKeyValue(doc, 'Total measurements', context.performance.totalMeasurements);
        const p = context.performance.percentiles || {};
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').text('Percentiles');
        doc.font('Helvetica');
        doc.text(`LCP p50/p75/p95: ${p.lcp_p50 ?? '—'} / ${p.lcp_p75 ?? '—'} / ${p.lcp_p95 ?? '—'}`);
        doc.text(`CLS p50/p75/p95: ${p.cls_p50 ?? '—'} / ${p.cls_p75 ?? '—'} / ${p.cls_p95 ?? '—'}`);
        doc.text(`FID p50/p75/p95: ${p.fid_p50 ?? '—'} / ${p.fid_p75 ?? '—'} / ${p.fid_p95 ?? '—'}`);
        doc.text(`TTFB p50/p75/p95: ${p.ttfb_p50 ?? '—'} / ${p.ttfb_p75 ?? '—'} / ${p.ttfb_p95 ?? '—'}`);
      }

      if (context && context.aiInsights && context.aiInsights.markdown) {
        renderSectionTitle(doc, 'AI insights');
        doc.font('Helvetica').text(String(context.aiInsights.markdown));
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildPdfBuffer,
};
