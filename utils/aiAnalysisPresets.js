const BUILTIN_PRESETS = [
  {
    id: 'builtin:traffic',
    name: 'Traffic analysis',
    description: 'Analyze traffic trends, top pages, and anomalies.',
    visibility: 'public',
    readonly: true,
    version: 1,
    definition: {
      focusAreas: ['traffic'],
      promptTemplate:
        'Focus primarily on traffic (pageviews), trends over time, top pages, and unusual spikes/drops. Suggest instrumentation improvements if acquisition/referrer/utm data is missing.',
    },
  },
  {
    id: 'builtin:errors',
    name: 'Errors analysis',
    description: 'Analyze error spikes, top error fingerprints, and likely regressions.',
    visibility: 'public',
    readonly: true,
    version: 1,
    definition: {
      focusAreas: ['errors'],
      promptTemplate:
        'Focus primarily on errors: spikes, top fingerprints, new vs recurring issues, affected pages/devices/browsers when available, and prioritization guidance.',
    },
  },
  {
    id: 'builtin:performance',
    name: 'Performance & bottlenecks',
    description: 'Analyze web vitals + timed events to find bottlenecks.',
    visibility: 'public',
    readonly: true,
    version: 1,
    definition: {
      focusAreas: ['performance', 'timedEvents'],
      promptTemplate:
        'Focus primarily on performance: web vitals percentiles and slow timed events. Highlight bottlenecks and propose concrete optimizations and next measurements.',
    },
  },
  {
    id: 'builtin:ecommerce-spikes',
    name: 'Ecommerce buy spikes',
    description:
      'Detect anomalies/spikes around purchase intent; infer candidate conversion events from event names/properties.',
    visibility: 'public',
    readonly: true,
    version: 1,
    definition: {
      focusAreas: ['ecommerce', 'traffic', 'events'],
      promptTemplate:
        'Focus on ecommerce buy spikes. There are no canonical event names. Infer likely conversion events from event names and properties (purchase/order/checkout/payment). Identify spikes and hypothesize causes (traffic sources, top pages, errors, perf regressions). Suggest a canonical instrumentation spec to adopt.',
    },
  },
];

function isBuiltinPresetId(presetId) {
  return typeof presetId === 'string' && presetId.startsWith('builtin:');
}

function getBuiltinPreset(presetId) {
  return BUILTIN_PRESETS.find((p) => p.id === presetId) || null;
}

module.exports = {
  BUILTIN_PRESETS,
  isBuiltinPresetId,
  getBuiltinPreset,
};
