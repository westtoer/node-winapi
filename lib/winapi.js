/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    protocolHandler = {},
    moment = require('moment');

protocolHandler.http = require('http');
protocolHandler.https = require('https');


function asArray(a) {
    if (Array.isArray(a)) {
        return a;
    } // else
    if (a === null || a === undefined) {
        return [];
    } // else
    return [a];
}


function Client(settings) {
    var protocol = settings.protocol || "http";
    this.handler = protocolHandler[protocol];

    this.verbose  = !!settings.verbose; // false if not set

    this.server   = settings.server   || "win-api.westtoer.be";
    this.version  = settings.version  || "v1";
    this.clientid = settings.clientid || "westtoer";
    this.secret   = settings.secret   || "no-secret";

    this.baseURI = protocol + "://" + this.server + "/api/" + this.version + "/";
    this.authURI = protocol + "://" + this.server + "/oauth/v2/token?grant_type=client_credentials&client_id=" +
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
        this.lastmodRange = tpl.lastmodRange;
        this.softDelState = tpl.softDelState;
        this.pubState = tpl.pubState;
        this.bulkMode = tpl.bulkMode;
        this.partnerId = tpl.partnerId;
        this.keyvalset = tpl.keyvalset.slice(0);
        this.ownerEmail = tpl.ownerEmail;
        this.requiredFields = tpl.requiredFields.slice(0);
        this.selectId = tpl.selectId;
        this.selectMunicipal = tpl.selectMunicipal;
        this.machineName = tpl.machineName;
        this.anyTerm = tpl.anyTerm;
    } else { // nothing to clone, use defaults
        this.format = 'xml';
        this.resources = ['accommodation']; //default zou alle types moeten kunnen bevatten
        this.touristictypes = [];
        this.sizeVal = Client.DEFAULT_SIZE;
        this.pageNum = Client.DEFAULT_PAGE;
        this.channels = [];
        this.requiredFields = [];
        this.keyvalset = [];
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
    this.resources.push(singleRsrc);
    return this;
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
GenericQuery.prototype.forStats = function () {
    return this.forResources(['product_statistical_data']);
};



//qrybuilder touristic_type filter
GenericQuery.prototype.forTouristicTypes = function (newtypes) {
    this.touristictypes = asArray(newtypes);
    return this;
};
GenericQuery.prototype.andTouristicType = function (singletype) {
    this.touristictypes.push(singletype);
    return this;
};

//qrybuilder generic keyvals filter
GenericQuery.prototype.andKeyVal = function (key, val) {
    this.keyvalset.push({"key": key, "val": val});
    return this;
};

//qrybuilder lastmod filter
GenericQuery.prototype.lastmod = function (range) {
    this.lastmodRange = range;
    return this;
};
function dateFormat(s) {
    if (s === undefined || s === null) {
        return "*";
    }
    return moment(s).format('YYYY-MM-DD');
}
GenericQuery.prototype.lastmodBetween = function (from, to) {
    var range = {};
    if (from !== undefined && from !== null) {
        range.gte = dateFormat(from);
    }
    if (to !== undefined && to !== null) {
        range.lt = dateFormat(to);
    }
    return this.lastmod(range); // start boundary is inclusive, end-boundary is exclusive
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
    this.channels.push(ch);
    return this;
};
GenericQuery.prototype.requirePubChannel = function () {
    return this.andChannel(".*");
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

//qrybuilder id filtering
GenericQuery.prototype.id = function (id) {
    this.selectId = id;
    return this;
};

//qrybuilder municipality filtering
GenericQuery.prototype.municipality = function (muni) {
    this.selectMunicipal = muni;
    return this;
};

//qrybuilder existingfields filter
GenericQuery.prototype.requireFields = function (flds) {
    this.requiredFields = asArray(flds);
    return this;
};
GenericQuery.prototype.andField = function (fld) {
    this.requiredFields.push(fld);
    return this;
};

//qrybuilder vocname filtering
GenericQuery.prototype.vocname = function (name) {
    this.machineName = name;
    return this;
};

//qrybuilder stats-year filtering
GenericQuery.prototype.statsyear = function (year) {
    this.statsYear = Number(year);
    return this;
};

//qrybuilder any field matching
GenericQuery.prototype.match = function (term) {
    this.anyTerm = term;
    return this;
};



GenericQuery.addURI = function (key, value, unsetVal) {
    if (value === unsetVal) {
        return "";
    } // else
    return "&" + key + "=" + encodeURIComponent(value);
};

GenericQuery.addQuery = function (set, type, key, value) {
    if (Array.isArray(value)) {
        value = value.join(" ");
    }
    if (value === undefined || value === null || value === "") {
        return;
    } // else
    var rule = {}, qry = {};
    rule[key] = value;
    qry[type] = rule;
    set.push(qry);
};

GenericQuery.addMatchQuery = function (set, key, value) {
    GenericQuery.addQuery(set, "match", key, value);
};

GenericQuery.addFuzzyQuery = function (set, key, value) {
    GenericQuery.addQuery(set, "fuzzy", key, value);
};

GenericQuery.addTermsQuery = function (set, key, value) {
    GenericQuery.addQuery(set, "terms", key, value.split(/\s/));
};

GenericQuery.addRegExpQuery = function (set, key, value) {
    GenericQuery.addQuery(set, "regexp", key, value);
};

GenericQuery.addRangeQuery = function (set, key, range) {
    GenericQuery.addQuery(set, "range", key, range);
};

GenericQuery.addNestedQuery = function (set, path, subfn) {
    if (path === undefined) {
        return;
    } // else
    var subset = [], qry = {"bool": {"must": subset}};
    subfn(subset);
    set.push({"nested": {"path": path, "query": qry}});
};

GenericQuery.addExistsFilters = function (set, fields) {
    fields.forEach(function (field) {
        if (field === undefined || field === null || field === "") {
            return;
        }
        set.push({"exists": {"field": field}});
    });
};



GenericQuery.prototype.getURI = function (client, notoken) {
    notoken = notoken || false;
    var me = this, uri, esq = [], esf = [], query, queryNeeded = false,
        expired = client.token_expires < Date.now();

    if (!notoken && (client.token === null || expired)) {
        throw new Error("client has no active (" + !expired + ") token (" + client.token + ")");
    }
    if (this.resources === undefined || this.resources === null || this.resources.length === 0) {
        throw new Error("no types specified for fetch");
    }

    uri = client.baseURI + (this.bulkMode ? "bulk/" : "") + this.resources.join(',') +
        "?format=" + this.format +
        "&access_token=" + (notoken ? "***" : encodeURIComponent(client.token));

    if (!this.bulkMode) { // paging is meaningless in bulk mode
        uri += GenericQuery.addURI("size", this.sizeVal, Client.DEFAULT_SIZE);
        uri += GenericQuery.addURI("page", this.pageNum, Client.DEFAULT_PAGE);
    }

    GenericQuery.addRangeQuery(esq, "metadata.update_date", this.lastmodRange);
    GenericQuery.addMatchQuery(esq, "metadata.deleted", this.softDelState);
    GenericQuery.addMatchQuery(esq, "publishing_channels.published", this.pubState);
    GenericQuery.addMatchQuery(esq, "metadata.id", this.selectId);
    GenericQuery.addMatchQuery(esq, "location_info.address.municipality", this.selectMunicipal);

    this.keyvalset.forEach( function(kv) {
        GenericQuery.addMatchQuery(esq, kv.key, kv.val);
    });

    GenericQuery.addFuzzyQuery(esq, "_all", this.anyTerm);
    GenericQuery.addExistsFilters(esf, this.requiredFields);

    if (this.channels.length > 0) {
        GenericQuery.addNestedQuery(
            esq,
            "publishing_channels.publishing_channel",
            function (subset) {
                GenericQuery.addRegExpQuery(subset, "publishing_channels.publishing_channel.code", me.channels);
                GenericQuery.addMatchQuery(subset, "publishing_channels.publishing_channel.published", true);
            }
        );
    }
    GenericQuery.addMatchQuery(esq, "metadata.touristic_product_type.code", this.touristictypes);

    // specific for claims
    GenericQuery.addRegExpQuery(esq, "claims.claim.owner.email_address", this.ownerEmail);
    GenericQuery.addMatchQuery(esq, "metadata.partner_id", this.partnerId);

    // specific for vocabs
    GenericQuery.addMatchQuery(esq, "machine_name", this.machineName);

    // specific for stats
    GenericQuery.addMatchQuery(esq, "statistical_data_collection.year", this.statsYear);


    query = {"query" : {"filtered": {}}};

    if (esq.length > 0) {
        queryNeeded = true;
        query.query.filtered.query =  {"bool" : {"must": esq}};
    }
    if (esf.length > 0) {
        queryNeeded = true;
        query.query.filtered.filter =  {"bool" : {"must": esf}};
    }
    if (queryNeeded) {
        uri += "&_query=" + encodeURIComponent(JSON.stringify(query));
    }

    return uri;
};


function getResponse(client, uri, cb, verbose) {
    verbose = verbose || false;
    if (verbose) {
        console.log("call uri [%s]", uri);
    }

    client.get(uri, function (res) {
        cb(null, res);
    }).on('error', function (e) {
        cb(e);
    });
}

function streamData(client, uri, sink, cb, verbose) {
    getResponse(client, uri, function (e, res) {
        if (e) {
            sink.emit('error', e);
        } else if (res === undefined || res === null) {
            sink.emit('error', new Error("error reading uri [" + uri + "] - no response object."));
        } else if (res.statusCode !== 200) {
            sink.emit('error', new Error("error reading uri [" + uri + "] to stream - response.status == " + res.statusCode));
        } else { // all is well, so try sinking this data
            res.pipe(sink);
        }
        cb(e, res);
    }, verbose);
}

function getData(client, uri, cb, verbose) {
    getResponse(client, uri, function (e, res) {
        var data = "";
        if (e) {
            return cb(e);
        } //else
        if (res === undefined || res === null) {
            return cb(new Error("error reading uri [" + uri + "] - no response object."));
        }
        if (res.statusCode !== 200) {
            return cb(new Error("error reading uri [" + uri + "] - status == " + res.statusCode));
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

function getJSON(client, uri, cb, verbose) {
    getData(client, uri, function (e, data) {
        if (e) {
            return cb(e);
        }
        //else
        cb(null, JSON.parse(data));
    }, verbose);
}

function getXML(client, uri, cb, verbose) {
    //TODO parse XML to DOM ?
    getData(client, uri, cb, verbose);
}

Client.prototype.stop = function () {
    clearTimeout(this.token_refresh);
    this.token = null;
    this.token_expires = Date.now();
    this.token_refresh = null;
};

Client.prototype.start = function (cb) {
    cb = cb || function () {return; };
    var me = this, SLACK_MILLIS = 1000, exp_in_millis;

    if (me.token_refresh !== null) { // already started...
        if (cb) {
            return cb(null); // no errors, but no token object either
        }
        return;
    }

    // else
    getJSON(this.handler, this.authURI, function (e, resp) {
        if (e) {
            console.error("getjson ERROR: %j", e);
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

        cb(e, resp);
    }, this.verbose);
};

Client.prototype.fetch = function (qry, cb) {
    if (arguments.length < 2) {
        cb = qry;
        qry = new GenericQuery();
    }

    try {
        if (qry.format === 'json') {
            getJSON(this.handler, qry.getURI(this), function (e, resp) {
                cb(e, resp);
            }, this.verbose);
        } else if (qry.format === 'json+hal') {
            getJSON(this.handler, qry.getURI(this), function (e, resp) {
                if (e) {
                    return cb(e);
                } // else
                var meta = resp, EMB = "_embedded", emb = meta[EMB];
                resp = emb.items;
                delete emb.items;
                cb(e, resp, meta);
            }, this.verbose);
        } else if (qry.format === 'xml') {
            getXML(this.handler, qry.getURI(this), function (e, resp) {
                cb(e, resp);
            }, this.verbose);
        }
    } catch (e) {
        cb(e);
    }
};

Client.prototype.stream = function (qry, sink, cb) {
    if (arguments.length < 2) {
        sink = qry;
        qry = new GenericQuery();
    }
    cb = cb || function () { return; }; // do nothing callback

    try {
        streamData(this.handler, qry.getURI(this), sink, cb, this.verbose);
    } catch (e) {
        cb(e, null);
    }
};

Client.prototype.parseVocabularyCodes = function (vocabs, onlyNames) {
    return vocabs.reduce(function (byName, voc) {
        var name = voc.machine_name;
        if (onlyNames === undefined || onlyNames.indexOf(name) !== -1) {
            if (byName.hasOwnProperty(name)) {
                throw new Error("duplicate key machine_name : " + name);
            }
            if (voc && voc.terms && voc.terms.term) {
                byName[name] = Object.keys(voc.terms.term.reduce(function (res, term) {
                    var code = term.code || "";
                    if (code.length === 0) {
                        throw new Error("invalid empty code '' for vocabulary: " + name);
                    }
                    if (res.hasOwnProperty(code)) {
                        throw new Error("duplicate code '" + code + "' for vocabulary: " + name);
                    }
                    res[code] = term;
                    return res;
                }, {}));
//                byName[name] = voc.terms.term.map(function (term) {
//                    var code = term.code || "";
//                    if (code.length === 0) {
//                        throw new Error("invalid empty code '' for vocabulary: " + name);
//                    }
//                    return code;
//                });
            } else {
                byName[name] = [];
            }
        }
        return byName;
    }, {});
};

Client.prototype.parseVocabularyTrees = function (vocabs, onlyNames) {
    return vocabs.reduce(function (byName, voc) {
        var name = voc.machine_name, termRoot = {children: []}, termNodes;
        if (onlyNames === undefined || onlyNames.indexOf(name) !== -1) {
            if (byName.hasOwnProperty(name)) {
                throw new Error("duplicate key machine_name : " + name);
            }
            if (voc && voc.terms && voc.terms.term && voc.hierarchy) {
                // list all linkable nodes
                termNodes = voc.terms.term.reduce(function (tns, term) {
                    var code = term.code || "", pcode = term.parent_code || "";
                    if (code.length === 0) {
                        throw new Error("invalid empty code '' for vocabulary: " + name);
                    }
                    if (tns.hasOwnProperty(code)) {
                        throw new Error("duplicate code '" + code + "' for vocabulary: " + name);
                    }
                    tns[code] = {
                        code: code,
                        parent: pcode,
                        children: []
                    };
                    return tns;
                }, {});
                // link parents and children
                Object.keys(termNodes).forEach(function (code) {
                    var tn = termNodes[code],
                        pn = tn.parent === "" ? termRoot : termNodes[tn.parent];

                    if (pn === null || pn === undefined) {
                        throw new Error("not found node for parent_code '" + tn.parent + "' in voc named: " + name);
                    }
                    tn.parent = pn;
                    pn.children.push(tn);
                });
                byName[name] = termRoot.children;
            } else {
                byName[name] = null;
            }
        }
        return byName;
    }, {});
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
        return new GenericQuery().forStats();
    }
    throw "unknown service request";
};
