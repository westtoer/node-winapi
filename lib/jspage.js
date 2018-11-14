/*jslint node: true*/

"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    StreamArray = require("stream-json/utils/StreamArray"),
    moment = require('moment');

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length - size);
}

module.exports.doSplit = function (size, dirOutput, tplPageName, fInput) {
    // remove old stuff
    function realSplit() {
        var stream = StreamArray.make(),
            input = fs.createReadStream(fInput),
            buffer = [],
            chunksList = [];

        function writeNext(data, isLast) {
            if (chunksList.length === 0 && isLast) {
                return; // no chunks needed - pagesize exceeds datatset-size
            }
            // else construct chunkname
            var chunkname = tplPageName + "part-" + pad(chunksList.length, 5) + ".json";

            if (chunksList.length === 0) {
                // (re)create folder for first chunk
                fs.mkdirSync(dirOutput);
            }

            // add to index
            chunksList.push({"$ref": "./" + chunkname});
            fs.writeFile(path.join(dirOutput, chunkname), JSON.stringify(data), function (e, o) {
                if (e) {
                    console.error("*** error *** writing chunck : " + chunkname);
                }
            });

            if (isLast) {
                fs.writeFile(path.join(dirOutput, tplPageName + "index.json"), JSON.stringify(chunksList), function (e, o) {
                    if (e) {
                        console.error("*** error *** writing index for template : " + tplPageName);
                    }
                });
            }
        }

        stream.output.on("data", function (obj) {
            buffer.push(obj.value);
            if (buffer.length === size) {
                writeNext(buffer);
                buffer = [];
            }

        });

        stream.output.on("end", function () {
            writeNext(buffer, true);
        });

        stream.output.on("error", function (e) {
            // make sure to catch parsing errors to avoid breaking out
            console.error("***ERROR*** @output splitting json file " + fInput);
            console.error("caused by " + e);
        });

        stream.input.on("error", function (e) {
            // make sure to catch parsing errors to avoid breaking out
            console.error("***ERROR*** @input splitting json file " + fInput);
            console.error("  cause: " + e);
        });

        try {
            input.pipe(stream.input);
        } catch (e) {
            // make sure to catch parsing errors to avoid breaking out
            console.error("error splitting json file " + fInput);
            console.error("caused by " + e);
        }
    }
    
    var rimraf = require('rimraf');
    rimraf(dirOutput, function () { realSplit(); });
};

