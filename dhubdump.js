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
    time = 0,
    timeinc,
    FORMATS = {xml: "asXML", json: "asJSON"},
    PERIODS = {week: 7, day: 1},
    PUBSTATES = {all: "ignorePublished", pub: "published" },

    //TODO there should be a dynamic way to retrieve these lists
    PRODUCTS = ['accommodation', 'permanent_offering', 'reca', 'temporary_offering', 'meetingroom'],
    // TODO when channels are automatic --> try to recognise that lang-variants can be grouped into one!
    // --> just match for _nl , then add also the variant without _nl
    CHANNELS = ['westtoer', 'fietsen_en_wandelen', 'kenniscentrum', 'dagtrips_voor_groepen',
                'flanders_fields', 'flanders_fields_nl', 'flanders_fields_fr', 'flanders_fields_en', 'flanders_fields_de',
                'leiestreek', 'leiestreek_nl', 'leiestreek_fr', 'leiestreek_en', 'leiestreek_de',
                'de_kust', 'de_kust_nl', 'de_kust_en', 'de_kust_fr', 'de_kust_de',
                'brugse_ommeland', 'brugse_ommeland_nl', 'brugse_ommeland_fr', 'brugse_ommeland_de', 'brugse_ommeland_en',
                'westhoek', 'westhoek_nl', 'westhoek_fr',
                'meetingkust', 'meetingkust_nl', 'meetingkust_fr',
                '300_jaar_grens', '300_jaar_grens_nl', '300_jaar_grens_fr', '300_jaar_grens_en', '300_jaar_grens_de',
                'autoroutes', 'itrip_coast', 'kustwandelroute', 'west-vlinderen', 'iedereen_flandrien'],
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
             "waterrecreatie", "wekelijkse_markt", "wellness", "wijngaard", "zaal", "zwemgelegenheid"];

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

    .describe('timebetween', 'wait this many millis between requests')
    .alias('t', 'timebetween')
    .default('t', 100)  //10 requests per second

    .demand(['secret', 'output'])

    .argv;

win = wapi.client({secret: settings.secret, clientid: settings.clientid, verbose: settings.verbose});
outDir = settings.output;
timeinc = settings.timebetween;

function addTask(task) {
    work.push(task);
}

function nameJoin() {
    return [].reduce.call(arguments, function (name, part) { return (name.length ? name + "-" : "") + part; }, "");
}


function onNextInterval(fn) {
    setTimeout(fn, time);
    time += timeinc;
}

function perform(task) {
    console.log([
        task.dir,
        task.name,
        task.query.types.join('|'),
        task.query.touristictypes.join('|'),
        task.query.channels.join('|'),
        task.query.lastmodExpr,
        task.query.softDelState,
        task.query.pubState
    ].join(','));

    var q = task.query,
        pathname = path.join(outDir, task.dir, task.name);

    function remove(ext) {
        var fname = [pathname, ext].join('.');
        if (fs.existsSync(fname)) {
            fs.unlinkSync(fname);
        }
    }

    Object.keys(FORMATS).forEach(function (ext) {
        var fmtMethod = FORMATS[ext],
            sink = fs.createWriteStream([pathname, ext].join('.'));

        sink.on('error', function (e) {
            console.error("error saving " + pathname + "." + ext + "-->" + e);
            remove(ext);
        });

        onNextInterval(function () {
            win.stream(q.clone().bulk()[fmtMethod](), sink);
        });
    });
}

function makePeriodTasks(pTask) {
    var to = moment();
    return function (period) {
        var days = PERIODS[period],
            from = to.clone().subtract(days, 'days'),
            task = {dir  : pTask.dir,
                    name : nameJoin(pTask.name, period, from.format('YYYYMMDD'), to.format('YYYYMMDD')),
                    query: pTask.query.clone().lastmodBetween(from, to)};
        addTask(task);
    };
}

function makePubTasks(pTask) {
    return function (pubKey) {
        var pubMethod = PUBSTATES[pubKey],
            task = {dir  : pTask.dir,
                    name : nameJoin(pTask.name, pubKey),
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

function makeTourTypeTasks(pTask) {
    assertDirExists(path.join(outDir, pTask.dir, "bytourtype"));
    return function (tourtype) {
        var dir  = path.join(pTask.dir, "bytourtype", tourtype),
            task = {dir  : dir,
                    name : nameJoin(pTask.name, tourtype),
                    query: pTask.query.clone().forTouristicTypes(tourtype)};

        assertDirExists(path.join(outDir, dir));

        addTask(task);
        Object.keys(PERIODS).forEach(makePeriodTasks(task));
    };
}

function makeChannelTasks(pTask) {
    assertDirExists(path.join(outDir, pTask.dir, "bychannel"));
    return function (channel) {
        var dir  = path.join(pTask.dir, "bychannel", channel),
            task = {dir  : dir,
                    name : nameJoin(pTask.name, channel, "pub-all"),
                    query: pTask.query.clone().published().forTypes(PRODUCTS).forChannels(channel + "*")};

        assertDirExists(path.join(outDir, dir));

        addTask(task);
        Object.keys(PERIODS).forEach(makePeriodTasks(task));

        //simplify name downwards -
        task.name = nameJoin(pTask.name, channel, "pub");
        TOURTYPES.forEach(makeTourTypeTasks(task));
    };
}

function makeProductTasks(pTask) {
    return function (prod) {
        var task = {dir  : pTask.dir,
                    name : prod,
                    query: pTask.query.clone().forTypes(prod)};
        Object.keys(PUBSTATES).forEach(makePubTasks(task));
    };
}
function makeAll() {
    var task = {dir: ".", name: "", query: wapi.query('product')};
    PRODUCTS.forEach(makeProductTasks(task));
    CHANNELS.forEach(makeChannelTasks(task));
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
