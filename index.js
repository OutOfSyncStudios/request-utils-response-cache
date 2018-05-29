// index.js
/* eslint no-unused-vars: warn */

// Dependencies
const __ = require('@mediaxpost/lodashext');
const moment = require('moment');
const ObjectKeyCache = require('@mediaxpost/object-key-cache');
const RedisClient = require('redis').RedisClient;
const LogStub = require('logstub');

class ResponseCache {
  constructor(namespace, config, cache, log) {
    const defaults = {
      expire: 1000 * 60 * 5,
      // every 5 minute window
      ignoreHeaders: false,
      ignoreMethod: false,
      ignoreQuery: false,
      onCacheHit: (req, res, data) => {
        return;
      },
      onCacheMiss: (req, res) => {
        return;
      }
    };

    if (__.isUnset(namespace)) {
      throw new Error('The response cache namespace can not be omitted.');
    }
    this.namespace = namespace;

    // Handle Cache Setup
    if (cache instanceof RedisClient) {
      // If the cache object is an instanceof Redis connection, then build the ObjectKeyCache
      this.cache = new ObjectKeyCache();
      this.cache.attachToClient(cache);
    } else if (cache instanceof ObjectKeyCache) {
      this.cache = cache;
    } else if (__.isUnset(cache)) {
      // Default the cache to a memory cache if unset
      this.cache = new ObjectKeyCache();
      this.cache.connect();
    } else {
      // Unknown type
      throw new Error('When passing a cache object, it must be a connected instance of a RedisClient or an ObjectKeyCache.');
    }

    this.log = log || new LogStub();

    this.config = __.merge(Object.assign(defaults), config);
  }

  calcReqKey(req) {
    // Strip out browser based cache validation headers that cause cache misses
    const headers = __.omit(req.headers, [
      'etag',
      'if-match',
      'if-none-match',
      'if-modified-since',
      'if-unmodified-since'
    ]);
    const obj = { url: req.url, body: req.body, params: req.params };
    if (!this.config.ignoreHeaders) {
      obj.headers = headers;
    }
    if (!this.config.ignoreMethod) {
      obj.method = req.method;
    }
    if (!this.config.ignoreQuery) {
      obj.query = req.query;
    }

    return obj;
  }

  setResponseLocals(res) {
    const now = moment();
    const defaults = {
      time: `${now.format()}Z`,
      timestamp: now.format('x'),
      cacheExpiration: now + this.config.expire
    };
    res.locals = res.locals || {};
    res.locals.headers = res.locals.headers || {};
    res.locals.status = res.locals.status || 0;
    res.locals.body = res.locals.body || {};
    res.locals.body.cache = res.locals.body.cache || {};
    res.locals.body.cache = __.merge(Object.assign(defaults), res.locals.body.cache);
  }

  handler(req, res, next) {
    req.needsCache = false;
    req.usedCache = false;
    req.cacheKey = null;
    // check cache control as to whether this response should retrieve from cache or not
    if (__.hasValue(req.headers['cache-control']) && req.headers['cache-control'] === 'no-cache') {
      this.log.debug('Response from Logic - No-Cache Policy');
      this.config.onCacheMiss(req, res);
      next();
    } else if (req.method !== 'GET') {
      this.log.debug('Response from Logic - Non-GET Request');
      this.config.onCacheMiss(req, res);
      next();
    } else {
      // calc object field key
      const fieldKey = this.calcReqKey(req);
      req.cacheKey = fieldKey;
      this.cache
        .ohget(this.namespace, fieldKey)
        .then((data) => {
          // check to see if the key/field exists
          if (data) {
            const now = Date.now();
            const objData = JSON.parse(data);
            // If it is missing expiration or expired recache the responseCache
            if (__.isUnset(objData.body.cache.cacheExpiration)) {
              this.log.debug('Response from Logic - No Expiration');
              req.needsCache = true;
              this.config.onCacheMiss(req, res);
              next();
            } else if (now >= objData.body.cache.cacheExpiration) {
              this.log.debug('Response from Logic - Expired Cache');
              req.needsCache = true;
              this.config.onCacheMiss(req, res);
              next();
            } else {
              // If the data is not expired then send the response data, headers, and set the req.hasData bit
              this.log.debug('Response from Cache');

              // Add Cache information to the output
              this.setResponseLocals(res);
              res.locals.headers = __.merge(Object.assign(objData.headers), res.locals.headers);
              res.locals.status = objData.status;
              res.locals.body = objData.body;

              req.hasData = true;
              req.usedCache = true;
              this.config.onCacheHit(req, res, objData);

              next();
            }
          } else {
            // set the req.needsCache bit and call next()
            this.log.debug('Response from Logic - No Cache');
            req.needsCache = true;
            this.config.onCacheMiss(req, res);
            next();
          }
        })
        .catch((err) => {
          // If there was some error retrieving from cache, then skip caching, report the error and move on.
          req.needsCache = false;
          this.log.error(JSON.stringify(err));
          this.config.onCacheMiss(req, res);
          next();
        });
    }
  }

  store(req, res, next) {
    // Calc cache field key again
    const fieldKey = this.calcReqKey(req);
    // check the req.needsCache bit
    if (req.needsCache) {
      this.setResponseLocals(res);
      // cache body, headers, and status
      this.cache
        .ohset(this.namespace, fieldKey, JSON.stringify(res.locals))
        .then(() => {
          next();
        })
        .catch((err) => {
          next(err);
        });
    } else {
      next();
    }
  }
}

module.exports = ResponseCache;
