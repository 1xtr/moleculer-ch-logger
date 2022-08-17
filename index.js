/*
 * moleculer
 * Copyright (c) 2019 MoleculerJS (https://github.com/moleculerjs/moleculer)
 * MIT Licensed
 */

/**
 * @typedef {Object} ClickHouseLoggerOptions
 * @property {string} [url='http://localhost'] Url to your CH server like http://localhost
 * @property {number} [port=8123] Port to connect to server. Default is 8123
 * @property {string} [dbName='default'] Database name, default is 'default'
 * @property {string} [dbUser='default'] Database user, default is 'default'
 * @property {string} [dbPassword=''] Database user password, default is empty string
 * @property {string} [dbTableName='logs'] Database table, default is 'logs'
 * @property {string} [source='moleculer'] Use source like single TAG, its default is 'moleculer' or env MOL_NODE_NAME
 * @property {string} [hostname='hostname'] Hostname, default is machine hostname 'os.hostname()'
 * @property {Function} [objectPrinter] Callback function for object printer, default is 'util.inspect()'
 * @property {number} [interval=10000] Date uploading interval in milliseconds, default is 10000
 * @property {string} [timeZone='Europe/Istanbul'] Time zone for save in database, default is 'Europe/Istanbul'
 */

'use strict'
require('isomorphic-fetch')
const _ = require('lodash')
const BaseLogger = require('moleculer').Loggers.Base
const {hostname} = require('os')
const {inspect} = require('util')

fetch.Promise = Promise
const isObject = function (o) {
  return o !== null && typeof o === 'object' && !(o instanceof String)
}

/**
 * ClickHouseLogger logger for Moleculer
 *
 * @class ClickHouseLogger
 * @constructor
 * @extends {BaseLogger}
 */
class ClickHouseLogger extends BaseLogger {
  /**
   * Creates an instance of ClickHouseLogger.
   * @param {ClickHouseLoggerOptions} opts
   * @memberof ClickHouseLogger
   */
  constructor(opts= {}) {
    super(opts)
    /**
     * @type {ClickHouseLoggerOptions}
     */
    const defaultOptions = {
      url: 'http://localhost',
      port: 8123,
      dbName: 'default',
      dbUser: 'default',
      dbPassword: '',
      dbTableName: 'logs',
      // use source like single TAG
      source: process.env.MOL_NODE_NAME || 'moleculer',
      hostname: hostname(),
      objectPrinter: (o) => {
        return inspect(o, {
          showHidden: false,
          depth: null,
          colors: false,
          breakLength: Number.POSITIVE_INFINITY,
        })
      },
      interval: 10 * 1000,
      timeZone: 'Europe/Istanbul',
    }
    
    this.opts = _.defaultsDeep(this.opts, defaultOptions)
    this.queue = []
    this.timer = null
    this.host = `${this.opts.url}:${this.opts.port}`
    
  }
  
  /**
   * Initialize logger.
   *
   * @param {LoggerFactory} loggerFactory
   */
  init(loggerFactory) {
    super.init(loggerFactory)
    
    this.createDB()
      .then((res) => {
        console.info(`Database ${this.opts.dbName} created successfully`, res);
        this.createTable()
          .then((res) => {
            console.info(`Table ${this.opts.dbTableName} in db ${this.opts.dbName} created successfully`, res);
          })
          .then(() => {
            this.createBufferTable().then()
          })
          .catch(err => {
            /* istanbul ignore next */
            // eslint-disable-next-line no-console
            console.warn(
              `Unable to create table ${this.opts.dbTableName} in database ${this.opts.dbName}. Error:${err.message}`,
              err,
            )
          })
      })
      .catch(err => {
        /* istanbul ignore next */
        // eslint-disable-next-line no-console
        console.warn(
          `Unable to create database ${this.opts.dbName}. Error:${err.message}`,
          err,
        )
      })
    
    this.objectPrinter = this.opts.objectPrinter
      ? this.opts.objectPrinter
      : o =>
        inspect(o, {
          showHidden: false,
          depth: null,
          colors: false,
          breakLength: Number.POSITIVE_INFINITY,
        })
    
    if (this.opts.interval > 0) {
      this.timer = setInterval(() => this.flush(), this.opts.interval)
      this.timer.unref()
    }
  }
  
