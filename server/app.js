process.chdir(__dirname);

var express = require("express");
var app = express();
var portfinder = require("portfinder");
var server = require("http").Server(app);
var io = require("socket.io")(server);
var chokidar = require('chokidar');
var __path__ = require('path');
var deleteWhenDone = require(__path__.resolve('.', 'config', 'settings')).deleteWhenDone;
var target = require(__path__.resolve('.', 'config', 'settings')).target_folder;
var fs = require('fs');
var byline = require('byline');
var ip = require("ip");
const notifier = require('node-notifier');

var watcher = chokidar.watch(target, {
    ignored: /[\/\\]\./, persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

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

io.on("connection", function (socket) {

    socket.on("echo", function (msg, callback) {

        callback = callback || function () {
        };

        socket.emit("echo", msg);

        callback(null, "Done.");

    });

    socket.on("connected", function(client) {

        showMsg("New Connection", "New client '" + (client ? client : "?") + "' connected!");

        console.log("New client '" + (client ? client : "?") + "' connected!");

        socket.emit("echo", "Client " + (client ? client : "?") + " is connected to the server on " + ip.address());

    })

    socket.on("disconnect", function () {

        console.log("Client connection lost!");

        showMsg("Disconnected", "Client connection lost!");

    });

    watcher.on('add', function(path) {

        var root = path.substring(target.length).match(/[\/|\\]([^\.]+)\.[a-z]+$/i);

        console.log(root);

        if(root) {

            var filename = root[1];

            if(filename.match(/^ResultReprint/i)) {

                console.log("New valid file added " + path);

                showMsg("New File", "New valid file added " + path);

                var stream = byline(fs.createReadStream(path, { encoding: 'utf8' }));

                socket.emit('results', "New valid file added " + path);

                stream.on('data', function(line) {

                    var parts = line.split("\t");

                    if(parts.length > 16) {

                        var fields = ["Sr #", "Pat ID", "Sample ID", "Patient Name", "Test", "Result", "Unit", "Flag",
                            "Result Date", "Curve #", "Mean", "SD", "Host Status", "Batch #", "Result Type"];

                        var args = {};

                        for(var i = 0; i < fields.length; i++) {

                            args[fields[i]] = parts[i];

                        }

                        console.log(args);

                        socket.emit('event', args);

                    }

                });

                stream.on('end', function() {

                    socket.emit('done', "Done");

                    if(deleteWhenDone) {

                        fs.unlinkSync(path);

                    }

                })

            }

        }

    })

});

portfinder.basePort = 3018;

portfinder.getPort(function (err, port) {

    server.listen(port, function () {

        console.log("✔ Server running on port %d in %s mode", port, app.get("env"));

        showMsg("Server Status", "✔ Server running on port " + port + " in " + app.get("env") + " mode");

    });

});

module.exports = server;