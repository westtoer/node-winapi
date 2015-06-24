/*jslint node: true */
/*jslint es5: true */
/*jslint nomen: true */

"use strict";

var wapi = require('./lib/winapi'),
    fs = require('fs'),
    path = require('path'),
    argv = require('yargs'),
    async = require('async'),
    moment = require('moment'),
    settings,
    win,
    outDir,
    secret,
    work = [],
    FORMATS = {xml: "asXML", json: "asJSON"},
    PERIODS = {week: 7, day: 1},
    PUBSTATES = {all: "ignorePublished", pub: "published" },
    PRODUCTS = ['accommodation', 'permanent_offering', 'reca', 'temporary_offering', 'meetingroom'],
    CHANNELS = ['westtoer', 'brugse_ommeland', 'westhoek', 'de_kust', 'leiestreek', 'fietsen_en_wandelen',
                'kenniscentrum', 'dagtrips_voor_groepen', 'flanders_fields', 'meetingkust', 'autoroutes',
                'itrip_coast', 'kustwandelroute', 'west-vlinderen', '300_jaar_grens'];

settings = argv
    .usage('Maakt de win2 dump voor de datahub.\nUsage: $0')
    .example('$0  -o ~/feeds/win/2.0/ -s secret', 'Maakt de dump en plaatst die in de aangegeven output-folder.')

    .describe('clientid', 'id of the client - requires matching secret')
    .alias('i', 'clientid')

    .describe('secret', 'het secret.')
    .alias('s', 'secret')

    .describe('output', 'folder waar de dump wordt geplaatst.')
    .alias('o', 'output')

    .describe('verbose', 'should there be a lot of logging output')
    .alias('v', 'verbose')
    .default('v', false)

    .demand(['secret', 'output'])

    .argv;

win = wapi.client({secret: settings.secret, clientid: settings.clientid, verbose: settings.verbose});
outDir = settings.output;

function addTask(task) {
    work.push(task);
}

function perform(task) {
    //console.log(JSON.stringify(task));

    var q = task.query;
    // do request 3 times for formats : 1 to retrieve size, then one for each format output
    win.fetch(q.clone().asJSON_HAL().size(1), function (err, res, meta) {
        var pathname = path.join(outDir, task.name),
            SIZEMARGIN = 100,
            size = meta.pages;

        function remove(ext) {
            var fname = [pathname, ext].join('.');
            if (fs.existsSync(fname)) {
                fs.unlinkSync(fname);
            }
        }

        if (size === 0) {
            console.log("no data for %s - removing files", pathname);
            Object.keys(FORMATS).forEach(remove);
        } else {
            size += SIZEMARGIN;
            Object.keys(FORMATS).forEach(function (ext) {
                var fmtMethod = FORMATS[ext],
                    sink = fs.createWriteStream([pathname, ext].join('.'));

                sink.on('error', function (e) {
                    console.error("error saving " + pathname + "." + ext + "-->" + e);
                    remove(ext);
                });

                win.stream(q.clone().size(size)[fmtMethod](), sink);
            });
        }
    });
}

function makePeriodTasks(pTask) {
    var to = moment();
    return function (period) {
        var days = PERIODS[period],
            from = to.clone().subtract(days, 'days'),
            task = {name: [pTask.name, period, from.format('YYYYMMDD'), to.format('YYYYMMDD')].join('-'),
                    query: pTask.query.clone().lastmodBetween(from, to)};
        addTask(task);
    };
}

function makePubTasks(pTask) {
    return function (pubKey) {
        var pubMethod = PUBSTATES[pubKey],
            task = {name: [pTask.name, pubKey].join('-'),
                    query: pTask.query.clone()[pubMethod]()};
        addTask(task);
        Object.keys(PERIODS).forEach(makePeriodTasks(task));
    };
}

function assertDirExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

function makeChannelTasks(pTask) {
    assertDirExists(path.join(outDir, "bychannel"));
    return function (channel) {
        var name = [pTask.name, channel, "pub"].join('-'),
            task = {name: path.join("bychannel", channel, name),
                    query: pTask.query.clone().published().forChannels(channel + "*")};

        assertDirExists(path.join(outDir, "bychannel", channel));

        addTask(task);
    };
}

function makeProductTasks(pTask) {
    return function (prod) {
        var task = {name: prod,
                    query: pTask.query.clone().forTypes(prod)};
        Object.keys(PUBSTATES).forEach(makePubTasks(task));
        CHANNELS.forEach(makeChannelTasks(task));
    };
}
function makeAll() {
    var task = { name: "", query: wapi.query('product')};
    PRODUCTS.forEach(makeProductTasks(task));
}

function makeDump() {
    // check if the outdir exists --> if not fail fast
    if (!fs.existsSync(outDir)) {
        throw "Cannot dump to " + outDir + " - path does not exist.";
    }
    if (!fs.statSync(outDir).isDirectory()) {
        throw "Cannot dump to " + outDir + " - path is not a directory.";
    }

    // assemble all the work
    makeAll();

    win.start(function () {
        // process all the work
        work.forEach(perform);
    });

}

makeDump(settings.secret, settings.output);
