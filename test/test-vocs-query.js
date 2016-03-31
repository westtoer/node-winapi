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


describe('vocs-query build & fetch', function () {
    var query = wapi.query('vocabulary');
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

    it('should allow to filter for specific vocabulary-name', function (done) {
        var names = ['publicatiekanalen', 'product_types'],
            q = query.clone().asJSON_HAL().vocname(names).size(names.length);

        win.fetch(q, function (err, obj, meta) {
            assert.equal(meta.total, names.length, "resultset-size should match the requested vocnames");
            assert.equal(obj.length, names.length, "actual retrieved set-size should match the requested vocnames");

            var vocCodes = win.parseVocabularyCodes(obj), vocTrees = win.parseVocabularyTrees(obj);
            assert.isNotNull(vocCodes, 'parsed vocab codes should not be null');
            assert.isNotNull(vocTrees, 'parsed vocab trees should not be null');
            assert.equal(Object.keys(vocCodes).length, names.length, "number of vocabs don't match length of parsed code-lists");
            assert.equal(Object.keys(vocTrees).length, names.length, "number of vocabs don't match length of parsed trees");
            names.forEach(function (k) {
                var vocCode = vocCodes[k], vocTree = vocTrees[k];
                assert.ok(Array.isArray(vocCode), "voc for name " + k + " is not an array");
                if (['culturefeed_event_type', 'publicatiekanalen', 'product_types'].indexOf(k) === -1) {
                    assert.isNull(vocTree, "flat list should be no hierarchies for voc = " + k);
                } else {
                    assert.isAbove(vocCode.length, vocTree.length, "hierachies should have less top level nodes for voc = " + k);
                }
            });
            done();
        });
    });


    it('should allow bulk retrieval', function (done) {
        this.timeout(30000);
        var q = query.clone().asJSON_HAL();

        win.fetch(q.clone(), function (err, resp, meta) {
            var size = meta.total;
            if (win.verbose) {
                console.log("full bulk size = %d", size);
            }
            assert.isNull(err, "error retrieving vocabularies size for bulk test " + err);
            assert.isAbove(size, 0, "zero-length of vocs in bulk");
            win.fetch(q.clone().asJSON().bulk(), function (er2, bulk) {
                assert.isNull(er2, "error retrieving vocabularies in bulk " + er2);
                assert.isAbove(bulk.length, 0, "zero-length of vocs in bulk");
                assert.equal(bulk.length, size, "real number does not match response");
                done();
            });
        });
    });

    function dumpTree(pfx, t) {
        if (t === null || t === undefined) {
            console.log("%s -- done", pfx);
            return;
        }
        t.forEach(function (c) {
            console.log("%s- %s", pfx, c.code);
            dumpTree(pfx + "    ", c.children);
        });
    }

    it('should support parsing vocabularies', function (done) {
        var q = query.clone().asJSON().bulk();
        win.fetch(q, function (err, bulk) {
            var vocCodes = win.parseVocabularyCodes(bulk), vocTrees = win.parseVocabularyTrees(bulk);
            //dumpTree("", vocTrees.publicatiekanalen);
            assert.isNotNull(vocCodes, 'parsed vocab codes should not be null');
            assert.isNotNull(vocTrees, 'parsed vocab trees should not be null');
            assert.equal(Object.keys(vocCodes).length, bulk.length, "number of vocabs don't match length of parsed code-lists");
            assert.equal(Object.keys(vocTrees).length, bulk.length, "number of vocabs don't match length of parsed trees");
            Object.keys(vocCodes).forEach(function (k) {
                var vocCode = vocCodes[k], vocTree = vocTrees[k];
                assert.ok(Array.isArray(vocCode), "voc for name " + k + " is not an array");
                if (['publicatiekanalen', 'product_types'].indexOf(k) === -1) {
                    assert.isNull(vocTree, "flat list should be no hierarchies for voc = " + k);
                } else {
                    assert.isNotNull(vocTree, "hierarchy should exist for voc = " + k);
                    assert.isAbove(vocCode.length, vocTree.length, "hierachies should have less top level nodes for voc = " + k);
                }
            });
            done();
        });
    });

    it('should support parsing selected vocabularies', function (done) {
        var q = query.clone().asJSON().bulk(), names = ['publicatiekanalen', 'product_types'];
        win.fetch(q, function (err, bulk) {
            var vocCodes = win.parseVocabularyCodes(bulk, names), vocTrees = win.parseVocabularyTrees(bulk, names);
            //dumpTree("", vocTrees.publicatiekanalen);
            //dumpTree("", vocTrees.product_types);
            //console.log(vocCodes.product_types.sort());
            assert.isNotNull(vocCodes, 'parsed vocab codes should not be null');
            assert.isNotNull(vocTrees, 'parsed vocab trees should not be null');
            assert.equal(Object.keys(vocCodes).length, names.length, "number of vocabs don't match length of parsed code-lists");
            assert.equal(Object.keys(vocTrees).length, names.length, "number of vocabs don't match length of parsed trees");
            names.forEach(function (k) {
                var vocCode = vocCodes[k], vocTree = vocTrees[k];
                assert.ok(Array.isArray(vocCode), "voc for name " + k + " is not an array");
                if (['publicatiekanalen', 'product_types'].indexOf(k) === -1) {
                    assert.isNull(vocTree, "flat list should be no hierarchies for voc = " + k);
                } else {
                    assert.isNotNull(vocTree, "hierarchy should exist for voc = " + k);
                    assert.isAbove(vocCode.length, vocTree.length, "hierachies should have less top level nodes for voc = " + k);
                }
            });
            done();
        });
    });

    it('should allow content streaming', function (done) {
        var q = query.clone().size(10).asJSON(),
            sink = fs.createWriteStream(path.join("tmp", "vocs-1-10.json"));

        win.stream(q.clone(), sink, function (err, res) {
            res
                .on('end', done)
                .on('error', function (e) {
                    assert.ok(false, 'error while streaming response: ' + e);
                });
        });
    });
});
