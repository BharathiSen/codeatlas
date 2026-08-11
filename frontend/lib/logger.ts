import chalk from 'chalk';
import { currentRequestId } from './request-context';

type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug' | 'warn';

interface LogOptions {
  timestamp?: boolean;
  prefix?: string;
  level?: LogLevel;
}

class Logger {
  private static instance: Logger;
  private debugMode: boolean = process.env.NODE_ENV === 'development';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(message: string, options: LogOptions = {}): string {
    const parts: string[] = [];
    
    if (options.timestamp !== false) {
      parts.push(chalk.gray(`[${this.getTimestamp()}]`));
    }

    if (options.prefix) {
      parts.push(chalk.cyan(`[${options.prefix}]`));
    }

    /*
     * The id that the caller was also handed in the response body, so a report
     * of "request abc123 failed" can be grepped straight to the lines that
     * produced it. Absent outside a request (scripts, module init), and short
     * enough to stay readable at the head of every line.
     */
    const requestId = currentRequestId();
    if (requestId) {
      parts.push(chalk.gray(`[${requestId.slice(0, 8)}]`));
    }

    switch (options.level) {
      case 'success':
        parts.push(chalk.green(message));
        break;
      case 'warning':
        parts.push(chalk.yellow(message));
        break;
      case 'error':
        parts.push(chalk.red(message));
        break;
      case 'debug':
        parts.push(chalk.magenta(message));
        break;
      default:
        parts.push(message);
    }

    return parts.join(' ');
  }

  info(message: string, options: LogOptions = {}) {
    console.log(this.formatMessage(message, { ...options, level: 'info' }));
  }

  success(message: string, options: LogOptions = {}) {
    console.log(this.formatMessage(message, { ...options, level: 'success' }));
  }

  warning(message: string, options: LogOptions = {}) {
    console.warn(this.formatMessage(message, { ...options, level: 'warning' }));
  }

  warn(message: string, options: LogOptions = {}) {
    this.warning(message, options);
  }

  error(message: string, options: LogOptions = {}) {
    console.error(this.formatMessage(message, { ...options, level: 'error' }));
  }

  debug(message: string, options: LogOptions = {}) {
    if (this.debugMode) {
      console.debug(this.formatMessage(message, { ...options, level: 'debug' }));
    }
  }

  // Context preparation logging methods
  context = {
    start: () => {
      this.info('Preparing context for Gemini...', { prefix: 'Context' });
    },
    stats: (stats: { files: number; totalChars: number }) => {
      this.info(`Context prepared with ${stats.files} files (${stats.totalChars} characters)`, { prefix: 'Context' });
    },
    error: (error: string) => {
      this.error(`Context preparation error: ${error}`, { prefix: 'Context' });
    }
  };
}

export const logger = Logger.getInstance();