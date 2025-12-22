// Report Detail Vue Application
const { createApp: createReportDetailApp, computed: reportDetailComputed, ref: reportDetailRef } = Vue;

const reportDetailConfig = window.reportDetailConfig || {};

createReportDetailApp({
  setup() {
    const project = reportDetailRef(reportDetailConfig.project || null);
    const base = reportDetailConfig.base || '';
    const reportId = reportDetailConfig.reportId || '';
    const canGenerate = Boolean(reportDetailConfig.canGenerate);

    const status = reportDetailRef(reportDetailConfig.status || 'pending');
    const message = reportDetailRef(reportDetailConfig.message || '');
    const fileSize = reportDetailRef(reportDetailConfig.fileSize || null);
    const currentStage = reportDetailRef(reportDetailConfig.currentStage || null);
    const stages = reportDetailRef(reportDetailConfig.stages || []);
    const etaSeconds = reportDetailRef(null);

    const error = reportDetailRef('');

    const fileSizeLabel = reportDetailComputed(() => {
      if (!fileSize.value) return '—';
      const bytes = Number(fileSize.value);
      if (!Number.isFinite(bytes)) return '—';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    });

    function badgeClass(s) {
      if (s === 'completed') return 'badge-success';
      if (s === 'failed') return 'badge-error';
      if (s === 'generating') return 'badge-warning';
      return 'badge-ghost';
    }

    async function pollOnce() {
      try {
        const resp = await fetch(`${base}/reports/${encodeURIComponent(reportId)}/status`);
        const json = await resp.json();
        if (!resp.ok) return;
        status.value = json.status;
        message.value = json.message || '';
        fileSize.value = json.fileSize || null;
        currentStage.value = json.currentStage || null;
        stages.value = json.stages || [];
        etaSeconds.value = json.estimatedSecondsRemaining != null ? json.estimatedSecondsRemaining : null;
      } catch (e) {
        // ignore
      }
    }

    let pollTimer = null;
    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        await pollOnce();
        if (status.value === 'completed' || status.value === 'failed') {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 2000);
    }

    async function retry() {
      error.value = '';
      try {
        const r = reportDetailConfig.report || {};
        const resp = await fetch(`${base}/reports/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.name,
            dataType: r.dataType,
            timeframe: r.timeframe,
            startDate: r.startDate || '',
            endDate: r.endDate || '',
            format: r.format,
            includeAiInsights: Boolean(r.includeAiInsights),
          }),
        });
        const json = await resp.json();
        if (!resp.ok) {
          error.value = json && (json.details || json.error) ? (json.details || json.error) : 'Failed to retry';
          return;
        }
        window.location.href = `${base}/reports/${encodeURIComponent(json.reportId)}`;
      } catch (e) {
        error.value = 'Failed to retry';
      }
    }

    async function deleteReport() {
      error.value = '';
      try {
        const resp = await fetch(`${base}/reports/${encodeURIComponent(reportId)}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await resp.json();
        if (!resp.ok || !json || !json.success) {
          error.value = (json && (json.error || json.details)) ? (json.error || json.details) : 'Failed to delete';
          return;
        }
        window.location.href = `${base}/reports`;
      } catch (e) {
        error.value = 'Failed to delete';
      }
    }

    Vue.onMounted(() => {
      if (status.value === 'pending' || status.value === 'generating') {
        startPolling();
      }
    });

    return {
      project,
      base,
      reportId,
      canGenerate,
      status,
      message,
      fileSizeLabel,
      currentStage,
      stages,
      etaSeconds,
      badgeClass,
      error,
      retry,
      deleteReport,
    };
  },
}).mount('#app');

