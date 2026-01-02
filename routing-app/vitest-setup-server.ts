// Load environment variables for server-side tests
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from routing-app root
const envPath = resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

