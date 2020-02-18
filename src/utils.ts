import * as log4js from 'log4js';


// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Utils {
    log4js.configure(
        {
            appenders: {
                out: {
                    type: 'stdout',
                    layout: {
                        type: 'pattern', pattern: '%[[%d] [%p] %f{1}:%l -%] %m',
                    },
                },
                file: {
                    type: 'file',
                    filename: 'debug.log',
                    maxLogSize: 10485760,
                    backups: 3,
                    compress: true,
                    layout: {
                        type: 'pattern', pattern: '[%d] [%p] %f{1}:%l - %m',
                    },
                },
            },
            categories: {
                default: {
                    appenders: [
                        'file',
                        'out',
                    ],
                    level: 'debug',
                    enableCallStack: true,
                },
            },
        },
    );

    /**
     * Global instance of log4js logger configured to log to disk and console
     * @category Log
     */
    export const logger = log4js.getLogger();
}
