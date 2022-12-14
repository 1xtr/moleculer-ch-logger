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
 * @property {string} [tableTTL='date + INTERVAL 1 DAY RECOMPRESS CODEC(ZSTD(3))'] TTL for table in ClickHouse, default is Recompress after 1 day with CODEC(ZSTD(3))
 * @property {boolean} [useBuffer=false] Use buffer table for reading and writing data, default false
 */

'use strict'
require('isomorphic-fetch')
const _ = require('lodash')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const BaseLogger = require('moleculer').Loggers.Base
const { hostname } = require('os')

dayjs.extend(utc)
dayjs.extend(timezone)
fetch.Promise = Promise
const isObject = (o) => o !== null && typeof o === 'object' && !(o instanceof String)

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
  constructor(opts = {}) {
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
      // use source like TAG
      source: process.env.MOL_NODE_NAME || 'moleculer',
      hostname: hostname(),
      objectPrinter: null,
      interval: 10 * 1000,
      timeZone: 'Europe/Istanbul',
      tableTTL: 'date + INTERVAL 1 DAY RECOMPRESS CODEC(ZSTD(3))',
      useBuffer: false,
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
  
    try {
      dayjs.extend(utc)
      dayjs.extend(timezone)
    } catch (e) {
      throw new Error(
        "The 'dayjs' package is missing! Please install it with 'npm install dayjs --save' command."
      )
    }
    
    this.createDB()
      .then((res) => {
        console.info(`Database ${this.opts.dbName} created successfully`, res)
      })
      .then(() => {
        this.createTable()
          .then((res) => {
            console.info(
              `Table ${this.opts.dbTableName} in db ${this.opts.dbName} created successfully`,
              res
            )
          })
          .then(() => {
            if (!this.opts.useBuffer) return
            this.createBufferTable()
              .then((res) => {
                console.info(`Buffer table ${this.opts.dbName}_buffer created successfully`, res)
              })
              .catch((err) => {
                /* istanbul ignore next */
                // eslint-disable-next-line no-console
                console.warn(
                  `Unable to create table ${this.opts.dbTableName}_buffer in database ${this.opts.dbName}. Error:${err.message}`,
                  err
                )
              })
          })
          .catch((err) => {
            /* istanbul ignore next */
            // eslint-disable-next-line no-console
            console.warn(
              `Unable to create table ${this.opts.dbTableName} in database ${this.opts.dbName}. Error:${err.message}`,
              err
            )
          })
      })
      .catch((err) => {
        /* istanbul ignore next */
        // eslint-disable-next-line no-console
        console.warn(`Unable to create database ${this.opts.dbName}. Error:${err.message}`, err)
      })

    this.objectPrinter = this.opts.objectPrinter
      ? this.opts.objectPrinter
      : (o) => JSON.stringify(o)

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
    const level = bindings ? this.getLogLevel(bindings.mod) : null
    if (!level) return null

    let requestID = ''
    let subdomain = ''
    let caller = ''

    const printArgs = (args) => {
      return args.map((p) => {
        if (isObject(p) && p.requestID !== undefined) {
          requestID = p.requestID
          subdomain = p.subdomain
          caller = p.caller
          delete p.span
          return this.objectPrinter(p)
        }
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
        requestID,
        subdomain,
        caller,
        bindings,
      })
      requestID = ''
      subdomain = ''
      caller = ''
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

      const data = rows
        .map((row) =>
          JSON.stringify({
            timestamp: row.ts,
            requestID: row.requestID,
            subdomain: row.subdomain,
            caller: row.caller,
            date: dayjs(row.ts).tz(this.opts.timeZone).format('YYYY-MM-DD'),
            level: row.level,
            message: row.msg,
            nodeID: row.bindings.nodeID,
            namespace: row.bindings.ns,
            service: row.bindings.svc,
            version: row.bindings.ver ? String(row.bindings.ver) : '',
            source: this.opts.source,
            hostname: this.opts.hostname,
          })
        )
        .join('\n')

      return fetch(this.host, {
        method: 'POST',
        body: `INSERT INTO ${this.opts.useBuffer ? `${this.opts.dbTableName}_buffer` : this.opts.dbTableName} FORMAT JSONEachRow ${data}`,
        headers: {
          'X-ClickHouse-Database': this.opts.dbName,
          'X-ClickHouse-User': this.opts.dbUser,
          'X-ClickHouse-Key': this.opts.dbPassword,
        },
      })
        .then((/* res */) => {
          // console.info("Logs are uploaded to ClickHouse. Status: ", res.statusText);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`Unable to upload logs to ClickHouse server. Error:${err.message}`, err)
        })
    }

    return this.broker.Promise.resolve()
  }

  createDB() {
    return fetch(this.host, {
      method: 'POST',
      body: `CREATE DATABASE IF NOT EXISTS ${this.opts.dbName}`,
      headers: {
        'X-ClickHouse-User': this.opts.dbUser,
        'X-ClickHouse-Key': this.opts.dbPassword,
      },
    })
  }

  createTable() {
    const body = `CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName} (
          timestamp DateTime64(3, '${this.opts.timeZone}') DEFAULT now(),
          requestID String,
          subdomain String,
          caller String,
          level String,
          message String,
          nodeID String,
          namespace String,
          service String,
          version String,
          source String,
          hostname String,
          date Date DEFAULT today())
      ENGINE = MergeTree()
      ORDER BY (toStartOfHour(timestamp), service, level, subdomain, requestID, timestamp)
      PRIMARY KEY (toStartOfHour(timestamp), service, level, subdomain, requestID)
      PARTITION BY (date, toStartOfDay(timestamp))
      TTL ${this.opts.tableTTL}
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
      ENGINE = Buffer('${this.opts.dbName}', '${this.opts.dbTableName}', 16, 10, 100, 1000, 10000, 10000, 100000);`
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
