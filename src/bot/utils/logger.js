import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'verbose.log');

// Rotate when verbose.log exceeds ~10 MB: keep one .old generation.
// (The old file was 33 MB of mostly lag-monitor spam before throttling was added.)
const MAX_LOG_BYTES = 10 * 1024 * 1024;

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(logFile) || fs.statSync(logFile).size < MAX_LOG_BYTES) return;
    const older = logFile + '.older';
    if (fs.existsSync(older)) fs.rmSync(older, { force: true });
    if (fs.existsSync(logFile + '.old')) fs.renameSync(logFile + '.old', older);
    fs.renameSync(logFile, logFile + '.old');
  } catch { /* rotation is best-effort */ }
}

/**
 * Appends a log message to the verbose.log file.
 * Automatically adds a timestamp.
 * @param {string} category
 * @param {string} message
 */
export function writeVerboseLog(category, message) {
  // discord-player's debug channel fires a Lag Monitor heartbeat twice a minute;
  // it drowned the logs (~99% of 33 MB). Only log it when latency is actually high.
  if (category === 'Player:Debug' && message.includes('[Lag Monitor]')) {
    const latency = parseFloat(message.replace(/^[^0-9]*/, ''));
    if (!Number.isFinite(latency) || latency < 100) return;
  }

  rotateIfNeeded();

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${category}] ${message}\n`;

  // Append asynchronously to prevent blocking the event loop
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) console.error('[Logger] Failed to write to log file:', err);
  });
}
