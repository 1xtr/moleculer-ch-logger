![Moleculer logo](http://moleculer.services/images/banner.png)

[![NPM version](https://img.shields.io/npm/v/@1xtr/moleculer-ch-logger.svg)](https://www.npmjs.com/package/@1xtr/moleculer-ch-logger) ![NPM Downloads](https://img.shields.io/npm/dw/@1xtr/moleculer-ch-logger) 

# Moleculer logger for ClickHouse

This is a fork from [native Datadog logger](https://github.com/moleculerjs/moleculer/blob/e62016ea16c5c4e303738a66e3a7429237ea9042/src/loggers/datadog.js) 

#   Description

Easy to save logs to ClickHouse with moleculer

# Install

```bash
$ npm install @1xtr/moleculer-ch-logger --save
```

# Usage

```js
const ClickHouseLogger = require('@1xtr/moleculer-ch-logger')

module.exports = {
    logger: new ClickHouseLogger({
      // put here your options
    })
}
```
# Default options

```js
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
```
## Log table

```js
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
```

## Buffer

```js
const body = `CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName}_buffer
      as ${this.opts.dbTableName}
      ENGINE = Buffer('${this.opts.dbName}', '${this.opts.dbTableName}', 16, 10, 100, 1000, 10000, 10000, 100000);`
```

## Logger mixin
<details>
<summary>That mixin I use for logging (Click for open)</summary>

```js
const defaultContext = {
  requestID: '',
  meta: { customer: { subdomain: '' } },
}

module.exports = {
  name: 'logger',
  methods: {
    log(data, ctx = defaultContext) {
      this.sendLog(data, ctx, 'info')
    },
    error(title, error, ctx = defaultContext) {
      this.logger.error({
        title,
        subdomain: ctx.meta.customer ? ctx.meta.customer.subdomain : '',
        caller: ctx.caller || '',
        error,
        requestID: ctx.requestID || '',
      })
    },
    err(error, ctx = defaultContext) {
      this.logger.error({
        title: error.message,
        subdomain: ctx.meta.customer ? ctx.meta.customer.subdomain : '',
        caller: ctx.caller || '',
        error,
        requestID: ctx.requestID || '',
      })
    },
    warn(data, ctx = defaultContext) {
      this.sendLog(data, ctx, 'warn')
    },
    sendLog(data, ctx, logType) {
      if (!ctx.meta.customer) {
        ctx.meta.customer = { subdomain: '' }
      }

      if (typeof data === 'string') {
        return this.logger[logType]({
          requestID: ctx.requestID || '',
          subdomain: ctx.meta.customer.subdomain || '',
          caller: ctx.caller || '',
          title: data,
        })
      }

      if (typeof data !== 'object') {
        return this.logger[logType]({
          requestID: ctx.requestID || '',
          subdomain: ctx.meta.customer.subdomain || '',
          caller: ctx.caller || '',
          data,
        })
      }

      return this.logger[logType]({
        requestID: ctx.requestID || '',
        subdomain: ctx.meta.customer.subdomain || '',
        caller: ctx.caller || '',
        ...data,
      })
    },
  },
}
```
</details>

## Documentation

For more details read [docs](https://github.com/1xtr/moleculer-ch-logger/tree/main/docs)