  /**
   * Stopping logger
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    
    return this.flush()
  }
  
  /**
   * Generate a new log handler.
   *
   * @param {object} bindings
   */
  getLogHandler(bindings) {
    let level = bindings ? this.getLogLevel(bindings.mod) : null
    if (!level) return null
    
    const printArgs = args => {
      return args.map(p => {
        if (isObject(p) || Array.isArray(p)) return this.objectPrinter(p)
        return p
      })
    }
    const levelIdx = BaseLogger.LEVELS.indexOf(level)
    
    return (type, args) => {
      const typeIdx = BaseLogger.LEVELS.indexOf(type)
      if (typeIdx > levelIdx) return
      
      this.queue.push({
        ts: Date.now(),
        level: type,
        msg: printArgs(args).join(' '),
        bindings,
      })
      if (!this.opts.interval) this.flush()
    }
  }
  
  /**
   * Flush queued log entries to ClickHouseLogger.
   */
  flush() {
    if (this.queue.length > 0) {
      const rows = Array.from(this.queue)
      this.queue.length = 0
      
      const data = rows.map(row => JSON.stringify({
        timestamp: row.ts,
        date: Math.trunc(row.ts/1000),
        level: row.level,
        message: row.msg,
        nodeID: row.bindings.nodeID,
        namespace: row.bindings.ns,
        service: row.bindings.svc,
        version: row.bindings.ver ? String(row.bindings.ver) : '',
        source: this.opts.source,
        hostname: this.opts.hostname,
      })).join('\n')
      
      return fetch(this.host, {
        method: 'POST',
        body: `INSERT INTO ${this.opts.dbTableName} FORMAT JSONEachRow ${data}`,
        headers: {
          'X-ClickHouse-Database': this.opts.dbName,
          'X-ClickHouse-User': this.opts.dbUser,
          'X-ClickHouse-Key': this.opts.dbPassword,
        },
      })
        .then((/*res*/) => {
          // console.info("Logs are uploaded to ClickHouse. Status: ", res.statusText);
        })
        .catch(err => {
          /* istanbul ignore next */
          // eslint-disable-next-line no-console
          console.warn(
            "Unable to upload logs to ClickHouse server. Error:" + err.message,
            err
          );
        })
    }
    
    return this.broker.Promise.resolve()
  }
  
  createDB() {
    const body = `CREATE DATABASE IF NOT EXISTS ${this.opts.dbName}`
    return fetch(this.host, {
      method: 'POST',
      body,
      headers: {
        'X-ClickHouse-User': this.opts.dbUser,
        'X-ClickHouse-Key': this.opts.dbPassword,
      },
    })
  }
  
  createTable() {
    const body = `CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName} (
          timestamp DateTime64(3, ${this.opts.timeZone}) DEFAULT now(${this.opts.timeZone}),
          level String,
          message String,
          nodeID String,
          namespace String,
          service String,
          version String,
          source String,
          hostname String
          date Date DEFAULT today(${this.opts.timeZone}))
      ENGINE = MergeTree()
      PARTITION BY date
      ORDER BY tuple()
      SETTINGS index_granularity = 8192;`
    return fetch(this.host, {
      method: 'POST',
      body,
      headers: {
        'X-ClickHouse-Database': this.opts.dbName,
        'X-ClickHouse-User': this.opts.dbUser,
        'X-ClickHouse-Key': this.opts.dbPassword,
      },
    })
  }
  createBufferTable() {
    const body = `CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName}_buffer
      as ${this.opts.dbTableName}
      ENGINE = **Buffer**(default, metrics, 16, 10, 100, 1000, 10000, 10000, 100000)`
    return fetch(this.host, {
      method: 'POST',
      body,
      headers: {
        'X-ClickHouse-Database': this.opts.dbName,
        'X-ClickHouse-User': this.opts.dbUser,
        'X-ClickHouse-Key': this.opts.dbPassword,
      },
    })
  }
  
}

module.exports = ClickHouseLogger
