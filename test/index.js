/*eslint vars-on-top:0*/

'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var winston = require('winston');
var TestTransport = require('./mock/test-transport');
var index = require('../index');

describe('index', function () {

  var sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('Log constructor', function () {

    it('should return a Log instance', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.be.an.instanceOf(index.Log);
    });

    it('should complain if no transports provided', function () {
      function tryMakeBadLog() {
        return new index.Log();
      }
      expect(tryMakeBadLog).to.throw(/No transports found/);
    });

    it('should have a debug method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('debug');
    });

    it('should have a info method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('info');
    });

    it('should have a notice method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('notice');
    });

    it('should have a warning method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('warning');
    });

    it('should have a error method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('error');
    });

    it('should have a crit method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('crit');
    });

    it('should have a alert method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('alert');
    });

    it('should have a emerg method', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.respondTo('emerg');
    });

    it('should support winston-loggly', function () {
      expect(winston.transports).to.have.property('Loggly');
    });

  });

  describe('log methods', function () {

    var log;
    var spy;

    beforeEach(function () {
      sandbox.stub(winston, 'transports', { TestTransport: TestTransport });

      spy = sinon.spy();
      log = new index.Log({
        transports: [{
          TestTransport: {
            level: 'debug',
            __log: spy
          }
        }],
        sentry: {}
      });
    });

    it('should log a message', function () {
      log.debug('say what?');

      sinon.assert.calledOnce(spy);
      sinon.assert.calledWith(spy, 'debug', 'say what?');
    });

    it('should log error properties', function () {
      log.error('oops', {}, new Error('dangit'));

      var args = spy.args[0];

      expect(args[2]).to.have.property('errMsg', 'dangit');
      expect(args[2]).to.have.property('errStack');
    });

    it('should log error as the second arg', function () {
      log.error('oops', new Error('dangit'));

      var args = spy.args[0];

      expect(args[2]).to.have.property('errMsg', 'dangit');
      expect(args[2]).to.have.property('errStack');
    });

    it('should log metadata', function () {
      log.debug('hi', { name: 'Dan' });

      var args = spy.args[0];

      expect(args[2]).to.have.property('name', 'Dan');
    });

  });

  describe('middleware', function () {

    it('should have middleware on the instance', function () {
      var log = new index.Log({ transports: [], sentry: {} });

      expect(log).to.have.property('middleware');
      expect(log.middleware).to.be.a('function');
    });

    it('should produce a middleware function', function () {
      var log = new index.Log({ transports: [], sentry: {} });
      var middleware = log.middleware();

      expect(middleware).to.be.a('function');
      expect(middleware).to.have.length(3);
    });

  });

  describe('_getSentryMeta', function () {

    it('should return null if meta is not defined', function () {
      var result = index._getSentryMeta();

      expect(result).to.be.null;
    });

    it('should add tags property', function () {
      var input = {
        tags: {
          key1: 'value1',
          key2: 'value2'
        }
      };

      var result = index._getSentryMeta(input);

      expect(result).to.have.property('tags');
      expect(result.tags).to.have.property('key1', 'value1');
      expect(result.tags).to.have.property('key2', 'value2');
    });

    it('should add fingerprint property', function () {
      var input = {
        fingerprint: 'fingerprintValue'
      };

      var result = index._getSentryMeta(input);

      expect(result).to.have.property('fingerprint', 'fingerprintValue');
    });

    it('should add level property', function () {
      var input = {
        level: 'error'
      };

      var result = index._getSentryMeta(input);

      expect(result).to.have.property('level', 'error');
    });

    it('should exclude tags, fingerprint, and level in extra', function () {
      var input = {
        level: 'error',
        tags: 'tagsValue',
        fingerprint: 'fingerprintValue',
        key1: 'value1',
        key2: 'value2'
      };

      var result = index._getSentryMeta(input);

      expect(result).to.have.property('extra');
      expect(result.extra).to.not.have.property('level');
      expect(result.extra).to.not.have.property('tags');
      expect(result.extra).to.not.have.property('fingerprint');
    });

    it('should include other property in extra', function () {
      var input = {
        level: 'error',
        tags: 'tagsValue',
        fingerprint: 'fingerprintValue',
        key1: 'value1',
        key2: 'value2'
      };

      var result = index._getSentryMeta(input);

      expect(result).to.have.property('extra');
      expect(result.extra).to.have.property('key1', 'value1');
      expect(result.extra).to.have.property('key2', 'value2');
    });

    it('should add tags if no tags are defined', function () {
      var input = {};

      var result = index._getSentryMeta(input);

      expect(result).to.have.property('extra');
      expect(result.tags).to.have.property('env', 'test');
    });

    it('should add env to tags if no env is defined', function () {
      var input = {
        tags: {
          key1: 'value1',
          key2: 'value2'
        }
      };

      var result = index._getSentryMeta(input);

      expect(result.tags).to.have.property('env', 'test');
    });

    it('should not change env in tags if env is defined', function () {
      var input = {
        tags: {
          key1: 'value1',
          key2: 'value2',
          env: 'production'
        }
      };

      var result = index._getSentryMeta(input);

      expect(result.tags).to.have.property('env', 'production');
    });

    it('should not mutate input', function () {
      var input = {
        tags: {
          key1: 'value1',
          key2: 'value2'
        }
      };

      index._getSentryMeta(input);

      expect(input).to.eql({
        tags: {
          key1: 'value1',
          key2: 'value2'
        }
      });
    });

  });

});