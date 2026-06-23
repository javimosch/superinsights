        <div class="feature-card rounded-xl p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">📈</span>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-white mb-2">Reliable analytics tracking</h3>
              <p class="text-slate-400 leading-relaxed">Page views are now captured dependably from embedded sites — including the unload "beacon" path browsers use when a visitor leaves quickly. Fixed the cross-origin (CORS) and authentication gaps that were silently dropping events.</p>
            </div>
          </div>
        </div>
        <div class="feature-card rounded-xl p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">🔁</span>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-white mb-2">Self-healing reliability</h3>
              <p class="text-slate-400 leading-relaxed">The service now reconnects to the database automatically after an outage instead of going quietly dead, exposes <code>/healthz</code> and <code>/readyz</code> health checks with a container healthcheck, shuts down gracefully on deploys, and spools incoming events to disk during a database blip so nothing is lost.</p>
            </div>
          </div>
        </div>
        <div class="feature-card rounded-xl p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">🛡️</span>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-white mb-2">Security hardening</h3>
              <p class="text-slate-400 leading-relaxed">Stopped leaking internal error details to clients, refuse to start with default/missing secrets, locked down CORS on authenticated routes, escaped user input in log search, and added per-IP rate limiting plus a body-size cap to the public ingestion endpoints.</p>
            </div>
          </div>
        </div>
        <div class="feature-card rounded-xl p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">🐳</span>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-white mb-2">Safer deployments</h3>
              <p class="text-slate-400 leading-relaxed">Secrets and the <code>.env</code> file are no longer mounted into the running container or baked into the build context, and the deploy now ships only application code plus a readiness healthcheck.</p>
            </div>
          </div>
        </div>
        <div class="feature-card rounded-xl p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">✅</span>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-white mb-2">Tests &amp; continuous integration</h3>
              <p class="text-slate-400 leading-relaxed">Added an automated test suite (escaping, secrets validation, rate limiting, ingestion spool) that runs in CI on every change — replacing the previous "no tests" placeholder.</p>
            </div>
          </div>
        </div>
