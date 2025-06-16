# Logging System

This project uses [Consola](https://github.com/unjs/consola) for structured logging across both frontend and backend.

## Log Levels

- **0: Silent** - No logs
- **1: Error** - Only errors
- **2: Warn** - Errors and warnings
- **3: Info** - Errors, warnings, and info
- **4: Debug** - All above + debug logs
- **5: Trace** - All logs including trace

## Default Behavior

### Frontend (Browser)
- **Development**: Info level (3) - shows errors, warnings, and info
- **Production**: Error level (1) - shows only errors
- **Debug Mode**: Debug level (4) - shows all logs including debug

### Backend (Server)
- **Development**: Info level (3)
- **Production**: Warn level (2)
- **Debug Mode**: Debug level (4)

## Controlling Log Levels

### Frontend (Browser)
1. **Debug Controls UI**: A debug panel appears in development mode (bottom-right corner)
2. **Browser Console**: 
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
3. **localStorage**: The setting persists in `localStorage` as `debug-logs`

### Backend (Server)
Set environment variables:
```bash
# Set specific log level (0-5)
LOG_LEVEL=4

# Enable debug logs in production (not recommended)
ENABLE_DEBUG_LOGS=1
```

## Usage in Code

```typescript
import { log } from '$lib/logger';

// Basic logging
log.error('Something went wrong');
log.warn('This is a warning');
log.info('General information');
log.debug('Debug information');
log.trace('Detailed trace');

// Tagged logging for specific modules
log.routes.debug('Route processing started');
log.map.info('Map initialized');
log.api.error('API call failed');
log.db.warn('Database connection slow');
log.auth.info('User authenticated');
log.game.debug('Game state updated');
```

## Migration from console.log

The debug logs that were previously flooding the console are now at debug level (4). 

- **In development**: You'll see them by default
- **In production**: They're hidden by default
- **To see them**: Use the debug controls UI or enable debug mode

## Benefits

1. **Performance**: Debug logs are completely disabled in production
2. **Control**: Easy to toggle log levels without code changes
3. **Structure**: Consistent formatting and tagging
4. **Universal**: Same API works in browser and Node.js
5. **Persistence**: Browser settings persist across sessions

## Examples

```typescript
// Old way (always logs)
console.log('[ROUTES DEBUG] Processing employee:', employee.id);

// New way (respects log level)
log.debug('[ROUTES DEBUG] Processing employee:', employee.id);

// Even better with tags
log.routes.debug('Processing employee:', employee.id);
``` 