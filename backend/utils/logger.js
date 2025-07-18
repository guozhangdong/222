const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// 日志级别
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// 日志颜色
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// 日志格式
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// 文件日志格式
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建日志目录
const logDir = process.env.LOG_PATH || path.join(__dirname, '../logs');

// 创建日志传输器
const transports = [
  // 控制台输出
  new winston.transports.Console({
    format,
    level: process.env.LOG_LEVEL || 'info'
  }),

  // 错误日志文件
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),

  // 所有日志文件
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),

  // HTTP请求日志
  new DailyRotateFile({
    filename: path.join(logDir, 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true
  })
];

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: fileFormat,
  transports,
  exitOnError: false
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 创建HTTP日志记录器
const httpLogger = winston.createLogger({
  level: 'http',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true
    })
  ]
});

// 日志工具函数
const logUtils = {
  // 记录HTTP请求
  logHttpRequest(method, url, statusCode, responseTime, ip, userAgent) {
    httpLogger.http('HTTP Request', {
      method,
      url,
      statusCode,
      responseTime: `${responseTime}ms`,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });
  },

  // 记录API调用
  logApiCall(api, params, result, duration) {
    logger.info('API Call', {
      api,
      params,
      result: typeof result === 'object' ? JSON.stringify(result) : result,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  },

  // 记录数据库操作
  logDbOperation(operation, table, query, duration) {
    logger.debug('Database Operation', {
      operation,
      table,
      query,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  },

  // 记录支付操作
  logPayment(operation, orderId, amount, status, details) {
    logger.info('Payment Operation', {
      operation,
      orderId,
      amount,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  },

  // 记录用户操作
  logUserAction(userId, action, details) {
    logger.info('User Action', {
      userId,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  },

  // 记录错误
  logError(error, context = {}) {
    logger.error('Application Error', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  },

  // 记录性能指标
  logPerformance(operation, duration, metadata = {}) {
    logger.info('Performance', {
      operation,
      duration: `${duration}ms`,
      metadata,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  logger,
  httpLogger,
  logUtils
};