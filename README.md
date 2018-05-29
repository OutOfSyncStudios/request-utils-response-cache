# request-utils-response-cache

[![NPM](https://nodei.co/npm/@mediaxpost/request-utils-response-cache.png?downloads=true)](https://nodei.co/npm/@mediaxpost/request-utils-response-cache/)

![Version](http://img.shields.io/npm/v/@mediaxpost/request-utils-response-cache.svg)
![Downloads](http://img.shields.io/npm/dt/@mediaxpost/request-utils-response-cache.svg)
[![Build Status](https://travis-ci.org/MediaXPost/request-utils-response-cache.svg)](https://travis-ci.org/MediaXPost/request-utils-response-cache)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/e335eaddf1ce4a51a8cfbd6c24104e4b)](https://www.codacy.com/app/chronosis/request-utils-response-cache?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=MediaXPost/request-utils-response-cache&amp;utm_campaign=Badge_Grade)

[![Dependencies](https://david-dm.org/MediaXPost/request-utils-response-cache/status.svg)](https://david-dm.org/MediaXPost/request-utils-response-cache)

`request-utils-response-cache` is an inline, response caching mechanism for [ExpressJS](https://www.npmjs.com/package/express) and [request-utils](https://www.npmjs.com/package/@mediaxpost/request-utils) which uses a connected [ObjectKeyCache](https://www.npmjs.com/package/@mediaxpost/object-key-cache) or [Redis](https://www.npmjs.com/package/redis).

Response Caching is highly recommended for any client facing Express application or APIs that are build on top of Express that may be under even the most modest of loads.

A response's `res.locals` data are cached based on the following HTTP Request criteria:

 * HTTP Method (optional)
 * Request URL
 * HTTP Headers (optional)
 * HTTP Query Params (optional)
 * HTTP Form Body Params
 * Express Parameter value (`req.params`)

 Any `etag`, `if-match`, `if-none-match`, `if-modified-since`, or `if-unmodified-since` headers are stripped from the request before checking against the cache for a matching request. Additionally, if the header `cache-control` set to `no-cache` is passed in the request, then the cache checking is skipped.

If two requests are made with the same criteria, then the second request will be served from cache. By default, responses are cached on a 5-minute fixed window based on the timestamp of the initial cached response. After the timeframe has elapsed, the response is fully handled and the results can be cached again.

If there are any unexpected errors during the cache retrieval process, then the process fails silently and the request is handled as if it were not cached.

If additional manipulation of the request is desired then it is possible to provide an `onCacheMiss(req, res)` and `onCacheHit(req, res, data)` to the configuration of the Response Cache

# [Installation](#installation)
<a name="installation"></a>

```shell
npm install @mediaxpost/request-utils-response-cache
```

# [Usage](#usage)
<a name="usage"></a>

```js
const ResponseCache = require('@mediaxpost/request-utils-response-cache');
let responseCache = new ResponseCache('responses', {
  expire: 300000, // Five minutes
  onCacheHit: ((req, res, data) => {
    res.set('Content-Type', 'application/json');
  })
});

function sendResponse(req, res, next) {
  if (!res.headersSent) {
    res.set('Content-Type', 'application/json');
    for (const header in res.locals.headers) {
      if (res.locals.headers.hasOwnProperty(header)) {
        res.header(header, res.locals.headers[header]);
      }
    }
    res.status(res.locals.status);
    res.json(__.omit(res.locals.body, ['cacheExpiration']));
  }
  next();
}

// Later within the expressJS request stack
// Before other processing, check cache
app.use(responseCache.handler);

// Do other processing
// app.use...

// After other processing
app.use(responseCache.store); // This only stores when the req.needsCache is set

// Process the res.locals and send response
app.use(sendResponse);
```

<a name="api"></a>
# [API Reference](#api)

## constructor(cacheNamespace [, config] [, cache] [, log])
Create a new ResponseCache with the passed `cacheNamespace`, [`config`](#config-object), [`cache`](#cache-object), and [`log`](#logging-object).  A `cacheNamespace` is required to scope the Response Cache to scope other values which may be in use within the cache.

## handler(req, res, next)
An ExpressJS handler to check the current request against cache. If the cache
exists, then it is retrieved and placed in `res.locals` and sets `req.usedCache`
to true. If the cache does not exist and the request should be cached, then this
sets the `req.needsCache` to true. This should occur early in the ExpressJS stack.

```js
  app.use(responseCache.handler);
```

## store(req, res, next)
An ExpressJS handler to store the current request when the `handler` indicates that
the current request is not cached by the `req.needsCache`. This should occur just
before the response is sent in the ExpressJS stack.

```js
  app.use(responseCache.handler);
```

<a name="appendix"></a>
# [Appendix](#appendix)

<a name="config-object"></a>
## [Configuration Object](#config-object)

The configuration parameter expects and object that contains the following (with defaults provided below):
```js
{
  expire: 300000 // every 5 minute window (in mSec)
  ignoreHeaders: false,
  ignoreMethod: false,
  ignoreQuery: false,
  onCacheHit: (req, res, data) => {

  },
  onCacheMiss: (req, res) => {

  }
}
```

|parameter|type|description|
|---------|----|-----------|
|**`expire`**|Integer|Number of milliseconds for the fixed window for the initial cache.|
|**`onCacheHit`**|Function(req, res, data) or `null`|A function accepting a HTTPRequest, a HTTPResponse, object data. When a request hits the cache then this function is called so additional data processing can occur.|
|**`onCacheMiss`**|Function(req, res) or `null`|A function accepting a HTTPRequest, a HTTPResponse. When a request misses the cache then this function is called so additional data processing can occur.|
|**`ignoreHeaders`**|Boolean|Skips the request headers when calculating the cache key|
|**`ignoreMethod`**|Boolean|Skips the request method when calculating the cache key|
|**`ignoreQuery`**|Boolean|Skips the query parameters when calculating the cache key|

<a name="cache-object"></a>
## [Cache Object](#cache-object)
The Cache object can be a active and [promisified Redis](https://www.npmjs.com/package/redis#promises) connect, or an active [ObjectKeyCache](https://www.npmjs.com/package/@mediaxpost/object-key-cache). If no value is set, then the response cache will create an internal Object Key Cache and use it.

<a name="logging-object"></a>
## [Logging Object](#logging-object)
The Logging object is an instance of any logging library, such as [Winston](https://www.npmjs.com/package/winston) or [Bunyan](https://www.npmjs.com/package/bunyan), which support the `.error(...)`, `.info(...)`, `.debug(...)`, and `.log(...)` methods. If this is not provided, then any debug or error messages are sent to `/dev/null` through the use of [`LogStub`](https://www.npmjs.com/package/logstub).
