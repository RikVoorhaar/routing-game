import type { Logger } from 'drizzle-orm';
import { getServerLogger } from './pinoLogger';

/**
 * Drizzle logger that logs queries to Pino
 * Logs query text and parameter count (not values) for security
 */
export class PinoDrizzleLogger implements Logger {
	private logger = getServerLogger();

	logQuery(query: string, params: unknown[]): void {
		// Extract table name from query if possible (heuristic)
		const tableMatch =
			query.match(/\bFROM\s+["`]?(\w+)["`]?/i) ||
			query.match(/\bINTO\s+["`]?(\w+)["`]?/i) ||
			query.match(/\bUPDATE\s+["`]?(\w+)["`]?/i) ||
			query.match(/\bDELETE\s+FROM\s+["`]?(\w+)["`]?/i);
		const table = tableMatch ? tableMatch[1] : undefined;

		// Determine operation type
		let operation: string;
		if (query.trim().toUpperCase().startsWith('SELECT')) {
			operation = 'select';
		} else if (query.trim().toUpperCase().startsWith('INSERT')) {
			operation = 'insert';
		} else if (query.trim().toUpperCase().startsWith('UPDATE')) {
			operation = 'update';
		} else if (query.trim().toUpperCase().startsWith('DELETE')) {
			operation = 'delete';
		} else {
			operation = 'other';
		}

		this.logger.debug(
			{
				event: 'db.query',
				db: {
					system: 'postgres',
					operation,
					statement: query,
					params_count: params.length,
					table
				}
			},
			`DB ${operation}${table ? ` on ${table}` : ''} (${params.length} params)`
		);
	}
}
