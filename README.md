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
}
```
