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
Client.DEFAULT_PAGE = 1;
Client.DEFAULT_SIZE = 10;

function ProductQuery(tpl) {
    // clone - constructor
    if (tpl !== undefined && tpl.constructor === ProductQuery) {
        this.format = tpl.format;
        this.types = tpl.types.slice(0);
        this.touristictypes = tpl.touristictypes.slice(0);
        this.sizeVal = tpl.sizeVal;
        this.pageNum = tpl.pageNum;
        this.channels = tpl.channels.slice(0);
        this.lastmodExpr = tpl.lastmodExpr;
        this.softDelState = tpl.softDelState;
        this.pubState = tpl.pubState;

    } else {
        this.format = 'xml';
        this.types = ['accommodation']; //default zou alle types moeten kunnen bevatten
        this.touristictypes = [];
        this.sizeVal = Client.DEFAULT_SIZE;
        this.pageNum = Client.DEFAULT_PAGE;
        this.channels = [];
    }
}
ProductQuery.prototype.clone = function () {
    return new ProductQuery(this);
};
// paging
ProductQuery.prototype.page = function (page) {
    this.pageNum = Number(page) || Client.DEFAULT_PAGE;
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

//qrybuilder trouristic_type filter
ProductQuery.prototype.forTouristicTypes = function (newtypes) {
    this.touristictypes = asArray(newtypes);
    return this;
};
ProductQuery.prototype.andTouristicType = function (singletype) {
    return this.touristictypes.push(singletype);
};

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

ProductQuery.addURI = function (key, value, unsetVal) {
    if (value === unsetVal) {
        return "";
    } // else
    return "&" + key + "=" + encodeURIComponent(value);
};

ProductQuery.addQueryVal = function (set, key, value) {
    if (value === undefined) {
        return;
    } // else
    return set.push("+" + key + ":" + value);
};

ProductQuery.addQueryList = function (set, key, valList) {
    if (valList === undefined || valList.length === 0) {
        return;
    } // else

    if (valList.length === 1) {
        set.push("+" + key + ":" + valList[0]);
    } else {
        set.push("+" + key + ":(" + this.channels.join(' OR ') + ")");
    }
};

ProductQuery.prototype.getURI = function (client) {
    if (this.types === undefined || this.types === null || this.types.length === 0) {
        throw "no types specified for fetch";
    }
    if (client.token === null || client.token_expires < Date.now()) {
        throw "client has no active token";
    }

    var uri = client.baseURI + this.types.join(',') +
        "?format=" + this.format +
        "&access_token=" + encodeURIComponent(client.token),
        q = [];

    uri += ProductQuery.addURI("size", this.sizeVal, Client.DEFAULT_SIZE);
    uri += ProductQuery.addURI("page", this.pageNum, Client.DEFAULT_PAGE);

    ProductQuery.addQueryVal(q, "metadata.tdms__update_date", this.lastmodExpr);
    ProductQuery.addQueryVal(q, "metadata.tdms__deleted", this.softDelState);
    ProductQuery.addQueryVal(q, "publishing_channels.tdms__published", this.pubState);

    ProductQuery.addQueryList(q, "publishing_channels.tdms__publishing_channel.@code", this.channels);
    ProductQuery.addQueryList(q, "metadata.touristic_product_type", this.touristictypes);

    if (q.length > 0) {
        uri += "&q=" + encodeURIComponent(q.join(' '));
    }

    return uri;
};


function getResponse(uri, cb, verbose) {
    verbose = verbose || false;
    if (verbose) {
        console.log("call uri [%s]", uri);
    }

    http.get(uri, function (res) {
        cb(null, res);
    }).on('error', function (e) {
        cb(e);
    });
}

function streamData(uri, sink, verbose) {
    getResponse(uri, function (e, res) {
        if (e) {
            sink.emit('error', e);
        } //else
        if (res.statusCode !== 200) {
            sink.emit('error', "error reading uri [" + uri + "] to stream - response.status == " + res.statusCode);
        } // else
        res.pipe(sink);
    }, verbose);
}

function getData(uri, cb, verbose) {
    getResponse(uri, function (e, res) {
        var data = "";
        if (e) {
            return cb(e);
        } //else
        res.on('data', function (chunk) {
            data += chunk;
        }).on('end', function () {
            cb(null, data);
        });
    }, verbose);
}

function getJSON(uri, cb, verbose) {
    getData(uri, function (e, data) {
        if (e) {
            return cb(e);
        }
        //else
        cb(null, JSON.parse(data));
    }, verbose);
}

function getXML(uri, cb, verbose) {
    //TODO parse to XML ?
    getData(uri, cb, verbose);
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
            console.error("ERROR: %j", e);
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

Client.prototype.stream = function (qry, sink) {
    if (arguments.length < 2) {
        sink = qry;
        qry = new ProductQuery();
    }

    streamData(qry.getURI(this), sink, this.verbose);
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
