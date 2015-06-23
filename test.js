/*jslint node: true */
/*jslint es5: true */
/*jslint nomen: true */

"use strict";

var wapi = require('./lib/winapi'),
    path = require('path'),
    argv = require('yargs'),
    async = require('async'),
    moment = require('moment'),
    settings,
    PRODUCTS = ['accommodation', 'permanent_offering', 'reca', 'temporary_offering', 'meetingroom'],
    CHANNELS = ["westtoer*", "brugse_ommeland*", "westhoek*", "de_kust*", "leiestreek*"];

settings = argv
    .usage('Test een aantal zaken uit.\nUsage: $0')
    .example('$0  ...', 'Voert de testjes uit.')

    .describe('secret', 'het secret.')
    .alias('s', 'secret')

    .describe('verbose', 'should there be a lot of logging output')
    .alias('v', 'verbose')
    .default('v', false)

    .demand(['secret'])

    .argv;

console.log(settings);
var win = wapi.client(settings);

//helper
function check(topic, jsonify, extra) {
    jsonify = jsonify || false;
    return function (e, o, m) {
        if (e) {
            console.error(e.message);
            throw "ERROR IN TEST FOR " + topic;
        }
        if (win.verbose) {
            console.log("RESPONSE FOR " + topic);
            if (jsonify) {
                console.log(JSON.stringify(o));
            } else {
                console.log(o);
            }
        }

        if (jsonify && o.length === 0) {
            console.error("RESPONSE FOR " + topic + " was empty.");
        }

        if (extra) {
            extra(o, m);
        }
    };
}


