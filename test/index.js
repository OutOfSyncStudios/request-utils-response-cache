// test/index.js
/* eslint no-unused-vars: warn */

// Dependencies
const lolex = require('lolex');
const chai = require('chai');
const expect = chai.expect;
const ResponseCache = require('..');
const ObjectKeyCache = require('@mediaxpost/object-key-cache');
const Redis = require('redis');

const res = {
  _status: 0,
  _message: '',
  _headers: {},
  status: function(status) {
    this._status = status;
  },
  send: function(data) {
    this._message = data;
  },
  set: function(key, value) {
    if (!this._headers) {
      this._headers = {};
    }
    this._headers[key] = value;
  }
};

describe('ResponseCache', () => {
  let clock;
  let responseCache;
  let req, reqReturned;

  before(() => {
    responseCache = new ResponseCache('test', { expire: 10 });
    clock = lolex.install();
  });

  beforeEach(() => {
    req = Object.assign({
      headers: { etag: '2c94a7fe10e29b34c5cc7181', 'if-modified-since': '2018-01-01T12:00:00Z', lame: 'lamer' },
      connection: { remoteAddress: '127.0.0.1' },
      url: 'http://localhost/',
      path: '/',
      method: 'GET'
    });
    responseCache.config.ignoreHeaders = false;
    responseCache.config.ignoreMethod = false;
    responseCache.config.ignoreQuery = false;
  });

  it('constructor', () => {
    expect(responseCache).to.be.instanceof(ResponseCache);
  });

  it('calcReqKey', () => {
    const key = responseCache.calcReqKey(req);
    expect(key).to.be.an('object');
    expect(key).to.have.property('url');
    expect(key).to.have.property('body');
    expect(key).to.have.property('params');
    expect(key).to.have.property('headers');
    expect(key.headers).to.not.include(['etag', 'if-modified-since']);
    expect(key).to.have.property('method');
    expect(key).to.have.property('query');
  });

  it('calcReqKey (ignore headers)', () => {
    responseCache.config.ignoreHeaders = true;
    const key = responseCache.calcReqKey(req);
    expect(key).to.be.an('object');
    expect(key).to.have.property('url');
    expect(key).to.have.property('body');
    expect(key).to.have.property('params');
    expect(key).to.not.have.property('headers');
    expect(key).to.have.property('method');
    expect(key).to.have.property('query');
  });

  it('calcReqKey (ignore method)', () => {
    responseCache.config.ignoreMethod = true;
    const key = responseCache.calcReqKey(req);
    expect(key).to.be.an('object');
    expect(key).to.have.property('url');
    expect(key).to.have.property('body');
    expect(key).to.have.property('params');
    expect(key).to.have.property('headers');
    expect(key).to.not.have.property('method');
    expect(key).to.have.property('query');
  });

  it('calcReqKey (ignore query)', () => {
    responseCache.config.ignoreQuery = true;
    const key = responseCache.calcReqKey(req);
    expect(key).to.be.an('object');
    expect(key).to.have.property('url');
    expect(key).to.have.property('body');
    expect(key).to.have.property('params');
    expect(key).to.have.property('headers');
    expect(key).to.have.property('method');
    expect(key).to.not.have.property('query');
  });

  it('setResponseLocals', () => {
    responseCache.setResponseLocals(res);
    expect(res.locals).to.be.an('object');
    expect(res.locals.body).to.be.an('object');
    expect(res.locals.body.cache).to.be.an('object');
  });

  it('handler (cache-control : no-cache)', (done) => {
    req.headers['cache-control'] = 'no-cache';
    responseCache.handler(req, res, (err) => {
      expect(req.needsCache).to.equal(false);
      done(err);
    });
  });

  it('handler (POST)', (done) => {
    req.method = 'POST';
    responseCache.handler(req, res, (err) => {
      expect(req.needsCache).to.equal(false);
      expect(req.usedCache).to.equal(false);
      reqReturned = Object.assign(req);
      done(err);
    });
  });

  it('store (needsCache === false)', (done) => {
    const key = responseCache.calcReqKey(reqReturned);
    responseCache.store(reqReturned, res, (err) => {
      if (err) {
        done(err);
      } else {
        responseCache.cache
          .ohget(responseCache.namespace, key)
          .then((val) => {
            expect(val).to.equal(null);
            done();
          })
          .catch((innerErr) => {
            done(innerErr);
          });
      }
    });
  });

  it('handler (GET)', (done) => {
    req.method = 'GET';
    responseCache.handler(req, res, (err) => {
      expect(req.needsCache).to.equal(true);
      expect(req.usedCache).to.equal(false);
      reqReturned = Object.assign(req);
      done(err);
    });
  });

  it('store (needsCache === true)', (done) => {
    const key = responseCache.calcReqKey(reqReturned);
    responseCache.store(reqReturned, res, (err) => {
      if (err) {
        done(err);
      } else {
        responseCache.cache
          .ohget(responseCache.namespace, key)
          .then((val) => {
            expect(val).to.not.equal(null);
            done();
          })
          .catch((innerErr) => {
            done(innerErr);
          });
      }
    });
  });

  it('handler (GET -- from cache)', (done) => {
    responseCache.handler(req, res, (err) => {
      expect(req.needsCache).to.equal(false);
      expect(req.usedCache).to.equal(true);
      done(err);
    });
  });

  it('handler (GET -- after expiration)', (done) => {
    clock.tick(20);
    responseCache.handler(req, res, (err) => {
      expect(req.needsCache).to.equal(true);
      expect(req.usedCache).to.equal(false);
      done(err);
    });
  });
});

describe('ResponseCache (RedisClient)', () => {
  let responseCache;
  const client = Redis.createClient();

  it('constructor', () => {
    responseCache = new ResponseCache('test', { expire: 10 }, client);
    expect(responseCache).to.be.instanceof(ResponseCache);
    client.quit();
  });
});

describe('ResponseCache (ObjetKeyCache)', () => {
  let responseCache;
  const cache = new ObjectKeyCache();

  it('constructor', (done) => {
    cache
      .connect()
      .then(() => {
        responseCache = new ResponseCache('test', { expire: 10 }, cache);
        expect(responseCache).to.be.instanceof(ResponseCache);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });
});

describe('ResponseCache (Bad Cache Type)', () => {
  const client = 'asdfasdfsadf';

  it('constructor', () => {
    const setup = () => {
      const responseCache = new ResponseCache('test', { expire: 10 }, client);
    };
    expect(setup).to.throw();
  });
});
