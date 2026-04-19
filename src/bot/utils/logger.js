import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'verbose.log');

/**
 * Appends a log message to the verbose.log file.
 * Automatically adds a timestamp.
 * @param {string} category 
 * @param {string} message 
 */
export function writeVerboseLog(category, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${category}] ${message}\n`;
  
  // Append asynchronously to prevent blocking the event loop
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) console.error('[Logger] Failed to write to log file:', err);
  });
}
