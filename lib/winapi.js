/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    http = require('http'),
    moment = require('moment');


function asArray(a) {
    if (Array.isArray(a)) {
        return a;
    } else if (a === null || a === undefined) {
        return [];
    } else {
        return [a];
    }
}

function ProductQuery() {
    this.format = 'xml';
    this.types = ['accommodation']; //default zou alle types moeten kunnen bevatten
    this.sizeVal = 10;
    this.pageNum = 0;
    this.channels = [];
}
// paging
ProductQuery.prototype.page = function (page) {
    this.pageNum = Number(page) || 0;
    return this;
};
ProductQuery.prototype.size = function (size) {
    this.sizeVal = Number(size) || 10;
    return this;
};

// qrybuilder formats
ProductQuery.prototype.asJSON_HAL = function () {
    this.format = 'json+hal';
    return this;
};
ProductQuery.prototype.asJSON = function () {
    this.format = 'json';
    return this;
};
ProductQuery.prototype.asXML = function () {
    this.format = 'xml';
    return this;
};
//qrybuilder type filter
ProductQuery.prototype.forTypes = function (newtypes) {
    this.types = asArray(newtypes);
    return this;
};
ProductQuery.prototype.andType = function (singletype) {
    return this.types.push(singletype);
};
ProductQuery.prototype.ACCOMMODATION      = "accommodation";
ProductQuery.prototype.PERMANENT_OFFERING = "permanent_offering";
ProductQuery.prototype.RECA               = "reca";
ProductQuery.prototype.TEMPORARY_OFFERING = "temporary_offering";
ProductQuery.prototype.MEETINGROOM        = "meetingroom";

//qrybuilder lastmod filter
ProductQuery.prototype.lastmod = function (expr) {
    this.lastmodExpr = expr;
    return this;
};
function dateFormat(s) {
    if (s === undefined || s === null) {
        return "*";
    }
    return moment(s).format('YYYY-MM-DD');
}
ProductQuery.prototype.lastmodBetween = function (from, to) {
    from = dateFormat(from);
    to = dateFormat(to);
    return this.lastmod("[" + from + " TO " + to + "}"); // start boundary is inclusive, end-boundary is exclusive
};

//qrybuilder delete filter
ProductQuery.prototype.removed = function () {
    this.softDelState = true;
    return this;
};
ProductQuery.prototype.active = function () {
    this.softDelState = false;
    return this;
};
ProductQuery.prototype.ignoreRemoved = function () {
    this.softDelState = undefined;
    return this;
};

//qrybuilder pubchannel filter
ProductQuery.prototype.forChannels = function (chs) {
    this.channels = asArray(chs);
    return this;
};
ProductQuery.prototype.andChannel = function (ch) {
    return this.channels.push(ch);
};
ProductQuery.prototype.WESTTOER   = "westtoer*";
ProductQuery.prototype.BOL        = "brugse_ommeland*";
ProductQuery.prototype.WH         = "westhoek*";
ProductQuery.prototype.DEKUST     = "de_kust*";
ProductQuery.prototype.LEIESTREEK = "leiestreek*";

//qrybuilder published filter
ProductQuery.prototype.published = function () {
    this.pubState = true;
    return this;
};
ProductQuery.prototype.hidden = function () {
    this.pubState = false;
    return this;
};
ProductQuery.prototype.ignorePublished = function () {
    this.pubState = undefined;
    return this;
};

ProductQuery.prototype.getURI = function (client) {
    if (this.types === undefined || this.types === null || this.types.length === 0) {
        throw "no types specified for fetch";
    }
    if (client.token === null || client.token_expires < Date.now()) {
        throw "client has no active token";
    }

    var uri = client.baseURI + this.types.join(',') +
        "/?format=" + this.format +
        "&access_token=" + encodeURIComponent(client.token) +
        "&size=" + this.sizeVal +
        "&page=" + this.pageNum,
        q = [];

    if (this.lastmodExpr !== undefined) {
        q.push("+metadata.tdms__update_date:" + this.lastmodExpr);
    }

    if (this.softDelState !== undefined) {
        q.push("+metadata.tdms__deleted:" + this.softDelState);
    }

    if (this.pubState !== undefined) {
        q.push("+publishing_channels.tdms__published:" + this.pubState);
    }

    if (this.channels !== undefined && this.channels.length > 0) {
        if (this.channels === 1) {
            q.push("+publishing_channels.tdms__publishing_channel.@code:" + this.channels[0]);
        } else {
            q.push("+publishing_channels.tdms__publishing_channel.@code:(" + this.channels.join(' OR ') + ")");
        }
    }

    if (q.length > 0) {
        uri += "&q=" + encodeURIComponent(q.join(' '));
    }

    return uri;
};

