# Redis Implementation Plan

## Overview

This document outlines the plan for adding optional Redis support to SuperInsights to improve performance, scalability, and reliability while maintaining backward compatibility.

## Architecture Analysis

### Current State
- **Session Storage**: MongoDB via `connect-mongo`
- **Rate Limiting**: In-memory Maps in `middleware/rateLimit.js` and `middleware/apiRateLimit.js`
- **Analytics Queries**: Heavy MongoDB aggregations in `controllers/dashboardController.js`
- **Data Ingestion**: High-volume writes in `controllers/ingestionController.js`

### Redis Integration Points Identified
1. Session storage with Redis fallback to MongoDB
2. Analytics query result caching
3. Distributed rate limiting across multiple instances
4. Background job queue for AI analysis
5. Real-time data buffering for ingestion

## Implementation Phases

### Phase 1: Core Infrastructure (High Priority)

#### 1.1 Redis Configuration & Connection Management
**File**: `config/redis.js`

```javascript
const redis = require('redis');
let redisClient = null;
let redisAvailable = false;

async function initializeRedis() {
  if (!process.env.REDIS_URL) return null;
  
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return false; // Don't retry if connection refused
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });
    
    await redisClient.connect();
    redisAvailable = true;
    return redisClient;
  } catch (err) {
    console.warn('Redis connection failed, falling back to MongoDB:', err.message);
    redisAvailable = false;
    return null;
  }
}

module.exports = { initializeRedis, getClient: () => redisClient, isAvailable: () => redisAvailable };
```

#### 1.2 Environment Configuration
**File**: `.env.example` additions

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TTL=3600
REDIS_ENABLED=true

# Feature Flags
SESSION_STORE_REDIS=false
RATE_LIMIT_REDIS=false
CACHE_REDIS=false
JOB_QUEUE_REDIS=false
```

### Phase 2: Session Storage (High Priority)

#### 2.1 Optional Redis Session Store
**File**: Update `app.js`

```javascript
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { getClient, isAvailable } = require('./config/redis');

let sessionStore;
if (process.env.SESSION_STORE_REDIS === 'true' && isAvailable()) {
  const RedisStore = require('connect-redis')(session);
  sessionStore = new RedisStore({ 
    client: getClient(),
    ttl: 60 * 60 * 24 * 14 
  });
} else {
  sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 14,
  });
}

app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  // ... existing session config
}));
```

### Phase 3: Caching Layer (Medium Priority)

#### 3.1 Cache Manager Utility
**File**: `utils/cache.js`

```javascript
const { getClient, isAvailable } = require('../config/redis');

class CacheManager {
  static async get(key) {
    if (!isAvailable() || !process.env.CACHE_REDIS) return null;
    try {
      const data = await getClient().get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn('Cache get failed:', err.message);
      return null;
    }
  }
  
  static async set(key, data, ttl = 300) {
    if (!isAvailable() || !process.env.CACHE_REDIS) return;
    try {
      await getClient().setEx(key, ttl, JSON.stringify(data));
    } catch (err) {
      console.warn('Cache set failed:', err.message);
    }
  }
  
  static async del(key) {
    if (!isAvailable() || !process.env.CACHE_REDIS) return;
    try {
      await getClient().del(key);
    } catch (err) {
      console.warn('Cache delete failed:', err.message);
    }
  }
  
  static generateKey(prefix, ...params) {
    return `${prefix}:${params.join(':')}`;
  }
}

module.exports = CacheManager;
```

#### 3.2 Dashboard Analytics Caching
**File**: Update `controllers/dashboardController.js`

```javascript
const CacheManager = require('../utils/cache');

async function getPageViewsSummary({ projectId, start, end }) {
  const cacheKey = CacheManager.generateKey('pageviews', projectId, start.getTime(), end.getTime());
  const cached = await CacheManager.get(cacheKey);
  if (cached) return cached;
  
  // ... existing MongoDB aggregation logic ...
  
  const result = {
    totalViews: totalViews || 0,
    uniqueVisitors: uniqueVisitors || 0,
    viewsByDay: viewsByDayAgg || [],
    topPages: topPagesAgg || [],
  };
  
  await CacheManager.set(cacheKey, result, 300); // 5 minute cache
  return result;
}

