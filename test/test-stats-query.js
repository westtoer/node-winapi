/*jslint node: true */
/*jslint nomen: true */
/*global describe, it, before, after */

"use strict";

var chai = require('chai'),
    assert = chai.assert,
    expect = chai.expect,
    path = require('path'),
    fs = require('fs'),
    moment = require('moment'),

    settings = require('./client-settings.json'),
    wapi = require('../lib/winapi'),
    win = wapi.client(settings);


describe('stats-query build & fetch', function () {
    var query = wapi.query('statistics');

    before(function (done) {
        this.timeout(5000);
        win.start(function () {
            assert.isNotNull(win.token, "no auth token received in test-before");
            done();
        });
    });

    after(function () {
        win.stop();
    });

    it('should allow to retrieve last 5 years of data');

    it('should allow bulk retrieval', function (done) {
        this.timeout(30000);
        var q = query.clone().asJSON_HAL();

        win.fetch(q.clone(), function (err, resp, meta) {
            var size = meta.total;
            if (win.verbose) {
                console.log("full bulk size = %d", size);
            }
            assert.isNull(err, "error retrieving stats size for bulk test " + err);
            assert.isAbove(size, 0, "zero-length of stats in bulk");
            win.fetch(q.clone().asJSON().bulk(), function (er2, bulk) {
                assert.isNull(er2, "error retrieving stats in bulk " + er2);
                assert.isAbove(bulk.length, 0, "zero-length of stats in bulk");
                assert.equal(bulk.length, size, "real number does not match response");
                done();
            });
        });
    });


    it('should allow content streaming', function (done) {
        var q = query.clone().size(10).asXML(),
            sink = fs.createWriteStream(path.join("tmp", "stats-1-10.xml"));

        win.stream(q.clone(), sink, function (res) {
            res
                .on('end', done)
                .on('error', function (e) {
                    assert.ok(false, 'error while streaming response: ' + e);
                });
        });
    });
});
