/*jslint node: true */
/*jslint nomen: true */
/*global describe*/
/*global it*/
/*global before*/

"use strict";

var chai = require('chai'),
    assert = chai.assert,
    expect = chai.expect,
    path = require('path'),
    fs = require('fs'),
    moment = require('moment'),

    PRODUCTS = ['accommodation', 'permanent_offering', 'reca', 'temporary_offering', 'meetingroom'],
    CHANNELS = ["westtoer*", "brugse_ommeland*", "westhoek*", "de_kust*", "leiestreek*", "fietsen_en_wandelen*",
                "kenniscentrum*", "dagtrips_voor_groepen*", "flanders_fields*", "meetingkust*", "autoroutes*",
                "itrip_coast*", "kustwandelroute*", "west-vlinderen*", "300_jaar_grens*"],

    settings = require('./client-settings.json'),
    wapi = require('../lib/winapi'),
    win = wapi.client(settings);


//helper
function check(topic, jsonify, extra) {
    jsonify = jsonify || false;
    return function (e, o, m) {
        assert.isNull(e, "unexpected error for topic " + topic + ": " + e);

        if (win.verbose) {
            console.log("RESPONSE FOR " + topic);
            if (jsonify) {
                console.log(JSON.stringify(o));
            } else {
                console.log(o);
            }
        }

        //assert.ok(!(jsonify && o.length === 0), "unexpected empty reply for topic " + topic);

        if (extra) {
            extra(o, m);
        }
    };
}