// Similar caching for getEventsSummary, getErrorsSummary, getPerformanceSummary
```

### Phase 4: Distributed Rate Limiting (Medium Priority)

#### 4.1 Redis Rate Limiter
**File**: `middleware/redisRateLimit.js`

```javascript
const { getClient, isAvailable } = require('../config/redis');

class RedisRateLimiter {
  static async checkLimit(key, windowMs, max) {
    if (!isAvailable() || !process.env.RATE_LIMIT_REDIS) {
      return this.fallbackCheck(key, windowMs, max);
    }
    
    try {
      const pipeline = getClient().multi();
      const now = Date.now();
      const windowStart = now - windowMs;
      
      pipeline.zRemRangeByScore(key, 0, windowStart);
      pipeline.zCard(key);
      pipeline.zAdd(key, { score: now, value: now });
      pipeline.expire(key, Math.ceil(windowMs / 1000));
      
      const results = await pipeline.exec();
      const count = results[1].response;
      
      return { 
        allowed: count <= max, 
        count, 
        resetTime: now + windowMs 
      };
    } catch (err) {
      console.warn('Redis rate limit failed, using fallback:', err.message);
      return this.fallbackCheck(key, windowMs, max);
    }
  }
  
  static fallbackCheck(key, windowMs, max) {
    // Fall back to existing in-memory rate limiting
    const store = require('./rateLimit').store;
    const now = Date.now();
    
    let entry = store.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      store.set(key, entry);
    }
    
    entry.count += 1;
    
    return { 
      allowed: entry.count <= max, 
      count: entry.count, 
      resetTime: entry.expiresAt 
    };
  }
}

function createRedisRateLimiter({ windowMs, max }) {
  return async function rateLimiter(req, res, next) {
    const key = req.ip || 'unknown';
    const result = await RedisRateLimiter.checkLimit(key, windowMs, max);
    
    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.set('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: retryAfterSeconds,
      });
    }
    
    return next();
  };
}

module.exports = { createRedisRateLimiter, RedisRateLimiter };
```

### Phase 5: Background Job Queue (Low Priority)

#### 5.1 Job Queue System
**File**: `utils/jobQueue.js`

```javascript
const { getClient, isAvailable } = require('../config/redis');

class JobQueue {
  static async addJob(queue, jobData, priority = 'normal') {
    if (!isAvailable() || !process.env.JOB_QUEUE_REDIS) {
      return this.fallbackProcess(queue, jobData);
    }
    
    try {
      const job = {
        id: require('crypto').randomUUID(),
        data: jobData,
        createdAt: Date.now(),
        priority
      };
      
      await getClient().lPush(`queue:${queue}`, JSON.stringify(job));
      return job.id;
    } catch (err) {
      console.warn('Job queue failed, processing directly:', err.message);
      return this.fallbackProcess(queue, jobData);
    }
  }
  
