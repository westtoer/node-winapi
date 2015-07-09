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
    wapi = require('../lib/winapi'),
    win = wapi.client(settings);


describe('authentication testing', function () {
    it('should have a valid token after start', function (done) {
        assert.isNull(win.token, "token should be undefined before start.");
        win.start(function () {
            assert.isDefined(win.token, "token should not be undefined after start.");
            assert.isNotNull(win.token, "token should not be null after start.");
            assert.typeOf(win.token, "string", "token should be valid string after start.");
            assert(win.token.length > 0, "token should be not zero-length string after start.");
            done();
        });
    });
});
