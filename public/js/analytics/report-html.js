const { createApp: createReportHtmlApp, ref: reportHtmlRef } = Vue;

const reportHtmlConfig = window.reportHtmlConfig || {};

createReportHtmlApp({
  setup() {
    const project = reportHtmlRef(reportHtmlConfig.project || null);
    const context = reportHtmlRef(reportHtmlConfig.context || null);

    function toTrendDataset(rows, label, color) {
      const labels = (rows || []).map((r) => r.date);
      const values = (rows || []).map((r) => Number(r.count || 0));
      return {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: color,
            backgroundColor: color,
            tension: 0.25,
            fill: false,
          },
        ],
      };
    }

    function renderLineChart(canvasId, data, yLabel) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      // Chart is provided globally by Chart.js script include
      new Chart(el, {
        type: 'line',
        data,
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true },
          },
          scales: {
            x: { ticks: { maxTicksLimit: 8 } },
            y: { beginAtZero: true, title: { display: !!yLabel, text: yLabel } },
          },
        },
      });
    }

    Vue.onMounted(() => {
      if (context.value?.pageviews?.viewsByDay) {
        renderLineChart(
          'pageviewsTrend',
          toTrendDataset(context.value.pageviews.viewsByDay, 'Views', '#2563eb'),
          'Views',
        );
      }
      if (context.value?.events?.eventsByDay) {
        renderLineChart(
          'eventsTrend',
          toTrendDataset(context.value.events.eventsByDay, 'Events', '#16a34a'),
          'Events',
        );
      }
      if (context.value?.errors?.errorsByDay) {
        renderLineChart(
          'errorsTrend',
          toTrendDataset(context.value.errors.errorsByDay, 'Errors', '#dc2626'),
          'Errors',
        );
      }
    });

    return {
      project,
      context,
    };
  },
}).mount('#app');
