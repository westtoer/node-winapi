/*jslint node: true */
/*jslint nomen: true */
/*global describe*/
/*global it*/

"use strict";

var chai = require('chai'),
    assert = chai.assert,
    expect = chai.expect,
    path = require('path'),
    settings = require('./client-settings.json'),
    wapi = require('../lib/winapi');


describe('authentication testing', function () {
    it('should have a valid token after start', function (done) {
        var win = wapi.client(settings);
        assert.isNull(win.token, "token should be undefined before start.");
        win.start(function () {
            assert.isDefined(win.token, "token should not be undefined after start.");
            assert.isNotNull(win.token, "token should not be null after start.");
            assert.typeOf(win.token, "string", "token should be valid string after start.");
            assert(win.token.length > 0, "token should be not zero-length string after start.");
            done();
        });
    });

    it('should be able to operate two clients in parallel', function (done) {
        var win = wapi.client(settings),
            win2 = wapi.client(settings),
            q = wapi.query('product').size(1).asJSON_HAL();

        assert.isNull(win.token, "token should be undefined before start.");
        assert.isNull(win2.token, "token2 should be undefined before start.");

        win.start(function () {
            assert.isNotNull(win.token, "token should not be null after start.");
            assert(win.token.length > 0, "token should be not zero-length string after start.");
            win2.start(function () {
                assert.isNotNull(win2.token, "token2 should not be null after start.");
                assert(win2.token.length > 0, "token2 should be not zero-length string after start.");
                assert(win.token !== win2.token, "independent clients should have different tokens");
                win.fetch(q.clone(), function (e, o, m) {
                    assert.isNull(e, "there should be no error in nested fetch");
                    assert.equal(o.length, 1, "data retrieval should work");
                    win2.fetch(q.clone(), function (e2, o2, m2) {
                        assert.isNull(e2, "there should be no error in nested fetch");
                        assert.equal(o2.length, 1, "nested data retrieval should work");
                        win.stop();
                        win2.stop();
                        done();
                    });
                });
            });
        });
    });

});
