import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat()
  ),
  defaultMeta: { service: 'worker' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let metaStr = '';
          if (Object.keys(meta).length) {
            try {
              metaStr = ` ${JSON.stringify(meta, null, 0)}`;
            } catch (err) {
              // Handle circular structures by using a replacer function
              metaStr = ` ${JSON.stringify(meta, (_, value) => {
                if (typeof value === 'object' && value !== null) {
                  if (value instanceof Error) {
                    return {
                      name: value.name,
                      message: value.message,
                      stack: value.stack?.split('\n')[0] // Only first line of stack
                    };
                  }
                }
                return value;
              })}`;
            }
          }
          return `[${timestamp}] [${level}] ${message}${metaStr}`;
        })
      )
    })
  ]
});

export default logger;