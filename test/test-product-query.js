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
    TOURTYPES = ["aanlegplaats", "adventure", "attractiepark", "battle_field_tour", "begraafplaats_amerikaans", "begraafplaats_belgisch",
                 "begraafplaats_commonwealth", "begraafplaats_duits", "begraafplaats_frans", "belfort", "bezoekerscentrum", "bioscoop",
                 "bistro", "bootverhuur", "bos", "brouwerij", "cafe", "camping", "casino", "concert", "cultureel_centrum", "domein",
                 "festival", "fietsen", "fietsverhuur", "film", "frontvlucht", "gastenkamer", "golf", "herdenkingsplechtigheid",
                 "historisch_gebouw", "hoeve_om_te_proeven", "hotel", "huifkartocht", "ijspiste", "jachthaven", "jeugdverblijf",
                 "kampeerautoterrein", "kampeerhut", "kano_kajak_verhuur", "kinderboerderij", "manege", "minicamping", "monument",
                 "museum", "onbepaald", "oorlogssite", "park_tuin", "pretpark", "religieus_gebouw", "restaurant",
                 "scooter_solex_verhuur", "shopping", "shop_winkel", "speciale_markt", "speeltuin", "sportaccommodatie",
                 "sportwedstrijd", "stoet", "stokerij", "strandclub", "tearoom", "tentoonstelling", "theater", "toeristische_dienst",
                 "vakantiecentrum", "vakantielogies", "vakantiepark", "vakantiewoning", "verblijfpark", "vuurwerk", "wandelen",
                 "waterrecreatie", "wekelijkse_markt", "wellness", "wijngaard", "zaal", "zwemgelegenheid"],

    settings = require('./client-settings.json'),
    wapi = require('../lib/winapi'),
    win = wapi.client(settings);


