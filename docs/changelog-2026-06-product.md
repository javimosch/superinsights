<div class="feature-card rounded-xl p-6">
  <div class="flex items-start gap-4">
    <div class="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
      <span class="text-2xl">🖱️</span>
    </div>
    <div>
      <h3 class="text-xl font-semibold text-white mb-2">Autocapture — opt-in DOM click tracking</h3>
      <p class="text-slate-400 leading-relaxed">The browser SDK can now automatically capture clicks on configured elements (buttons, styled links) without manual <code>si.track()</code> calls. Disabled by default, opt-in with configurable selectors. Captures tag, text, href, CSS selector, viewport position, and all <code>data-*</code> attributes for rich context. Debounced and respects <code>data-si-opt-out</code> for privacy.</p>
    </div>
  </div>
</div>

<div class="feature-card rounded-xl p-6">
  <div class="flex items-start gap-4">
    <div class="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
      <span class="text-2xl">🌍</span>
    </div>
    <div>
      <h3 class="text-xl font-semibold text-white mb-2">IP + geolocation on every event</h3>
      <p class="text-slate-400 leading-relaxed">All analytics events (pageviews, clicks, errors, performance) now capture the client IP and resolve it to a country code. Country data comes from a self-building DIY lookup using free RIR delegated stats — no MaxMind license key needed, updated daily.</p>
    </div>
  </div>
</div>

<div class="feature-card rounded-xl p-6">
  <div class="flex items-start gap-4">
    <div class="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
      <span class="text-2xl">🔒</span>
    </div>
    <div>
      <h3 class="text-xl font-semibold text-white mb-2">Security hardening & ingestion resilience</h3>
      <p class="text-slate-400 leading-relaxed">Multiple security and reliability improvements: CORS allowlist, rate limiting, API key authentication for sendBeacon, .dockerignore to keep secrets out of build context, graceful shutdown, and event spooling during database outages.</p>
    </div>
  </div>
</div>