function Client(settings) {
    this.verbose  = !!settings.verbose; // false if not set

//    this.server   = settings.server   || "win-api-acc.westtoer.be";
    this.server   = settings.server   || "api.westtoer.tdms.acc.saga.be";
    this.version  = settings.version  || "v1";
    this.clientid = settings.clientid || "westtoer";
    this.secret   = settings.secret   || "no-secret";

    this.baseURI = "http://" + this.server + "/api/" + this.version + "/";
    this.authURI = "http://" + this.server + "/oauth/v2/token?grant_type=client_credentials&client_id=" +
        encodeURIComponent(this.clientid) + "&client_secret=" + encodeURIComponent(this.secret);

    // we initialize in a stopped modus
    this.stop();
}

function getJSON(uri, cb, verbose) {
    verbose = verbose || false;
    if (verbose) {
        console.log("call uri [%s]", uri);
    }
    http.get(uri, function (res) {
        var body = "";

        res.on('data', function (chunk) {
            body += chunk;
        }).on('end', function () {
            cb(null, JSON.parse(body));
        });
    }).on('error', function (e) {
        cb(e);
    });
}

function getXML(uri, cb, verbose) {
    verbose = verbose || false;
    if (verbose) {
        console.log("call uri [%s]", uri);
    }
    http.get(uri, function (res) {
        var body = "";

        res.on('data', function (chunk) {
            body += chunk;
        }).on('end', function () {
            //TODO parse to XML ?
            cb(null, body);
        });
    }).on('error', function (e) {
        cb(e);
    });
}

Client.prototype.stop = function () {
    clearTimeout(this.token_refresh);
    this.token = null;
    this.token_expires = Date.now();
    this.token_refresh = null;
};

Client.prototype.start = function (cb) {
    var me = this, SLACK_MILLIS = 1000;

    if (me.token_refresh !== null) { // already started...
        if (cb) {
            return cb(null); // no errors, but no token object either
        }
        return;
    }

    // else
    getJSON(this.authURI, function (e, resp) {
        if (e) {
            console.error("ERROR: " + e.message);
            return cb(e);
        }

        me.token = resp.access_token;
        me.token_expires = Date.now() + resp.expires_in;
        if (resp.expires_in > SLACK_MILLIS) { // we assume at least 1s slack to operate
            me.token_refresh = setTimeout(function () {
                me.start();
            }, resp.expires_in - SLACK_MILLIS);
        }
        if (me.verbose) {
            console.log("got token %s - valid till %d", me.token, me.token_expires);
        }

        if (cb) {
            cb(e, resp);
        }
    }, this.verbose);
};

Client.prototype.fetch = function (qry, cb) {
    if (arguments.length < 2) {
        cb = qry;
        qry = new ProductQuery();
    }

    if (qry.format === 'json') {
        getJSON(qry.getURI(this), function (e, resp) {
            cb(e, resp);
        }, this.verbose);
    } else if (qry.format === 'json+hal') {
        getJSON(qry.getURI(this), function (e, resp) {
            var meta = resp, CONTENT = "_embedded";
            resp = meta[CONTENT].items;
            delete meta[CONTENT].items;
            cb(e, resp, meta);
        }, this.verbose);
    } else if (qry.format === 'xml') {
        getXML(qry.getURI(this), function (e, resp) {
            cb(e, resp);
        }, this.verbose);
    }
};

module.exports.client = function (settings) {
    return new Client(settings);
};
module.exports.query = function (service) {
    service = service || 'product';
    if (service === 'product') {
        return new ProductQuery();
    }
    throw "unknown service request";
};
