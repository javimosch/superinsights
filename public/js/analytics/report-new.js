const { createApp: createReportNewApp, ref: reportNewRef } = Vue;

const reportNewConfig = window.reportNewConfig || {};

createReportNewApp({
  setup() {
    const project = reportNewRef(reportNewConfig.project || null);
    const base = reportNewConfig.base || '';
    const templates = reportNewRef(reportNewConfig.templates || []);

    const name = reportNewRef('');
    const format = reportNewRef('pdf');
    const csvMode = reportNewRef('aggregated');
    const dataType = reportNewRef('pageviews');
    const timeframe = reportNewRef('7d');
    const startDate = reportNewRef('');
    const endDate = reportNewRef('');

    const clientId = reportNewRef('');
    const userId = reportNewRef('');
    const deviceType = reportNewRef('');
    const browser = reportNewRef('');
    const os = reportNewRef('');
    const utmSource = reportNewRef('');
    const utmMedium = reportNewRef('');
    const utmCampaign = reportNewRef('');
    const metaPairs = reportNewRef([]);

    const selectedTemplateId = reportNewRef('');

    const includeAiInsights = reportNewRef(false);

    const saveTemplate = reportNewRef(false);
    const templateName = reportNewRef('');

    const running = reportNewRef(false);
    const error = reportNewRef('');
    const createdReportId = reportNewRef('');

    function addMetaPair() {
      metaPairs.value.push({ key: '', value: '' });
    }

    function removeMetaPair(idx) {
      metaPairs.value.splice(idx, 1);
    }

    function applyTemplate() {
      const tid = selectedTemplateId.value;
      if (!tid) return;
      const t = templates.value.find((x) => String(x._id) === String(tid));
      if (!t || !t.filters) return;
      clientId.value = t.filters.clientId || '';
      userId.value = t.filters.userId || '';

      if (t.timeframe) timeframe.value = t.timeframe;
      if (t.startDate) startDate.value = String(t.startDate).slice(0, 16);
      if (t.endDate) endDate.value = String(t.endDate).slice(0, 16);

      deviceType.value = t.filters.deviceType || '';
      browser.value = t.filters.browser || '';
      os.value = t.filters.os || '';
      utmSource.value = t.filters.utmSource || '';
      utmMedium.value = t.filters.utmMedium || '';
      utmCampaign.value = t.filters.utmCampaign || '';

      const meta = (t.filters.meta && typeof t.filters.meta === 'object') ? t.filters.meta : {};
      metaPairs.value = Object.entries(meta).map(([k, v]) => ({ key: k, value: String(v) }));
    }

    async function generate() {
      running.value = true;
      error.value = '';

      try {
        const meta = {};
        for (const row of metaPairs.value || []) {
          const k = row && row.key ? String(row.key).trim() : '';
          const v = row && row.value ? String(row.value).trim() : '';
          if (!k || !v) continue;
          meta[k] = v;
        }

        const payload = {
          name: name.value || 'Report',
          dataType: dataType.value,
          timeframe: timeframe.value,
          startDate: startDate.value,
          endDate: endDate.value,
          format: format.value,
          csvMode: format.value === 'csv' ? (csvMode.value || 'aggregated') : undefined,
          includeAiInsights: includeAiInsights.value,
          clientId: clientId.value || undefined,
          userId: userId.value || undefined,
          deviceType: deviceType.value || undefined,
          browser: browser.value || undefined,
          os: os.value || undefined,
          utmSource: utmSource.value || undefined,
          utmMedium: utmMedium.value || undefined,
          utmCampaign: utmCampaign.value || undefined,
          meta: Object.keys(meta).length ? meta : undefined,
        };

        const resp = await fetch(`${base}/reports/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await resp.json();
        if (!resp.ok) {
          error.value = (json && (json.details || json.error)) ? (json.details || json.error) : 'Failed to generate report';
          return;
        }

        createdReportId.value = json.reportId;

        if (saveTemplate.value && templateName.value) {
          await fetch(`${base}/filter-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: templateName.value,
              description: '',
              timeframe: timeframe.value,
              startDate: startDate.value,
              endDate: endDate.value,
              clientId: clientId.value || undefined,
              userId: userId.value || undefined,
              deviceType: deviceType.value || undefined,
              browser: browser.value || undefined,
              os: os.value || undefined,
              utmSource: utmSource.value || undefined,
              utmMedium: utmMedium.value || undefined,
              utmCampaign: utmCampaign.value || undefined,
              meta: Object.keys(meta).length ? meta : undefined,
            }),
          });
        }

        window.location.href = `${base}/reports/${encodeURIComponent(json.reportId)}`;
      } catch (e) {
        error.value = 'Failed to generate report';
      } finally {
        running.value = false;
      }
    }

    return {
      project,
      base,
      templates,
      name,
      format,
      csvMode,
      dataType,
      timeframe,
      startDate,
      endDate,
      clientId,
      userId,
      deviceType,
      browser,
      os,
      utmSource,
      utmMedium,
      utmCampaign,
      metaPairs,
      selectedTemplateId,
      includeAiInsights,
      saveTemplate,
      templateName,
      running,
      error,
      createdReportId,
      addMetaPair,
      removeMetaPair,
      applyTemplate,
      generate,
    };
  },
}).mount('#app');
