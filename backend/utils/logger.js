/**
 * Simple logger utility
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, message, color) {
  return `${color}[${timestamp()}] [${level}]${colors.reset} ${message}`;
}

const logger = {
  info: (message) => {
    console.log(formatMessage('INFO', message, colors.blue));
  },

  success: (message) => {
    console.log(formatMessage('SUCCESS', message, colors.green));
  },

  warn: (message) => {
    console.warn(formatMessage('WARN', message, colors.yellow));
  },

  error: (message, error = null) => {
    console.error(formatMessage('ERROR', message, colors.red));
    if (error) {
      console.error(colors.dim + error.stack + colors.reset);
    }
  },

  debug: (message) => {
    if (process.env.DEBUG === 'true') {
      console.log(formatMessage('DEBUG', message, colors.magenta));
    }
  }
};

module.exports = logger;
