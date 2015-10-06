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


describe('claims-query build & fetch', function () {
    var query = wapi.query('claim').requireFields(["claims.claim.owner.email_address", "metadata.partner_id"]);

    before(function (done) {
        this.timeout(5000);
        win.start(function () {
            assert.isNotNull(win.token, "no auth token received in test-before");
            assert.equal(query.requiredFields.length, 2);
            assert.equal(query.clone().requiredFields.length, 2);
            done();
        });
    });

    after(function () {
        win.stop();
    });

    it('should allow to filter for product-partner-id and owner-email', function (done) {
        this.timeout(5000);
        var q = query.clone().asJSON_HAL().partner(3495).owner('marc\\.portier.*');
        assert.equal(q.requiredFields.length, 2);

        win.fetch(q.clone(), function (err, list, meta) {
            assert.isNull(err, "unexpected error: " + err);
            assert.isAbove(meta.total, 0, "there should be at least one claim found");
            assert.isAbove(list.length, 0, "there should be at least one claim retrieved");
            done();
        });
    });

    it('should allow bulk retrieval', function (done) {
        this.timeout(30000);
        var q = query.clone().asJSON_HAL();
        assert.equal(q.requiredFields.length, 2);

        win.fetch(q.clone(), function (err, resp, meta) {
            var size = meta.total;
            if (win.verbose) {
                console.log("full bulk size = %d", size);
            }
            assert.isNull(err, "error retrieving claims size for bulk test " + err);
            assert.isAbove(size, 0, "zero-length of claims in bulk");
            win.fetch(q.clone().asJSON().bulk(), function (er2, bulk) {
                assert.isNull(er2, "error retrieving claims in bulk " + er2);
                assert.isAbove(bulk.length, 0, "zero-length of claims in bulk");
                assert.equal(bulk.length, size, "real number does not match response");
                done();
            });
        });
    });


    it('should allow content streaming', function (done) {
        var q = query.clone().size(10).asXML(),
            sink = fs.createWriteStream(path.join("tmp", "claims-1-10.xml"));
        assert.equal(q.requiredFields.length, 2);

        win.stream(q.clone(), sink, function (res) {
            res
                .on('end', done)
                .on('error', function (e) {
                    assert.ok(false, 'error while streaming response: ' + e);
                });
        });
    });
});
