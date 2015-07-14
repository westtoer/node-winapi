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

    this.server   = settings.server   || "win-api-acc.westtoer.be";
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
    if (tpl !== undefined && tpl.constructor === ProductQuery) {  // clone - constructor
        this.format = tpl.format;
        this.types = tpl.types.slice(0);
        this.touristictypes = tpl.touristictypes.slice(0);
        this.sizeVal = tpl.sizeVal;
        this.pageNum = tpl.pageNum;
        this.channels = tpl.channels.slice(0);
        this.lastmodExpr = tpl.lastmodExpr;
        this.softDelState = tpl.softDelState;
        this.pubState = tpl.pubState;
        this.bulkMode = tpl.bulkMode;
    } else { // nothing to clone, use defaults
        this.format = 'xml';
        this.types = ['accommodation']; //default zou alle types moeten kunnen bevatten
        this.touristictypes = [];
        this.sizeVal = Client.DEFAULT_SIZE;
        this.pageNum = Client.DEFAULT_PAGE;
        this.channels = [];
        this.bulkMode = false;
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
ProductQuery.prototype.bulk = function () {
    this.bulkMode = true;
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

//qrybuilder touristic_type filter
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
        set.push("+" + key + ":(" + valList.join(' OR ') + ")");
    }
};

ProductQuery.prototype.getURI = function (client) {
    var uri, q = [],
        expired = client.token_expires < Date.now();

    if (client.token === null || expired) {
        throw "client has no active (" + !expired + ") token (" + client.token + ")";
    }
    if (this.types === undefined || this.types === null || this.types.length === 0) {
        throw "no types specified for fetch";
    }

    uri = client.baseURI + (this.bulkMode ? "bulk/" : "") + this.types.join(',') +
        "?format=" + this.format +
        "&access_token=" + encodeURIComponent(client.token);

    if (!this.bulkMode) { // paging is meaningless in bulk mode
        uri += ProductQuery.addURI("size", this.sizeVal, Client.DEFAULT_SIZE);
        uri += ProductQuery.addURI("page", this.pageNum, Client.DEFAULT_PAGE);
    }

    ProductQuery.addQueryVal(q, "metadata.tdms__update_date", this.lastmodExpr);
    ProductQuery.addQueryVal(q, "metadata.tdms__deleted", this.softDelState);
    ProductQuery.addQueryVal(q, "publishing_channels.tdms__published", this.pubState);

    ProductQuery.addQueryList(q, "publishing_channels.tdms__publishing_channel.@code", this.channels);
    ProductQuery.addQueryList(q, "metadata.tdms__touristic_product_type.@code", this.touristictypes);

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

function streamData(uri, sink, cb, verbose) {
    getResponse(uri, function (e, res) {
        if (e) {
            sink.emit('error', e);
            return;
        } //else
        if (res === undefined || res === null) {
            sink.emit('error', "error reading uri [" + uri + "] - no response object.");
            return;
        }
        if (res.statusCode !== 200) {
            sink.emit('error', "error reading uri [" + uri + "] to stream - response.status == " + res.statusCode);
        } // else
        res.pipe(sink);
        cb(res);
    }, verbose);
}

function getData(uri, cb, verbose) {
    getResponse(uri, function (e, res) {
        var data = "";
        if (e) {
            return cb(e);
        } //else
        if (res === undefined || res === null) {
            return cb("error reading uri [" + uri + "] - no response object.");
        }
        if (res.statusCode !== 200) {
            return cb("error reading uri [" + uri + "] - status == " + res.statusCode);
        } // else
        res
            .on('data', function (chunk) {
                data += chunk;
            })
            .on('end', function () {
                cb(null, data);
            })
            .on('error', cb);
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
    //TODO parse XML to DOM ?
    getData(uri, cb, verbose);
}

Client.prototype.stop = function () {
    clearTimeout(this.token_refresh);
    this.token = null;
    this.token_expires = Date.now();
    this.token_refresh = null;
};

Client.prototype.start = function (cb) {
    var me = this, SLACK_MILLIS = 1000, exp_in_millis;

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
        exp_in_millis = resp.expires_in * 1000;
        me.token_expires = Date.now() + exp_in_millis;
        if (exp_in_millis > SLACK_MILLIS) { // we assume at least 1s slack to operate
            me.token_refresh = setTimeout(function () {
                me.start();
            }, exp_in_millis - SLACK_MILLIS);
        } else {
            console.warn("token validity too short to organize self-refresh");
        }
        if (me.verbose) {
            console.log("got token %s - valid for %d - till %s", me.token, resp.expires_in, moment(me.token_expires));
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
            if (e) {
                cb(e);
            } // else
            var meta = resp, EMB = "_embedded", emb = meta[EMB];
            resp = emb.items;
            delete emb.items;
            cb(e, resp, meta);
        }, this.verbose);
    } else if (qry.format === 'xml') {
        getXML(qry.getURI(this), function (e, resp) {
            cb(e, resp);
        }, this.verbose);
    }
};

Client.prototype.stream = function (qry, sink, cb) {
    if (arguments.length < 2) {
        sink = qry;
        qry = new ProductQuery();
    }
    cb = cb || function (res) {}; // do nothing callback

    streamData(qry.getURI(this), sink, cb, this.verbose);
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