//helper
function check(topic, jsonify, extra) {
    jsonify = jsonify || false;
    return function (e, o, m) {
        assert.isNull(e, "unexpected error for topic " + topic + ": " + e);
        if (e) {
            return;
        } // else

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
        this.timeout(5000);
        win.start(function () {
            assert.isNotNull(win.token, "no auth token received in test-before");
            done();
        });
    });

    it('should allow default query in all variants', function (done) {
        var q = wapi.query('product').size(1), c = 0;

        function end(resp, meta) {
            c += 1;
            if (c !== 3) {
                return;
            }
            done();
        }

        win.fetch(q, check("xml_1", false, end));
        win.fetch(q.clone().asJSON(), check("json_1", true, end));
        win.fetch(q.clone().asJSON_HAL(), check("json_hal_1", true, end));
    });

    it('should allow to retrieve all types available', function (done) {
        this.timeout(5000);
        var c = 0, typeHisto = {}, types = PRODUCTS.slice(0), q = wapi.query('product').asJSON_HAL().size(1);

        //make 2 random groupings and add them to the test
        types.reduce(function (g, t) { g[Math.round(Math.random())].push(t); return g; }, [[], []])
            .forEach(function (grp) { if (grp.length > 1) { types.push(grp); } });

        types.forEach(function (t) {
            win.fetch(q.clone().forTypes(t), check("type_json_" + t, true, function (resp, meta) {
                typeHisto[t] = meta.pages;
                c += 1;
                //console.log("types reply for %s -- %d/%d", t, c, types.length);
                if (c !== types.length) {
                    return;
                } // else
                if (win.verbose) {
                    console.log('\n--\nHistogram of available types == %j\n--', typeHisto);
                }
                Object.keys(typeHisto).forEach(function (k) {
                    var parts = k.split(','), sum = typeHisto[k], checkSum = 0;
                    parts.forEach(function (p) { checkSum += typeHisto[p]; });
                    assert.ok(sum === checkSum, "failed histo checksum on key (" + k + " sum: " + sum + "!= checksum: " + checkSum);
                });
                done();
            }));
        });
    });

    it('should allow filtering on lastmodified over last week', function (done) {
        this.timeout(5000);
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

                if (win.verbose) {
                    console.log('Histogram of last week updates == %j', updateHistos);
                    console.log("checking total sum = %d ?== %d : %s", sum, checkSum, sum === checkSum);
                }
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
                if (win.verbose) {
                    console.log("check if before (%d) + after (%d) == all(%d) : %s", allSum.before, allSum.after, allSum.all,
                                (allSum.before + allSum.after === allSum.all));
                }
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
                if (win.verbose) {
                    console.log("check if removed (%d) + active (%d) == all(%d) : %s", allSum.del, allSum.xst, allSum.all,
                                (allSum.del + allSum.xst === allSum.all));
                }
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
                if (win.verbose) {
                    console.log("dump combo results %j", allSum);
                }
                done();
            };
        }
        rmOptions.forEach(function (del) {
            win.fetch(q.clone()[del]().lastmodBetween(cut, null), check(del + "_after", true, allCheck(del + "_after")));
            win.fetch(q.clone()[del]().lastmodBetween(null, cut), check(del + "_befor", true, allCheck(del + "_befor")));
        });
    });


    it('should allow channel filtering', function (done) {
        this.timeout(5000);
        var channelsHisto = {}, q = wapi.query('product').asJSON_HAL().forTypes(PRODUCTS).size(1);

        CHANNELS.forEach(function (c) {
            win.fetch(q.clone().forChannels(c), check("channel_json_" + c, true, function (resp, meta) {
                channelsHisto[c] = meta.pages;
                if (Object.keys(channelsHisto).length !== CHANNELS.length) {
                    return;
                } //else
                if (win.verbose) {
                    console.log('Histogram for the known channels == %j', channelsHisto);
                }
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
                if (win.verbose) {
                    console.log("check if published (%d) + hidden (%d) == all(%d) : %s", allSum.pub, allSum.hid, allSum.all,
                                (allSum.pub + allSum.hid === allSum.all));
                }
                done();
            };
        }
        win.fetch(q.clone().published(), check("pub_json_pub", true, allCheck("pub")));
        win.fetch(q.clone().hidden(), check("pub_json_hid", true, allCheck("hid")));
        win.fetch(q.clone().ignorePublished(), check("pub_json_all", true, allCheck("all")));
    });

    it('should allow touristic-type filtering', function (done) {
        this.timeout(5000);
        var c = 0, typeHisto = {}, types = TOURTYPES.slice(0), q = wapi.query('product').asJSON_HAL().size(1).forTypes(PRODUCTS);

        //make 2 random groupings and add them to the test
        types.reduce(function (g, t) { g[Math.round(Math.random())].push(t); return g; }, [[], []])
            .forEach(function (grp) { if (grp.length > 1) { types.push(grp); } });

        types.forEach(function (t) {
            win.fetch(q.clone().forTouristicTypes(t), check("tourtype_json_" + t, true, function (resp, meta) {
                typeHisto[t] = meta.pages;
                c += 1;
                console.log("t-types reply for %s -- %d/%d -- %d", t, c, types.length, meta.pages);
                if (c !== types.length) {
                    return;
                } // else
                if (win.verbose) {
                    console.log('Histogram of available tour-types == %j', typeHisto);
                }
                Object.keys(typeHisto).forEach(function (k) {
                    var parts = k.split(','), sum = typeHisto[k], checkSum = 0;
                    parts.forEach(function (p) { checkSum += typeHisto[p]; });
                    assert.ok(sum === checkSum, "failed histo checksum on key (" + k + " sum: " + sum + "!= checksum: " + checkSum);
                });
                done();
            }));
        });
    });

    it('should allow bulk retrieval', function (done) {
        this.timeout(100000);
        var q = wapi.query('product').asJSON_HAL().size(1).forTypes(PRODUCTS);

        win.fetch(q.clone(), check("prebulk_json_probesize", true, function (resp, meta) {
            var size = meta.total;
            if (win.verbose) {
                console.log("full bulk size = %d", size);
            }
            assert.isAbove(size, 6000, "too little products in result to meaningfully check the reported 6k limit");
            // this is loading a lot --> might be wise to just stream the json (not hal) variant
            // & then apply tests by reading json through streaming api?
            win.fetch(q.clone().bulk(), check("bulk_json_fulldump", true, function (resp2, meta2) {
                if (win.verbose) {
                    console.log("size = %d, meta2.total = %d, meta2.pages = %d, resp.length = %d", size, meta2.total, meta2.pages, resp.length);
                }
                assert.equal(meta2.total, size, "not same total number of entities");
                assert.equal(meta2.pages, 1, "bulk should return all in one dump");
                assert.equal(resp.length, size, "real number does not match response");
                done();
            }));
        }));
    });


    it('should allow content streaming', function (done) {
        var q = wapi.query().size(1).asJSON(),
            sink = fs.createWriteStream(path.join("tmp", "test.json"));

        win.stream(q.clone(), sink, function (res) {
            res
                .on('end', done)
                .on('error', function (e) {
                    assert.ok(false, 'error while streaming response: ' + e);
                });
        });
    });
});
