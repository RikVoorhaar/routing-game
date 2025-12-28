# Logging System

This project uses [Pino](https://getpino.io/) for structured JSON logging on the server-side, designed for ingestion into Loki/Grafana via Alloy. The logging system provides structured, queryable logs with automatic context injection.

## Architecture

### Server-Side (Node.js)
- **Pino** logger with structured JSON output
- **Request-scoped context** via AsyncLocalStorage (automatically injects `request_id`, `user_id`, `game_state_id`, etc.)
- **Development**: Pretty logs to stdout + JSON logs to rotating file (`routing-app/.logs/server.log`)
- **Production**: JSON logs to stdout (for Docker/Alloy ingestion)

### Client-Side (Browser)
- Simple console wrapper with log level control
- Respects localStorage debug settings

## Log Levels

- **0: Silent** - No logs
- **1: Error** - Only errors
- **2: Warn** - Errors and warnings
- **3: Info** - Errors, warnings, and info
- **4: Debug** - All above + debug logs (includes DB queries)
- **5: Trace** - All logs including trace

## Default Behavior

### Frontend (Browser)
- **Development**: Info level (3) - shows errors, warnings, and info
- **Production**: Error level (1) - shows only errors
- **Debug Mode**: Debug level (4) - shows all logs including debug

### Backend (Server)
- **Development**: Info level (3) with pretty stdout + file logging
- **Production**: Warn level (2) with JSON stdout only
- **Debug Mode**: Debug level (4) - shows all logs including DB queries

## Controlling Log Levels

### Frontend (Browser)

1. **Browser Console**:
   ```javascript
   // Enable debug logs
   log.enableDebug();

   // Disable debug logs
   log.disableDebug();

   // Set specific level
   log.setLevel(4);

   // Check current level
   log.getLevel();
   ```

2. **localStorage**: The setting persists in `localStorage` as `debug-logs`

### Backend (Server)

Set environment variables:

```bash
# Set specific log level (0-5)
LOG_LEVEL=4

# Enable debug logs in production (not recommended)
ENABLE_DEBUG_LOGS=1
```

## Development File Logging

In development mode, logs are written to both:
- **stdout**: Pretty-formatted, human-readable logs
- **File**: JSON logs in `routing-app/.logs/server.log` with automatic rotation
  - Max file size: 10MB
  - Keeps 5 rotated files
  - Old files are compressed with gzip

The `.logs/` directory is gitignored and created automatically.

## Structured Logging Patterns

### Basic Usage

```typescript
import { log } from '$lib/logger';

// Simple message
log.info('User logged in');

// Structured logging (recommended)
log.info({
  event: 'user.login',
  user_id: userId,
  duration_ms: 150
}, 'User logged in successfully');
```

### Tagged Loggers

Use tagged loggers for module-specific logging:

```typescript
log.routes.debug('Route processing started');
log.map.info('Map initialized');
log.api.error('API call failed');
log.db.warn('Database connection slow');
log.auth.info('User authenticated');
log.game.debug('Game state updated');
```

### Request Context

Request context is automatically injected into all server-side logs:

```typescript
// In hooks.server.ts, context is set automatically:
// - request_id (auto-generated)
// - user_id (from session)
// - game_state_id (from URL params)
// - employee_id (from URL params)
// - job_id (from URL params)

// All logs automatically include these fields:
log.info({ event: 'job.complete' }, 'Job completed');
// Logs: { event: 'job.complete', request_id: '...', user_id: '...', ... }
```

### Database Query Logging

All Drizzle ORM queries are automatically logged at debug level:

```typescript
// Automatically logged:
// {
//   event: 'db.query',
//   db: {
//     system: 'postgres',
//     operation: 'select',
//     statement: 'SELECT ...',
//     params_count: 2,
//     table: 'users'
//   },
//   request_id: '...',
//   ...
// }
```

**Note**: Query parameter values are NOT logged for security reasons. Only the query text and parameter count are logged.

### Error Logging

Always log errors with structured context:

```typescript
try {
  await someOperation();
} catch (error) {
  log.error({
    event: 'operation.failed',
    operation: 'someOperation',
    err: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error
  }, 'Operation failed');
  throw error;
}
```

## Event Naming Conventions

Use consistent event names for queryability in Loki:

- `request.start` - Request started
- `request.complete` - Request completed
- `request.error` - Request error
- `auth.login.success` - Login successful
- `auth.login.failed` - Login failed
- `auth.user.created` - User created
- `game_state.created` - Game state created
- `game_state.deleted` - Game state deleted
- `employee.hire` - Employee hired
- `employee.update` - Employee updated
- `job.complete` - Job completed
- `db.query` - Database query executed

## Important Events Logged

The following events are automatically logged:

- **All HTTP requests** (start, complete, errors)
- **All database queries** (at debug level)
- **Authentication events** (login, registration)
- **Game state operations** (create, delete)
- **Employee operations** (hire, update)
- **Job operations** (complete, assign)

## Production Deployment

### Docker/Alloy Setup

In production, logs are emitted as JSON to stdout. Configure Alloy to:

1. Tail container logs
2. Parse JSON logs
3. Forward to Loki

Example Alloy config:

```yaml
loki.source.file "routing_app" {
  targets = [
    {
      __path__ = "/var/lib/docker/containers/*/*-json.log",
      job = "routing-app",
    },
  ]
}

loki.process "routing_app" {
  forward_to = [loki.write.loki.endpoint.receiver]
  
  stage.json {
    expressions = {
      level = "level",
      message = "msg",
      timestamp = "time",
      request_id = "request_id",
      user_id = "user_id",
      event = "event",
    }
  }
}
```

### Log Rotation

In production (Docker), rely on Docker's log rotation:
- Configure Docker daemon log rotation
- Or use a log shipper (Alloy, Fluentd, etc.) with rotation

Development file rotation is handled automatically by the Pino logger.

## Migration from Consola

The logging API remains largely compatible:

```typescript
// Old (Consola)
log.info('Message');
log.db.debug('DB query');

// New (Pino) - same API, but structured
log.info({ event: 'something' }, 'Message');
log.db.debug({ event: 'db.query' }, 'DB query');
```

## Benefits

1. **Structured**: All logs are JSON with consistent fields
2. **Queryable**: Easy to query in Loki/Grafana by `event`, `user_id`, `request_id`, etc.
3. **Context-aware**: Request context automatically injected
4. **Performant**: Pino is one of the fastest Node.js loggers
5. **Secure**: Sensitive fields (passwords, tokens) are automatically redacted
6. **Development-friendly**: Pretty logs in dev, JSON in prod

## Examples

### Query logs in Loki

```
# All errors for a specific user
{user_id="abc123"} |= "error"

# All database queries
{event="db.query"}

# All requests for a specific game state
{game_state_id="xyz789"}

# Slow requests (>1s)
{duration_ms>1000}
```

### Log a game event

```typescript
log.game.info({
  event: 'job.complete',
  active_job_id: jobId,
  employee_id: employeeId,
  game_state_id: gameStateId,
  reward: 100,
  duration_ms: 5000
}, 'Job completed successfully');
```
