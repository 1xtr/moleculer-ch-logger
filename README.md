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
const options = {
  url: 'http://localhost',
  port: 8123,
  dbName: 'default',
  dbUser: 'default',
  dbPassword: '',
  dbTableName: 'logs',
  // use source like TAG
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
```
## Log table

```js
const query = `CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName} (
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
```

## Buffer

```js
const query = `CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName}_buffer
as ${this.opts.dbTableName}
ENGINE = **Buffer**(default, metrics, 16, 10, 100, 1000, 10000, 10000, 100000)`
```