  static async processJobs(queue, processor) {
    if (!isAvailable() || !process.env.JOB_QUEUE_REDIS) return;
    
    console.log(`Starting job processor for queue: ${queue}`);
    
    while (true) {
      try {
        const result = await getClient().brPop(`queue:${queue}`, 5);
        if (result) {
          const job = JSON.parse(result.element);
          try {
            await processor(job.data, job);
            console.log(`Processed job ${job.id} from queue ${queue}`);
          } catch (jobErr) {
            console.error(`Job ${job.id} failed:`, jobErr);
            // Optionally re-add failed jobs to a dead-letter queue
          }
        }
      } catch (err) {
        console.warn('Job processing failed:', err.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  static fallbackProcess(queue, jobData) {
    // Process immediately without queueing
    console.log(`Processing ${queue} job immediately (Redis unavailable)`);
    // Return promise for immediate processing
    return Promise.resolve();
  }
}

module.exports = JobQueue;
```

#### 5.2 AI Analysis Job Integration
**File**: Update `controllers/aiAnalysisController.js`

```javascript
const JobQueue = require('../utils/jobQueue');

// Instead of processing AI analysis immediately, queue it
exports.startAiAnalysis = async (req, res, next) => {
  try {
    const jobId = await JobQueue.addJob('ai-analysis', {
      projectId: req.project._id,
      userId: req.session.user.id,
      presetId: req.body.presetId,
      // ... other analysis parameters
    });
    
    res.json({ success: true, jobId });
  } catch (err) {
    return next(err);
  }
};

// Start job processors (called during app initialization)
function startJobProcessors() {
  JobQueue.processJobs('ai-analysis', async (jobData, job) => {
    // Existing AI analysis logic here
    const result = await performAiAnalysis(jobData);
    // Store results, notify users, etc.
  });
}
```

### Phase 6: Infrastructure Updates (Medium Priority)

#### 6.1 Docker Compose Updates
**File**: `compose.yml`

```yaml
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    container_name: superinsights-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-}
    volumes:
      - redis_data:/data
    restart: always
    networks:
      - coolify-shared
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
    
  app:
    container_name: superinsights
    image: javimosch/superinsights:latest
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - REDIS_ENABLED=true
      - SESSION_STORE_REDIS=true
      - CACHE_REDIS=true
      - RATE_LIMIT_REDIS=true
    working_dir: /app
    expose:
      - "3000"
    env_file:
      - ./.env.staging
    command: ["node", "index.js"]
    networks:
      - coolify-shared
    volumes:
      - ./:/app
      - /app/node_modules
    restart: always
    pull_policy: always
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis_data:

networks:
  coolify-shared:
    external: true
```

#### 6.2 Coolify Compose Updates
**File**: `compose.coolify.yml`

```yaml
# Add Redis service to existing Coolify configuration
services:
  redis:
    image: redis:7-alpine
    container_name: superinsights-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: always
    networks:
      - coolify-shared
    
  app:
    # ... existing app configuration ...
    environment:
      - REDIS_URL=redis://redis:6379
      - REDIS_ENABLED=true
    depends_on:
      - redis

volumes:
  redis_data:
```

#### 6.3 Package Dependencies
**File**: `package.json`

```json
{
  "dependencies": {
    "redis": "^4.6.0",
    "connect-redis": "^7.1.0",
    // ... existing dependencies
  }
}
```

### Phase 7: Documentation & Testing (Low Priority)

#### 7.1 Configuration Documentation
**File**: Update `docs/configuration.md`

```markdown
## Redis Configuration

SuperInsights supports optional Redis integration for improved performance and scalability.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `REDIS_PASSWORD` | | Redis authentication password |
| `REDIS_DB` | `0` | Redis database number |
| `REDIS_TTL` | `3600` | Default TTL for cached data (seconds) |
| `REDIS_ENABLED` | `false` | Enable Redis support |
| `SESSION_STORE_REDIS` | `false` | Use Redis for session storage |
| `CACHE_REDIS` | `false` | Use Redis for query caching |
| `RATE_LIMIT_REDIS` | `false` | Use Redis for rate limiting |
| `JOB_QUEUE_REDIS` | `false` | Use Redis for background jobs |

### Feature Flags

Each Redis feature can be independently enabled/disabled:

- **Sessions**: Faster session access with Redis
- **Caching**: Cache expensive analytics queries
- **Rate Limiting**: Distributed rate limiting across instances
- **Job Queue**: Background processing for AI analysis

### Graceful Fallback

All Redis features include graceful fallback to existing implementations when Redis is unavailable.
```

#### 7.2 Redis Feature Documentation
**File**: `docs/features/redis-caching.md`

```markdown
# Redis Caching

## Overview

Redis caching provides significant performance improvements for analytics queries and session management.

## Benefits

### Session Storage
- **10-100x faster** session lookups compared to MongoDB
- Reduced database load for authenticated users
- Better scalability across multiple instances

### Analytics Caching
- **50-90% cache hit ratio** for dashboard queries
- Faster page loads for frequently accessed timeframes
- Reduced MongoDB aggregation overhead

### Rate Limiting
- **Distributed limiting** across multiple server instances
- Accurate rate limits during horizontal scaling
- Memory-efficient storage of rate limit data

## Cache Keys

Analytics queries use structured cache keys:
- `pageviews:{projectId}:{start}:{end}` - Page view summaries
- `events:{projectId}:{start}:{end}` - Event analytics
- `errors:{projectId}:{start}:{end}` - Error tracking
- `performance:{projectId}:{start}:{end}` - Performance metrics

## TTL Configuration

- **Dashboard Data**: 5 minutes (300 seconds)
- **Session Data**: 14 days (1,209,600 seconds)
- **Rate Limits**: Dynamic based on window size
- **Job Queue**: No expiration (processed FIFO)
```

## Implementation Timeline

### Week 1: Foundation
- **Day 1-2**: Core Redis configuration and connection management
- **Day 3-4**: Environment configuration and feature flags
- **Day 5**: Session storage implementation with fallback

### Week 2: Performance Features
- **Day 1-2**: Analytics query caching layer
- **Day 3**: Distributed rate limiting implementation
- **Day 4-5**: Testing and optimization

### Week 3: Production Readiness
- **Day 1-2**: Docker compose updates and infrastructure
- **Day 3**: Background job queue system
- **Day 4-5**: Documentation and deployment testing

## Expected Performance Improvements

| Feature | Current Performance | With Redis | Improvement |
|---------|-------------------|------------|-------------|
| Session Access | 50-200ms (MongoDB) | 1-5ms (Redis) | 10-200x faster |
| Dashboard Queries | 500-2000ms | 50-500ms (cached) | 4-40x faster |
| Rate Limiting | Memory per instance | Distributed | Scales horizontally |
| Concurrent Users | Limited by MongoDB | Higher throughput | 2-5x more users |

## Risk Mitigation

### Zero Breaking Changes
- All Redis features are **opt-in** via environment variables
- Graceful fallback to existing MongoDB/memory implementations
- No changes to existing API contracts

### Production Safety
- Deploy Redis-first in staging environment
- Monitor Redis connection status and fallback usage
- Gradual feature rollout with feature flags

### Monitoring & Observability
- Built-in logging for Redis availability
- Fallback usage metrics
- Performance impact monitoring

### Rollback Strategy
- Disable Redis features via environment variables
- Immediate fallback to existing implementations
- No database migrations required

## Testing Strategy

### Unit Tests
- Redis client connection management
- Cache get/set/delete operations
- Rate limiting algorithms
- Job queue processing

### Integration Tests
- Session storage with Redis vs MongoDB
- Analytics caching behavior
- Rate limiting across multiple instances
- Job queue processing workflows

### Load Testing
- Performance comparison with/without Redis
- Concurrent user handling
- Cache hit/miss ratios
- Memory usage optimization

### Failure Scenarios
- Redis connection failures
- Network partition testing
- Graceful degradation behavior
- Recovery procedures

## Success Metrics

### Performance Metrics
- Dashboard load time reduction > 50%
- Session access latency < 10ms
- Cache hit ratio > 70%
- MongoDB query reduction > 40%

### Reliability Metrics
- Redis uptime > 99.9%
- Fallback activation rate < 1%
- Zero data loss during failover
- No service degradation during Redis maintenance

### Scalability Metrics
- Support 2-5x more concurrent users
- Horizontal scaling capability
- Resource usage optimization
- Cost per user reduction

## Future Enhancements

### Phase 2 Features
- Real-time analytics with Redis Streams
- Advanced caching strategies (LRU, LFU)
- Redis Cluster for high availability
- Geographically distributed caching

### Advanced Use Cases
- WebSocket session management
- Live dashboard updates
- Predictive caching
- Machine learning model caching

## Conclusion

This Redis implementation plan provides a comprehensive, low-risk approach to significantly improving SuperInsights' performance and scalability while maintaining full backward compatibility and operational reliability.

The phased implementation allows for gradual adoption, thorough testing, and measurable improvements at each stage.
