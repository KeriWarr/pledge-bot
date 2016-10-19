import winston from 'winston';


const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      level: 'info',
      timestamp: true,
      colorize: true,
    }),
    new (winston.transports.File)({
      level: 'debug',
      filename: 'server.log',
      json: false,
    }),
  ],
});

export default logger;
