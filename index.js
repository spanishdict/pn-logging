/*eslint no-process-env:0 no-param-reassign:0*/

'use strict';

var util = require('util');
var winston = require('winston');
var winex = require('./winex');
var raven = require('raven');
var { omit, merge } = require('lodash');

var sysLogLevels;

// Exposes `winston.transports.Loggly`.
require('winston-loggly');

sysLogLevels = {
  levels: {
    emerg: 0,
    alert: 1,
    crit: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
  },
};

/**
 * Create a log object for public consumption.
 *
 * Usage:
 *
 * l = new Log(options);
 * l.info('blah', {});
 * l.error('oops', {}, err);
 * app.use(l.middleware());
 *
 * @param {Object}   options            Options
 * @param {Object[]} options.transports Should look like:
 *                                      [
 *                                        {
 *                                          Console: {
 *                                            level: 'info',
 *                                            json: true,
 *                                            prettyPrint: true
 *                                          }
 *                                        },
 *                                        {
 *                                          ...
 *                                        }
 *                                      ]
 * @param {Object} options.sentry Config passed to sentry raven instance.
 *                                Should look like:
 *                                {
 *                                  // the account token
 *                                  dsn: string;
 *                                  // pass directly to raven constructor
 *                                  // refer to https://goo.gl/9Ud7Mz
 *                                  options: Object;
 *                                }
 *
 * @return {void}
 */
function Log(options) {
  options = options || {}
  options.transports = options.transports || Log.defaultWinstonOpts.transports
  if (Log.defaultWinstonOpts && Log.defaultWinstonOpts.transports)
    delete Log.defaultWinstonOpts.transports;
  if (!options.transports) {
    throw new Error('No transports found');
  }

  const logTransports = options.transports.map(function(t) {
    var cls = Object.keys(t)[0];
    var opts = t[cls];
    var Transport = winston.transports[cls];
    return new Transport(opts);
  });

  const winstonOpts = Object.assign({
    levels: sysLogLevels.levels,
    transports: logTransports,
  }, Log.defaultWinstonOpts);

  const winstonLogger = new winston.Logger(winstonOpts || Log.defaultWinstonOpts);
  const winexMeta = Object.assign({}, Log.defaultWinexMeta, options.meta)
  const winexOpts = Object.assign({}, Log.defaultWinexOpts, options.opts)

  this._winexConstructor = winex.factory(winstonLogger, winexMeta, winexOpts);

  /*
    Opts for request-logging middleware (applies to all logs generated by the
    instance of the middleware):

    @type       {String} type description (e.g., "server" or "client")
    @meta       {Object} descriptive fields to attach to log
    @errNoStack {boolean} When true, don't include stack when logging errors.
    @info404    {boolean} When true, log 404s as info instead of warning.
  */
  this.middleware = this._winexConstructor.middleware;

  if (options.sentry) {
    this.ravenClient = new raven.Client(
      options.sentry.dsn,
      options.sentry.options
    );
  } else {
    this.ravenClient = new raven.Client(false);
  }
}

Log.defaultWinstonOpts = {}
Log.defaultWinexMeta = {}
Log.defaultWinexOpts = {}

/**
 * setDefaultOpts - Set default options for the Logger class.
 * @param {Object} defaults
 * @param {Object} defaults.winstonOpts
 * @param {Object} defaults.meta Meta to attach to every log from this Log class.
 * @param {Object} defaults.opts Opts to apply to every log from this Log class.
 */
Log.setDefaults = (defaults) => {
  Log.defaultWinstonOpts  = defaults.winstonOpts
  Log.defaultWinexMeta    = defaults.meta
  Log.defaultWinexOpts    = defaults.opts
}

/**
 * Helper function for attaching methods to the logger prototype.
 *
 * @param {string} level  Logging level, e.g. 'debug'.
 *
 * @return {Function} Logging method to attach to the Log prototype.
 */
function _logger(level) {
  return function(message, meta, error) {
    var log = new this._winexConstructor();

    if (util.isError(meta)) {
      error = meta;
      meta = null;
    }

    if (meta) {
      log.addMeta(meta);
    }

    if (error) {
      this.ravenClient.captureException(error, _getSentryMeta(meta));
      log.addError(error);
    }

    log[level](message);
  };
}

/**
 * Format log meta to sentry optional attribute. See:
 * https://docs.getsentry.com/hosted/clients/node/usage/#optional-attributes
 *
 * @param {Object} [meta] Meta data passed to logger
 *
 * @return {Object} Optional attributes for sentry. Default will look like:
 *                  {
 *                    tags: {
 *                      env: 'development'
 *                    }
 *                  }
 */
function _getSentryMeta(meta) {
  var _meta = meta || {};

  return merge(
    {
      tags: {
        env: process.env.NODE_ENV || 'development',
      },
    },
    {
      extra: omit(_meta, ['tags', 'fingerprint', 'level']),
      tags: _meta.tags,
      fingerprint: _meta.fingerprint,
      level: _meta.level,
    }
  );
}

Object.keys(sysLogLevels.levels).forEach(function(level) {
  Log.prototype[level] = _logger(level);
});

module.exports = {
  Log: Log,
  _getSentryMeta: _getSentryMeta,
};