describe('product-query-testing', function () {
    before(function (done) {
        win.start(function () {
            assert.isNotNull(win.token, "no auth token received in test-before");
            done();
        });
    });

    it('should allow default query in all variants', function (done) {
        var tc = 3, q = wapi.query('product').size(1);
        function end() { tc -= 1; if (tc === 0) { done(); } }

        win.fetch(q, check("xml_1", false, end));
        win.fetch(q.clone().asJSON(), check("json_1", true, end));
        win.fetch(q.clone().asJSON_HAL(), check("json_hal_1", true, end));
    });

    it('should allow to retrieve all types available', function (done) {
        var tc = 0, typeHisto = {}, types = PRODUCTS.slice(0), q = wapi.query('product').asJSON_HAL().size(1);
        function end() {
            tc -= 1;
            if (tc !== 0) {
                return;
            } // else
            console.log('Histogram of available types == %j', typeHisto);
            Object.keys(typeHisto).forEach(function (k) {
                var parts = k.split(','), sum = typeHisto[k], checkSum = 0;
                parts.forEach(function (p) { checkSum += typeHisto[p]; });
                assert.ok(sum === checkSum, "failed histo checksum on key (" + k + " sum: " + sum + "!= checksum: " + checkSum);
            });
            done();
        }

        //make 2 random groupings and add them to the test
        types.reduce(function (g, t) { g[Math.round(Math.random())].push(t); return g; }, [[], []])
            .forEach(function (grp) { if (grp.length > 1) { types.push(grp); } });

        tc = types.length;
        types.forEach(function (t) {
            win.fetch(q.clone().forTypes(t), check("type_json_" + t, true, function (resp, meta) {
                typeHisto[t] = meta.pages;
                end();
            }));
        });
    });

    it('should allow filtering on lastmodified over last week', function (done) {
        var today = moment(), prev = today.clone().subtract(7, 'days'), curs = today.clone(), cut = today.clone().subtract(6, 'days'),
            updateHistos = [], i = 0, c = 0, sum = 0, checkSum = 0, allSum = {},
            q = wapi.query('product').asJSON_HAL().size(1);

        function histoHandler(j, fr, to) {
            var key = [fr.format('YYYYMMDD'), to.format('YYYYMMDD')].join(' TO ');
            return function (resp, meta) {
                if (j === 0) {
                    sum = meta.pages;
                } else {
                    checkSum += meta.pages;
                }

                updateHistos[j] = {key: key, count: meta.pages};
                c += 1;
                if (c !== 8) {
                    return;
                } // else

                console.log('Histogram of last week updates == %j', updateHistos);
                console.log("checking total sum = %d ?== %d : %s", sum, checkSum, sum === checkSum);
                done();
            };
        }

        win.fetch(q.clone().lastmodBetween(prev, curs), check("lastmod_json_" + i, true, histoHandler(i, prev, curs)));
        while (prev.isBefore(today)) {
            i += 1;
            curs = prev.clone().add(1, 'days');
            win.fetch(q.clone().lastmodBetween(prev, curs), check("lastmod_json_" + i, true, histoHandler(i, prev, curs)));
            prev = curs;
        }
    });

    it('should allow filtering on lastmodified split over some date', function (done) {
        var cut = moment().subtract(6, 'days'), allSum = {},
            q = wapi.query('product').asJSON_HAL().size(1);

        // cut = moment("2015-07-02");
        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length !== 3) {
                    return;
                } // else
                console.log("check if before (%d) + after (%d) == all(%d) : %s", allSum.before, allSum.after, allSum.all,
                            (allSum.before + allSum.after === allSum.all));
                done();
            };
        }
        win.fetch(q.clone().lastmodBetween(null, cut), check("lastmod_json_before", true, allCheck("before")));
        win.fetch(q.clone().lastmodBetween(cut, null), check("lastmod_json_after", true, allCheck("after")));
        win.fetch(q, check("lastmod_json_all", true, allCheck("all")));
    });


    it('should allow filtering on deleted flag', function (done) {
        var allSum = {}, q = wapi.query('product').asJSON_HAL().size(1);

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length !== 3) {
                    return;
                } //else
                console.log("check if removed (%d) + active (%d) == all(%d) : %s", allSum.del, allSum.xst, allSum.all,
                            (allSum.del + allSum.xst === allSum.all));
                done();
            };
        }
        win.fetch(q.clone().removed(), check("del_json_del", true, allCheck("del")));
        win.fetch(q.clone().active(), check("del_json_xst", true, allCheck("xst")));
        win.fetch(q.clone().ignoreRemoved(), check("del_json_all", true, allCheck("all")));
    });


    it('should allow combined deleted-lastmod filtering', function (done) {
        var allSum = {}, rmOptions = ['removed', 'active'], cut = moment().subtract(6, 'days'),
            q = wapi.query('product').asJSON_HAL().size(1);

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length !== 4) {
                    return;
                } //else
                console.log("dump combo results %j", allSum);
                done();
            };
        }
        rmOptions.forEach(function (del) {
            win.fetch(q.clone()[del]().lastmodBetween(cut, null), check(del + "_after", true, allCheck(del + "_after")));
            win.fetch(q.clone()[del]().lastmodBetween(null, cut), check(del + "_befor", true, allCheck(del + "_befor")));
        });
    });


    it('should allow channel filtering', function (done) {
        var channelsHisto = {}, q = wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).size(1);

        CHANNELS.forEach(function (c) {
            win.fetch(q.clone().forChannels(c), check("channel_json_" + c, true, function (resp, meta) {
                channelsHisto[c] = meta.pages;
                if (Object.keys(channelsHisto).length !== CHANNELS.length) {
                    return;
                } //else
                console.log('Histogram for the known channels == %j', channelsHisto);
                done();
            }));
        });
    });


    it('should allow published filtering', function (done) {
        var allSum = {}, q = wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).size(1);

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length !== 3) {
                    return;
                } //else
                console.log("check if published (%d) + hidden (%d) == all(%d) : %s", allSum.pub, allSum.hid, allSum.all,
                            (allSum.pub + allSum.hid === allSum.all));
                done();
            };
        }
        win.fetch(q.clone().published(), check("pub_json_pub", true, allCheck("pub")));
        win.fetch(q.clone().hidden(), check("pub_json_hid", true, allCheck("hid")));
        win.fetch(q.clone().ignorePublished(), check("pub_json_all", true, allCheck("all")));
    });

    it('should allow touristic-type filtering', function (done) {
        assert.ok(false, "TODO touristic-filter-test");
    });


    it('should allow content streaming', function (done) {
        var q = wapi.query().size(1).asJSON(),
            sink = fs.createWriteStream(path.join("tmp", "test.json"));

        win.fetch(q.clone(), function (e, d) {
            if (e) {
                assert.ok(false, "error while fetching : " + e);
            } else {
                console.log(d);
            }
        });
        win.stream(q.clone(), sink, function (res) { res.on('end', done); });
    });
});
