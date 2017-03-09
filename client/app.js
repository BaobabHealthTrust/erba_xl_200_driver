var __path__ = require('path');
var settings = require(__path__.resolve('.', 'config', 'settings'));
var client = require('node-rest-client').Client;
var ip = require("ip");
var parser = require('xml2json');
var fs = require('fs');
var async = require('async');
const notifier = require('node-notifier');

var links = [];

var socket = require('socket.io-client')('http://' + settings.hostIP + ':' + settings.hostPort);

var instrumentFileName = __path__.resolve('.', 'config', settings.instrument_xml_filename);

if (fs.existsSync(instrumentFileName)) {

    function showMsg(title, msg, wait, callback) {

        notifier.notify({
            title: title,
            message: msg,
            icon: __path__.resolve('.', 'images', 'logo-erba.png'),
            wait: (wait ? wait : false) // Wait with callback, until user action is taken against notification
        }, function (err, response) {

            // Response is response from notification
            if(callback && response) {

                callback();

            }

        });

    }

    var instrumentMappingFile = instrumentFileName.replace(/\.[a-z]+$/i, ".json");

    async.series([

        function (callback) {

            if (!fs.existsSync(instrumentMappingFile)) {

                var xml = fs.readFileSync(instrumentFileName).toString()

                var js = parser.toJson(xml);

                var json = JSON.parse(js);

                var tests = json.configuration.supportedtests.listest;

                var mapping = {};

                for (var i = 0; i < tests.length; i++) {

                    mapping[tests[i].listestname] = tests[i].listestid;

                }

                fs.writeFileSync(instrumentMappingFile, JSON.stringify(mapping));

                callback();

            } else {

                callback();

            }

        }

    ], function () {

        socket.on('connect', function () {

            console.log("Connected!");

            socket.emit("connected", ip.address());

        });

        socket.on('done', function (msg) {

            var options_auth = {user: settings.lisUser, password: settings.lisPassword};

            showMsg("Transmission", "Sending results to server!");

            async.whilst(

                function () {

                    return links.length > 0;

                },
                function (callback) {

                    var link = links.pop();

                    console.log(link + "\n\n");

                    (new client(options_auth)).get(link, function (data) {

                        console.log("Result: " + data.toString());

                        callback();

                    });

                }, function () {

                    console.log(msg);

                    showMsg("Done", "Results sent to server!");

                });

        })

        socket.on('results', function(msg) {

            showMsg("Incoming", "Receiving results! " + msg);

        })

        socket.on('event', function (data) {

            var fields = ["Sr #", "Pat ID", "Sample ID", "Patient Name", "Test", "Result", "Unit", "Flag",
                "Result Date", "Curve #", "Mean", "SD", "Host Status", "Batch #", "Result Type"];

            console.log("\n\nData: " + JSON.stringify(data) + "\n\n");

            var path = settings.lisPath;

            var mapping = require(instrumentMappingFile);

            var measureId = (mapping[data[fields[4]]] ? encodeURIComponent(mapping[data[fields[4]]]) : undefined);

            if (measureId != undefined) {

                var specimenId = encodeURIComponent(data[fields[2]] || "");

                var result = encodeURIComponent(data[fields[5]] || "");

                path = path.replace(/\#\{SPECIMEN\_ID\}/i, specimenId);

                path = path.replace(/\#\{MEASURE\_ID\}/i, measureId);

                path = path.replace(/\#\{RESULT\}/i, result);

                links.push(path);

            }

        });

        socket.on('echo', function (data) {

            console.log("Received: " + data);

            showMsg("Message", data);

        });

        socket.on('disconnect', function () {

            console.log("Disconnected!");

            showMsg("Disconnected", "Lost connection!");

        });

    });

}