// TODO use real test-js framework with assertions
function doTests(e, auth) {
    // run
    check("auth Token")(null, win.token);

    // eerste accomodatie ophalen in xml en json
    (function () {
        win.fetch(wapi.query('product').size(1), check("XML_1", false));
        win.fetch(wapi.query('product').asJSON().size(1), check("json_1", true));
        win.fetch(wapi.query('product').asJSON_HAL().size(1), check("json_hal_1", true));
    }());

    //run many times json fetch to check the presence of pubchannels
    (function () {
        var seq = [], i, count = 10;
        function checkPubChannels(resp) {
            var dist, pcs = resp[0].publishing_channels.tdms__publishing_channel;
            seq.push(pcs ? pcs.length : 0);
            if (seq.length === count) {
                dist = seq.reduce(function (d, v) { if (v === 0) {d.bad += 1; } else {d.ok += 1; } return d; }, {bad: 0, ok: 0});
                console.log("distribution of bad/ok responses == %j | avg ok == %d ", dist, (dist.ok / seq.length));
            }
        }
        for (i = 0; i < count; i += 1) {
            win.fetch(wapi.query('product').asJSON().size(1), check("json_seq_" + i, true, checkPubChannels));
        }
    }());

    // check the different types we can retrieve
    (function () {
        var typeHisto = {}, types = PRODUCTS.slice(0);

        //make 2 random groupings and add them to the test
        types.reduce(function (g, t) { g[Math.round(Math.random())].push(t); return g; }, [[], []])
            .forEach(function (grp) { if (grp.length > 1) { types.push(grp); } });

        types.forEach(function (t) {
            win.fetch(wapi.query('product').asJSON_HAL().forTypes(t).size(1), check("type_json_" + t, true, function (resp, meta) {
                typeHisto[t] = meta.pages;
                if (Object.keys(typeHisto).length === types.length) {
                    console.log('Histogram of available types == %j', typeHisto);
                    Object.keys(typeHisto).forEach(function (k) {
                        var parts = k.split(','), sum = typeHisto[k], checkSum = 0;
                        parts.forEach(function (p) { checkSum += typeHisto[p]; });
                        console.log("checking key %s sum = %d ?== %d : %s", k, sum, checkSum, sum === checkSum);
                    });
                }
            }));
        });
    }());

    //check the lastmodified filtering
    (function () {
        var today = moment(), prev = today.clone().subtract(7, 'days'), curs = today.clone(), cut = today.clone().subtract(6, 'days'),
            updateHistos = [], i = 0, c = 0, sum = 0, checkSum = 0, allSum = {};

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
                if (c === 8) {
                    console.log('Histogram of last week updates == %j', updateHistos);
                    console.log("checking total sum = %d ?== %d : %s", sum, checkSum, sum === checkSum);
                }
            };
        }

        win.fetch(wapi.query('product').asJSON_HAL().lastmodBetween(prev, curs).size(1), check("lastmod_json_" + i, true, histoHandler(i, prev, curs)));
        while (prev.isBefore(today)) {
            i += 1;
            curs = prev.clone().add(1, 'days');
            win.fetch(wapi.query('product').asJSON_HAL().lastmodBetween(prev, curs).size(1), check("lastmod_json_" + i, true, histoHandler(i, prev, curs)));
            prev = curs;
        }

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length === 3) {
                    console.log("check if before (%d) + after (%d) == all(%d) : %s", allSum.before, allSum.after, allSum.all,
                                (allSum.before + allSum.after === allSum.all));
                }
            };
        }
        win.fetch(wapi.query('product').asJSON_HAL().lastmodBetween(null, cut).size(1), check("lastmod_json_before", true, allCheck("before")));
        win.fetch(wapi.query('product').asJSON_HAL().lastmodBetween(cut, null).size(1), check("lastmod_json_after", true, allCheck("after")));
        win.fetch(wapi.query('product').asJSON_HAL().size(1), check("lastmod_json_all", true, allCheck("all")));

    }());

    //check the deleted filtering
    (function () {
        var allSum = {};

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length === 3) {
                    console.log("check if removed (%d) + active (%d) == all(%d) : %s", allSum.del, allSum.xst, allSum.all,
                                (allSum.del + allSum.xst === allSum.all));
                }
            };
        }
        win.fetch(wapi.query('product').asJSON_HAL().removed().size(1), check("del_json_del", true, allCheck("del")));
        win.fetch(wapi.query('product').asJSON_HAL().active().size(1), check("del_json_xst", true, allCheck("xst")));
        win.fetch(wapi.query('product').asJSON_HAL().ignoreRemoved().size(1), check("del_json_all", true, allCheck("all")));

    }());

    //check the combo filtering.
    (function () {
        var allSum = {}, rmOptions = ['removed', 'active'], cut = moment().subtract(6, 'days');

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length === 4) {
                    console.log("dump combo results %j", allSum);
                }
            };
        }
        rmOptions.forEach(function (del) {
            win.fetch(wapi.query('product').asJSON_HAL()[del]().lastmodBetween(cut, null).size(1), check(del + "_after", true, allCheck(del + "_after")));
            win.fetch(wapi.query('product').asJSON_HAL()[del]().lastmodBetween(null, cut).size(1), check(del + "_befor", true, allCheck(del + "_befor")));
        });
    }());

    // check the different channels
    (function () {
        var channelsHisto = {};

        CHANNELS.forEach(function (c) {
            win.fetch(wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).forChannels(c).size(1), check("channel_json_" + c, true, function (resp, meta) {
                channelsHisto[c] = meta.pages;
                if (Object.keys(channelsHisto).length === CHANNELS.length) {
                    console.log('Histogram for the known channels == %j', channelsHisto);
                }
            }));
        });
    }());

    //check the published filtering
    (function () {
        var allSum = {};

        function allCheck(key) {
            return function (resp, meta) {
                allSum[key] = meta.pages;
                if (Object.keys(allSum).length === 3) {
                    console.log("check if published (%d) + hidden (%d) == all(%d) : %s", allSum.pub, allSum.hid, allSum.all,
                                (allSum.pub + allSum.hid === allSum.all));
                }
            };
        }
        win.fetch(wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).published().size(1), check("pub_json_pub", true, allCheck("pub")));
        win.fetch(wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).hidden().size(1), check("pub_json_hid", true, allCheck("hid")));
        win.fetch(wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).ignorePublished().size(1), check("pub_json_all", true, allCheck("all")));
    }());
}

win.start(doTests);
