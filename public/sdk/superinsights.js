(function (global) {
  'use strict';

  var SuperInsights = {};

  var _initialized = false;
  var _enabled = true;

  var _apiKey = null;
  var _config = {
    apiUrl: '',
    batchSize: 20,
    flushInterval: 5000,
    debug: false,
  };

  var _user = {
    userId: null,
    traits: null,
  };

  var _queues = {
    pageviews: [],
    events: [],
    errors: [],
    performance: [],
  };

  var _flushTimerId = null;

  var _sessionTtlMs = 30 * 60 * 1000;
  var _clientIdKey = 'si_client_id';
  var _sessionKey = 'si_session_id';
  var _sessionTsKey = 'si_session_ts';

  var _cachedUtm = null;
  var _env = null;

  var _errorFingerprints = {};

  var _perf = {
    lcp: null,
    fid: null,
    cls: 0,
    ttfb: null,
    sent: false,
  };

  function _isDntEnabled() {
    try {
      var dnt = global.navigator && (global.navigator.doNotTrack || global.navigator.msDoNotTrack || global.doNotTrack);
      return dnt === '1' || dnt === 'yes';
    } catch (e) {
      return false;
    }
  }

  function _log() {
    try {
      if (_config && _config.debug && global.console && typeof global.console.log === 'function') {
        global.console.log.apply(global.console, arguments);
      }
    } catch (e) {
      // ignore
    }
  }

  function _nowIso() {
    try {
      return new Date().toISOString();
    } catch (e) {
      return '';
    }
  }

  function _generateUUID() {
    var d = new Date().getTime();
    var d2 = (global.performance && typeof global.performance.now === 'function') ? global.performance.now() : 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16;
      if (d > 0) {
        r = (d + r) % 16 | 0;
        d = Math.floor(d / 16);
      } else {
        r = (d2 + r) % 16 | 0;
        d2 = Math.floor(d2 / 16);
      }
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function _safeGetLocalStorage() {
    try {
      return global.localStorage;
    } catch (e) {
      return null;
    }
  }

  function _getClientId() {
    var ls = _safeGetLocalStorage();
    if (!ls) return _generateUUID();

    try {
      var existing = ls.getItem(_clientIdKey);
      if (existing) return existing;
      var id = _generateUUID();
      ls.setItem(_clientIdKey, id);
      return id;
    } catch (e) {
      return _generateUUID();
    }
  }

  function _getSessionId() {
    var ls = _safeGetLocalStorage();
    var now = new Date().getTime();

    if (!ls) return _generateUUID();

    try {
      var sid = ls.getItem(_sessionKey);
      var tsRaw = ls.getItem(_sessionTsKey);
      var ts = tsRaw ? parseInt(tsRaw, 10) : 0;

      if (!sid || !ts || (now - ts) > _sessionTtlMs) {
        sid = _generateUUID();
        ls.setItem(_sessionKey, sid);
      }

      ls.setItem(_sessionTsKey, String(now));
      return sid;
    } catch (e) {
      return _generateUUID();
    }
  }

  function _refreshSession() {
    var ls = _safeGetLocalStorage();
    if (!ls) return;

    try {
      ls.setItem(_sessionTsKey, String(new Date().getTime()));
    } catch (e) {
      // ignore
    }
  }

  function _detectBrowser() {
    var ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : '';

    var m;
    if ((m = ua.match(/Edg\/(\d+\.?\d*)/))) return { name: 'Edge', version: m[1] };
    if ((m = ua.match(/Chrome\/(\d+\.?\d*)/)) && !ua.match(/Edg\//)) return { name: 'Chrome', version: m[1] };
    if ((m = ua.match(/Firefox\/(\d+\.?\d*)/))) return { name: 'Firefox', version: m[1] };
    if ((m = ua.match(/Version\/(\d+\.?\d*).*Safari/)) && !ua.match(/Chrome\//)) return { name: 'Safari', version: m[1] };
    if ((m = ua.match(/MSIE (\d+\.?\d*)/))) return { name: 'IE', version: m[1] };
    if ((m = ua.match(/Trident\/(\d+\.?\d*).*rv:(\d+\.?\d*)/))) return { name: 'IE', version: m[2] };

    return { name: 'Unknown', version: '' };
  }

  function _detectOS() {
    var ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : '';

    var m;
    if ((m = ua.match(/Windows NT (\d+\.?\d*)/))) return { name: 'Windows', version: m[1] };
    if ((m = ua.match(/Android (\d+\.?\d*)/))) return { name: 'Android', version: m[1] };
    if ((m = ua.match(/iPhone OS (\d+_\d+(_\d+)?)/)) || (m = ua.match(/iPad.*OS (\d+_\d+(_\d+)?)/))) return { name: 'iOS', version: (m[1] || '').replace(/_/g, '.') };
    if ((m = ua.match(/Mac OS X (\d+_\d+(_\d+)?)/))) return { name: 'macOS', version: (m[1] || '').replace(/_/g, '.') };
    if (ua.match(/Linux/)) return { name: 'Linux', version: '' };

    return { name: 'Unknown', version: '' };
  }

  function _detectDeviceType() {
    var ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : '';
    var w = 0;

    try {
      w = global.innerWidth || (global.screen && global.screen.width) || 0;
    } catch (e) {
      w = 0;
    }

    var isTablet = /iPad|Tablet|Silk/.test(ua) || (w >= 768 && w <= 1024 && /Android/.test(ua));
    if (isTablet) return 'tablet';

    var isMobile = /Mobi|Android|iPhone|iPod|IEMobile|Opera Mini/.test(ua) || (w > 0 && w < 768);
    if (isMobile) return 'mobile';

    return 'desktop';
  }

  function _parseUTMParams() {
    var out = {};
    try {
      var qs = global.location && global.location.search ? global.location.search : '';
      if (!qs || qs.length < 2) return out;

      var parts = qs.substring(1).split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        if (!kv || kv.length < 1) continue;

        var k = decodeURIComponent(kv[0] || '');
        var v = decodeURIComponent(kv.slice(1).join('=') || '');

        if (k === 'utm_source' || k === 'utm_medium' || k === 'utm_campaign' || k === 'utm_term' || k === 'utm_content') {
          out[k] = v;
        }
      }

      return out;
    } catch (e) {
      return out;
    }
  }

  function _getUTMParams() {
    if (_cachedUtm) return _cachedUtm;
    _cachedUtm = _parseUTMParams();
    return _cachedUtm;
  }

  function _validateConfig() {
    if (!_apiKey || typeof _apiKey !== 'string') throw new Error('SuperInsights: apiKey is required');
    if (_apiKey.indexOf('pk_') !== 0) throw new Error('SuperInsights: apiKey must start with pk_');

    if (_config.batchSize && (typeof _config.batchSize !== 'number' || _config.batchSize < 1 || _config.batchSize > 100)) {
      throw new Error('SuperInsights: batchSize must be a number between 1 and 100');
    }

    if (_config.flushInterval && (typeof _config.flushInterval !== 'number' || _config.flushInterval < 1000)) {
      throw new Error('SuperInsights: flushInterval must be >= 1000ms');
    }

    if (_config.apiUrl && typeof _config.apiUrl !== 'string') {
      throw new Error('SuperInsights: apiUrl must be a string');
    }
  }

  function _getBaseUrl() {
    if (_config.apiUrl) {
      return _config.apiUrl.replace(/\/$/, '');
    }

    try {
      var origin = (global.location && global.location.origin) ? global.location.origin : '';
      return origin;
    } catch (e) {
      return '';
    }
  }

  function _buildPayload(items) {
    var payload = {
      items: items,
    };

    if (_user && _user.userId) {
      payload.user = {
        userId: _user.userId,
        traits: _user.traits || null,
      };
    }

    return payload;
  }

  function _sendBeacon(endpoint, payloadStr) {
    try {
      if (!global.navigator || typeof global.navigator.sendBeacon !== 'function') return false;

      var blob;
      try {
        blob = new Blob([payloadStr], { type: 'application/json' });
      } catch (e) {
        blob = payloadStr;
      }

      return global.navigator.sendBeacon(endpoint, blob);
    } catch (e) {
      return false;
    }
  }

  function _xhrPost(endpoint, payloadStr, onDone) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + _apiKey);
      xhr.timeout = 10000;

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        onDone(xhr.status, xhr.responseText);
      };

      xhr.ontimeout = function () {
        onDone(0, 'timeout');
      };

      xhr.onerror = function () {
        onDone(0, 'network_error');
      };

      xhr.send(payloadStr);
      return true;
    } catch (e) {
      try {
        onDone(0, 'xhr_exception');
      } catch (e2) {
        // ignore
      }
      return false;
    }
  }

  function _fetchPost(endpoint, payloadStr, onDone) {
    try {
      if (!global.fetch) return false;

      global.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + _apiKey,
        },
        body: payloadStr,
        keepalive: true,
      })
        .then(function (res) {
          onDone(res.status, '');
        })
        .catch(function (err) {
          onDone(0, err && err.message ? err.message : 'fetch_error');
        });

      return true;
    } catch (e) {
      try {
        onDone(0, 'fetch_exception');
      } catch (e2) {
        // ignore
      }
      return false;
    }
  }

  function _retryRequest(endpoint, payloadStr, attempt, done) {
    var delays = [1000, 2000, 4000];

    if (attempt >= delays.length) {
      done(false);
      return;
    }

    global.setTimeout(function () {
      _sendRequestRaw(endpoint, payloadStr, attempt + 1, done);
    }, delays[attempt]);
  }

  function _sendRequestRaw(endpoint, payloadStr, attempt, done) {
    var used = _fetchPost(endpoint, payloadStr, function (status, _text) {
      if (status >= 200 && status < 300) {
        done(true);
        return;
      }

      if (status >= 500 || status === 0) {
        _retryRequest(endpoint, payloadStr, attempt, done);
        return;
      }

      done(false);
    });

    if (used) return;

    _xhrPost(endpoint, payloadStr, function (status, _text) {
      if (status >= 200 && status < 300) {
        done(true);
        return;
      }

      if (status >= 500 || status === 0) {
        _retryRequest(endpoint, payloadStr, attempt, done);
        return;
      }

      done(false);
    });
  }

  function _sendRequest(path, items, useBeacon) {
    var endpoint = _getBaseUrl() + path;
    var payload = _buildPayload(items);

    var payloadStr;
    try {
      payloadStr = JSON.stringify(payload);
    } catch (e) {
      return;
    }

    if (useBeacon) {
      var ok = _sendBeacon(endpoint, payloadStr);
      if (ok) return;
    }

    _sendRequestRaw(endpoint, payloadStr, 0, function (success) {
      _log('SuperInsights request', path, success ? 'ok' : 'failed');
    });
  }

  function _queue(queueName, data) {
    if (!_enabled) return;
    if (_isDntEnabled()) return;

    var q = _queues[queueName];
    if (!q) return;

    q.push(data);

    if (q.length >= _config.batchSize) {
      _flushQueue(queueName, false);
    }
  }

  function _queuePageView(data) {
    _queue('pageviews', data);
  }

  function _queueEvent(data) {
    _queue('events', data);
  }

  function _queueError(data) {
    _queue('errors', data);
  }

  function _queuePerformance(data) {
    _queue('performance', data);
  }

  function _flushQueue(queueName, useBeacon) {
    if (!_enabled) return;

    var q = _queues[queueName];
    if (!q || q.length === 0) return;

    var items = q.splice(0, _config.batchSize);

    if (queueName === 'pageviews') _sendRequest('/v1/pageviews', items, useBeacon);
    if (queueName === 'events') _sendRequest('/v1/events', items, useBeacon);
    if (queueName === 'errors') _sendRequest('/v1/errors', items, useBeacon);
    if (queueName === 'performance') _sendRequest('/v1/performance', items, useBeacon);
  }

  function _flushAllQueues(useBeacon) {
    _flushQueue('pageviews', useBeacon);
    _flushQueue('events', useBeacon);
    _flushQueue('errors', useBeacon);
    _flushQueue('performance', useBeacon);
  }

  function _startFlushTimer() {
    if (_flushTimerId) return;

    _flushTimerId = global.setInterval(function () {
      try {
        _flushAllQueues(false);
      } catch (e) {
        // ignore
      }
    }, _config.flushInterval);
  }

  function _stopFlushTimer() {
    if (!_flushTimerId) return;

    try {
      global.clearInterval(_flushTimerId);
    } catch (e) {
      // ignore
    }
    _flushTimerId = null;
  }

  function _getEnv() {
    if (_env) return _env;

    var browser = _detectBrowser();
    var os = _detectOS();
    var deviceType = _detectDeviceType();

    _env = {
      browser: browser.name,
      browserVersion: browser.version,
      os: os.name,
      osVersion: os.version,
      deviceType: deviceType,
      userAgent: (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : '',
      connectionType: (global.navigator && global.navigator.connection && global.navigator.connection.effectiveType) ? global.navigator.connection.effectiveType : '',
    };

    return _env;
  }

  function _baseContext() {
    var env = _getEnv();

    return {
      clientId: _getClientId(),
      sessionId: _getSessionId(),
      timestamp: _nowIso(),
      deviceType: env.deviceType,
      browser: env.browser,
      browserVersion: env.browserVersion,
      os: env.os,
      osVersion: env.osVersion,
    };
  }

  function _trackPageView() {
    if (!_enabled) return;

    try {
      var base = _baseContext();
      var utm = _getUTMParams();

      var data = {
        url: (global.location && global.location.href) ? global.location.href : '',
        title: global.document && global.document.title ? global.document.title : '',
        referrer: global.document && global.document.referrer ? global.document.referrer : '',
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
        utmTerm: utm.utm_term,
        utmContent: utm.utm_content,
      };

      for (var k in base) data[k] = base[k];

      if (_user && _user.userId) {
        data.userId = _user.userId;
      }

      _queuePageView(data);
      _refreshSession();
    } catch (e) {
      _log('SuperInsights track pageview failed', e);
    }
  }

  function _onPageChange() {
    _trackPageView();
  }

  function _patchHistoryAPI() {
    try {
      if (!global.history) return;

      var originalPush = global.history.pushState;
      var originalReplace = global.history.replaceState;

      if (typeof originalPush === 'function') {
        global.history.pushState = function () {
          var ret = originalPush.apply(global.history, arguments);
          try {
            _onPageChange();
          } catch (e) {
            // ignore
          }
          return ret;
        };
      }

      if (typeof originalReplace === 'function') {
        global.history.replaceState = function () {
          var ret = originalReplace.apply(global.history, arguments);
          try {
            _onPageChange();
          } catch (e) {
            // ignore
          }
          return ret;
        };
      }

      global.addEventListener('popstate', function () {
        try {
          _onPageChange();
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }
  }

  function _simpleHash(str) {
    var h = 5381;
    var i;
    for (i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & 0xffffffff;
    }
    return String(h);
  }

  function _generateErrorFingerprint(message, stack) {
    var first = '';
    try {
      first = (stack || '').split('\n')[0] || '';
    } catch (e) {
      first = '';
    }
    return _simpleHash(String(message || '') + '|' + String(first || ''));
  }

  function _captureError(errorData) {
    try {
      var stack = errorData && errorData.stackTrace ? errorData.stackTrace : '';
      var message = errorData && errorData.message ? errorData.message : '';

      var fp = _generateErrorFingerprint(message, stack);
      if (_errorFingerprints[fp]) return;
      _errorFingerprints[fp] = true;

      var base = _baseContext();
      var env = _getEnv();

      var data = {
        message: message,
        stackTrace: stack,
        sourceFile: errorData.sourceFile || '',
        lineNumber: errorData.lineNumber || null,
        columnNumber: errorData.columnNumber || null,
        context: {
          url: (global.location && global.location.href) ? global.location.href : '',
          userAgent: env.userAgent,
        },
      };

      for (var k in base) data[k] = base[k];

      _queueError(data);
      _refreshSession();
    } catch (e) {
      _log('SuperInsights capture error failed', e);
    }
  }

  function _onWindowError(message, source, lineno, colno, error) {
    if (!_enabled) return;

    try {
      _captureError({
        message: message ? String(message) : 'Unknown error',
        stackTrace: error && error.stack ? String(error.stack) : '',
        sourceFile: source ? String(source) : '',
        lineNumber: typeof lineno === 'number' ? lineno : null,
        columnNumber: typeof colno === 'number' ? colno : null,
      });
    } catch (e) {
      // ignore
    }
  }

  function _onUnhandledRejection(event) {
    if (!_enabled) return;

    try {
      var reason = event && event.reason ? event.reason : null;
      var msg = 'Unhandled promise rejection';
      var stack = '';

      if (typeof reason === 'string') {
        msg = reason;
      } else if (reason && reason.message) {
        msg = reason.message;
      }

      if (reason && reason.stack) {
        stack = reason.stack;
      }

      _captureError({
        message: msg,
        stackTrace: stack,
        sourceFile: '',
        lineNumber: null,
        columnNumber: null,
      });
    } catch (e) {
      // ignore
    }
  }

  function _observeLCP() {
    try {
      if (!global.PerformanceObserver) return;

      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        if (!entries || !entries.length) return;
        var last = entries[entries.length - 1];
        if (last && typeof last.startTime === 'number') {
          _perf.lcp = last.startTime;
        }
      });

      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      // ignore
    }
  }

  function _observeFID() {
    try {
      if (!global.PerformanceObserver) return;

      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        if (!entries || !entries.length) return;
        var e = entries[0];
        if (e && typeof e.processingStart === 'number' && typeof e.startTime === 'number') {
          _perf.fid = e.processingStart - e.startTime;
        }
      });

      po.observe({ type: 'first-input', buffered: true });
    } catch (e) {
      // ignore
    }
  }

  function _observeCLS() {
    try {
      if (!global.PerformanceObserver) return;

      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (!e) continue;
          if (e.hadRecentInput) continue;
          if (typeof e.value === 'number') _perf.cls += e.value;
        }
      });

      po.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      // ignore
    }
  }

  function _measureTTFB() {
    try {
      var nav = null;
      if (global.performance && typeof global.performance.getEntriesByType === 'function') {
        var entries = global.performance.getEntriesByType('navigation');
        if (entries && entries.length) nav = entries[0];
      }

      if (nav && typeof nav.responseStart === 'number' && typeof nav.requestStart === 'number') {
        _perf.ttfb = nav.responseStart - nav.requestStart;
        return;
      }

      if (global.performance && global.performance.timing) {
        var t = global.performance.timing;
        if (t.responseStart && t.requestStart) {
          _perf.ttfb = t.responseStart - t.requestStart;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function _sendPerformanceMetrics() {
    if (!_enabled) return;
    if (_perf.sent) return;

    try {
      _measureTTFB();

      var base = _baseContext();
      var env = _getEnv();

      var metrics = {
        metricType: 'web_vitals_aggregate',
        url: (global.location && global.location.href) ? global.location.href : '',
        connectionType: env.connectionType,
        lcp: _perf.lcp,
        fid: _perf.fid,
        cls: _perf.cls,
        ttfb: _perf.ttfb,
      };

      for (var k in base) metrics[k] = base[k];

      _queuePerformance(metrics);
      _perf.sent = true;
    } catch (e) {
      _log('SuperInsights performance send failed', e);
    }
  }

  function _onVisibilityChange() {
    try {
      if (!global.document) return;
      if (global.document.visibilityState === 'hidden') {
        _sendPerformanceMetrics();
        _flushAllQueues(true);
      }
    } catch (e) {
      // ignore
    }
  }

  function _attachListeners() {
    try {
      global.addEventListener('error', function (evt) {
        try {
          if (!evt) return;
          _onWindowError(evt.message, evt.filename, evt.lineno, evt.colno, evt.error);
        } catch (e) {
          // ignore
        }
      });

      global.addEventListener('unhandledrejection', function (evt) {
        _onUnhandledRejection(evt);
      });

      if (global.document && typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('visibilitychange', _onVisibilityChange);
      }

      global.addEventListener('beforeunload', function () {
        try {
          _sendPerformanceMetrics();
          _flushAllQueues(true);
        } catch (e) {
          // ignore
        }
      });

      var activityHandler = function () {
        _refreshSession();
      };

      global.addEventListener('click', activityHandler, { passive: true });
      global.addEventListener('keydown', activityHandler, { passive: true });
      global.addEventListener('scroll', activityHandler, { passive: true });
    } catch (e) {
      // ignore
    }
  }

  function init(apiKey, config) {
    try {
      if (_initialized) return;

      _apiKey = apiKey;
      if (config) {
        for (var k in config) {
          if (config.hasOwnProperty(k)) {
            _config[k] = config[k];
          }
        }
      }

      _validateConfig();

      _initialized = true;
      _enabled = true;

      _getEnv();
      _getUTMParams();

      _patchHistoryAPI();
      _attachListeners();
      _startFlushTimer();

      _observeLCP();
      _observeFID();
      _observeCLS();
      _measureTTFB();

      _trackPageView();

      _log('SuperInsights initialized');
    } catch (e) {
      _log('SuperInsights init failed', e);
    }
  }

  function trackEvent(eventName, properties) {
    if (!_enabled) return;
    if (!_initialized) return;

    if (!eventName || typeof eventName !== 'string') return;

    try {
      var base = _baseContext();

      var data = {
        eventName: eventName,
        properties: properties && typeof properties === 'object' ? properties : {},
      };

      for (var k in base) data[k] = base[k];

      if (_user && _user.userId) {
        data.userId = _user.userId;
      }

      _queueEvent(data);
      _refreshSession();
    } catch (e) {
      _log('SuperInsights trackEvent failed', e);
    }
  }

  function setUser(userId, traits) {
    if (!_initialized) return;

    if (!userId || typeof userId !== 'string') return;

    _user.userId = userId;
    _user.traits = (traits && typeof traits === 'object') ? traits : null;
  }

  function flush() {
    if (!_initialized) return;
    _sendPerformanceMetrics();
    _flushAllQueues(false);
  }

  function disable() {
    _enabled = false;
    _stopFlushTimer();
  }

  function enable() {
    if (!_initialized) return;
    if (_enabled) return;
    _enabled = true;
    _startFlushTimer();
  }

  SuperInsights.init = init;
  SuperInsights.trackEvent = trackEvent;
  SuperInsights.setUser = setUser;
  SuperInsights.flush = flush;
  SuperInsights.disable = disable;
  SuperInsights.enable = enable;

  global.SuperInsights = SuperInsights;
})(window);
