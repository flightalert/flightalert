

// Use a string union type for log levels for type-safety and flexibility.
type LogLevelName = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
    levels = {
        TRACE: 0,
        DEBUG: 1,
        INFO: 2,
        WARN: 3,
        ERROR: 4,
        SILENT: 5,
    };
    minLevel: number;

    constructor(minLevel: LogLevelName = 'INFO') {
        this.minLevel = this.levels[minLevel.toUpperCase() as LogLevelName] || this.levels.INFO;
    }

    // A method to handle the actual logging.
    _log(level: LogLevelName, ...messages: any[]): void {
        if (this.levels[level] >= this.minLevel) {
            const logMethod: (...args: any[]) => void = ({
                TRACE: console.trace,
                DEBUG: console.debug,
                INFO: console.info,
                WARN: console.warn,
                ERROR: console.error,
            })[level] || console.log;

            logMethod(`[${level}]`, ...messages);
        }
    }

    // Public methods for each log level.
    trace(...messages: any[]): void {
        this._log('TRACE', ...messages);
    }

    debug(...messages: any[]): void {
        this._log('DEBUG', ...messages);
    }

    info(...messages: any[]): void {
        this._log('INFO', ...messages);
    }

    warn(...messages: any[]): void {
        this._log('WARN', ...messages);
    }

    error(...messages: any[]): void {
        this._log('ERROR', ...messages);
    }

    // Method to change the minimum log level.
    setLevel(newLevel: LogLevelName): void {
        const levelValue = this.levels[newLevel.toUpperCase() as LogLevelName];
        if (levelValue !== undefined) {
            this.minLevel = levelValue;
            console.log(`Log level set to: ${newLevel.toUpperCase()}`);
        }
    }
}

export default new Logger();
