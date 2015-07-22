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

function GenericQuery(tpl) {
    if (tpl !== undefined && tpl.constructor === GenericQuery) {  // clone - constructor
        this.format = tpl.format;
        this.resources = tpl.resources.slice(0);
        this.touristictypes = tpl.touristictypes.slice(0);
        this.sizeVal = tpl.sizeVal;
        this.pageNum = tpl.pageNum;
        this.channels = tpl.channels.slice(0);
        this.lastmodExpr = tpl.lastmodExpr;
        this.softDelState = tpl.softDelState;
        this.pubState = tpl.pubState;
        this.bulkMode = tpl.bulkMode;
        this.partnerId = tpl.partnerId;
        this.ownerEmail = tpl.ownerEmail;
    } else { // nothing to clone, use defaults
        this.format = 'xml';
        this.resources = ['accommodation']; //default zou alle types moeten kunnen bevatten
        this.touristictypes = [];
        this.sizeVal = Client.DEFAULT_SIZE;
        this.pageNum = Client.DEFAULT_PAGE;
        this.channels = [];
        this.bulkMode = false;
    }
}
GenericQuery.prototype.clone = function () {
    return new GenericQuery(this);
};

// paging
GenericQuery.prototype.page = function (page) {
    this.pageNum = Number(page) || Client.DEFAULT_PAGE;
    return this;
};
GenericQuery.prototype.size = function (size) {
    this.sizeVal = Number(size) || 10;
    return this;
};

// qrybuilder formats
GenericQuery.prototype.asJSON_HAL = function () {
    this.format = 'json+hal';
    return this;
};
GenericQuery.prototype.asJSON = function () {
    this.format = 'json';
    return this;
};
GenericQuery.prototype.asXML = function () {
    this.format = 'xml';
    return this;
};
GenericQuery.prototype.bulk = function () {
    this.bulkMode = true;
    return this;
};

//qrybuilder resource filter
GenericQuery.prototype.forResources = function (newRsrc) {
    this.resources = asArray(newRsrc);
    return this;
};
GenericQuery.prototype.andResource = function (singleRsrc) {
    return this.resources.push(singleRsrc);
};


//qrybuilder type filter -- product queries
GenericQuery.prototype.forTypes = function (newtypes) {
    return this.forResources(newtypes);
};
GenericQuery.prototype.andType = function (singletype) {
    return this.andResource(singletype);
};
//qrybuilder type filter -- vocabularies queries
GenericQuery.prototype.forVocs = function () {
    return this.forResources(['vocabulary']);
};
//qrybuilder type filter -- claims queries
GenericQuery.prototype.forClaims = function () {
    return this.forResources(['product_claim']);
};
//qrybuilder type filter -- statistical queries
GenericQuery.prototype.forStatsOfYear = function (year) {
    return this.forResources(['bi/product_statistical_data/' + year]);
};



//qrybuilder touristic_type filter
GenericQuery.prototype.forTouristicTypes = function (newtypes) {
    this.touristictypes = asArray(newtypes);
    return this;
};
GenericQuery.prototype.andTouristicType = function (singletype) {
    return this.touristictypes.push(singletype);
};

//qrybuilder lastmod filter
GenericQuery.prototype.lastmod = function (expr) {
    this.lastmodExpr = expr;
    return this;
};
function dateFormat(s) {
    if (s === undefined || s === null) {
        return "*";
    }
    return moment(s).format('YYYY-MM-DD');
}
GenericQuery.prototype.lastmodBetween = function (from, to) {
    from = dateFormat(from);
    to = dateFormat(to);
    return this.lastmod("[" + from + " TO " + to + "}"); // start boundary is inclusive, end-boundary is exclusive
};

//qrybuilder delete filter
GenericQuery.prototype.removed = function () {
    this.softDelState = true;
    return this;
};
GenericQuery.prototype.active = function () {
    this.softDelState = false;
    return this;
};
GenericQuery.prototype.ignoreRemoved = function () {
    this.softDelState = undefined;
    return this;
};

//qrybuilder pubchannel filter
GenericQuery.prototype.forChannels = function (chs) {
    this.channels = asArray(chs);
    return this;
};
GenericQuery.prototype.andChannel = function (ch) {
    return this.channels.push(ch);
};

//qrybuilder published filter
GenericQuery.prototype.published = function () {
    this.pubState = true;
    return this;
};
GenericQuery.prototype.hidden = function () {
    this.pubState = false;
    return this;
};
GenericQuery.prototype.ignorePublished = function () {
    this.pubState = undefined;
    return this;
};

//qrybuilder owner-email filtering
GenericQuery.prototype.owner = function (email) {
    this.ownerEmail = email;
    return this;
};

//qrybuilder partner-id filtering
GenericQuery.prototype.partner = function (id) {
    this.partnerId = id;
    return this;
};


GenericQuery.addURI = function (key, value, unsetVal) {
    if (value === unsetVal) {
        return "";
    } // else
    return "&" + key + "=" + encodeURIComponent(value);
};

GenericQuery.addQueryVal = function (set, key, value) {
    if (value === undefined) {
        return;
    } // else
    return set.push("+" + key + ":" + value);
};

GenericQuery.addQueryList = function (set, key, valList) {
    if (valList === undefined || valList.length === 0) {
        return;
    } // else

    if (valList.length === 1) {
        set.push("+" + key + ":" + valList[0]);
    } else {
        set.push("+" + key + ":(" + valList.join(' OR ') + ")");
    }
};

GenericQuery.prototype.getURI = function (client) {
    var uri, q = [],
        expired = client.token_expires < Date.now();

    if (client.token === null || expired) {
        throw "client has no active (" + !expired + ") token (" + client.token + ")";
    }
    if (this.resources === undefined || this.resources === null || this.resources.length === 0) {
        throw "no types specified for fetch";
    }

    uri = client.baseURI + (this.bulkMode ? "bulk/" : "") + this.resources.join(',') +
        "?format=" + this.format +
        "&access_token=" + encodeURIComponent(client.token);

    if (!this.bulkMode) { // paging is meaningless in bulk mode
        uri += GenericQuery.addURI("size", this.sizeVal, Client.DEFAULT_SIZE);
        uri += GenericQuery.addURI("page", this.pageNum, Client.DEFAULT_PAGE);
    }

    GenericQuery.addQueryVal(q, "metadata.tdms__update_date", this.lastmodExpr);
    GenericQuery.addQueryVal(q, "metadata.tdms__deleted", this.softDelState);
    GenericQuery.addQueryVal(q, "publishing_channels.tdms__published", this.pubState);

    GenericQuery.addQueryList(q, "publishing_channels.tdms__publishing_channel.@code", this.channels);
    GenericQuery.addQueryList(q, "metadata.tdms__touristic_product_type.@code", this.touristictypes);

    // specific for claims
    GenericQuery.addQueryList(q, "claims.claim.owner.email_address", this.ownerEmail);
    GenericQuery.addQueryList(q, "partner_id", this.partnerId);

    // TODO specific for vocabs
    // ?? machine name

    // TODO specific for stats
    // ??

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
        qry = new GenericQuery();
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
        qry = new GenericQuery();
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
        return new GenericQuery();
    }
    if (service === 'vocabulary') {
        return new GenericQuery().forVocs();
    }
    if (service === 'claim') {
        return new GenericQuery().forClaims();
    }
    if (service === 'statistics') {
        return new GenericQuery().forStatsOfYear(moment().getYear());
    }
    throw "unknown service request";
};
