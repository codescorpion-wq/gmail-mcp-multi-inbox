// Loads .env from the project root, whatever directory the process was started from
// (Claude Desktop launches local servers from an unpredictable working directory).
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
