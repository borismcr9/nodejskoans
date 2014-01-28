var udp = require('dgram'),
    net = require('net'),
    RTPProtocol = require('simpleRTP'),
    nodeMp3 = require('NMp3'),
    koanize = require('koanizer');

koanize(this);

var RemotePrompt = function(library){

    var sessionsDB = {};
    /*
        KOAN #1
        should instantiate a TCP Server
    */
    this.server = net.createServer();

    this.listen = function(port){
        /*
            KOAN #2
            should be able to wait for incoming connections
        */
        this.server.listen(port);
    };

    this.close = function(){
        this.server.close();
    };

    /*
        KOAN #3
        should attend incoming connections
    */
    this.server.on('connection', function(connection){

        // Set initial prompt
        connection.prompt = '';
        var remoteIP = connection.remoteAddress;
        /*
            KOAN #4
            should write in connection socket
        */
        connection.write("Welcome to your command line playlist manager, " + remoteIP);

        if (remoteIP in sessionsDB){
            /*
                KOAN #5
                should be able to close connections
            */
            connection.end("Duplicated session, closing.");
                return;
        }

        sessionsDB[remoteIP] = true;

        var source = new nodeMp3.Mp3Source(library);
        var rtpprotocol = new RTPProtocol();
        var udpSocket = udp.createSocket('udp4');

        rtpprotocol.on('packet', function(packet){
            udpSocket.send(packet, 0, packet.length, 5002, remoteIP);
        });

        source.on('frame', function(frame){
            rtpprotocol.pack(frame);
        });

        source.on('track', function(trackName){
            connection.write("Now playing " + trackName + "\r\n# ");
        });

        source.on('pause', function(trackName){
            connection.write(trackName + " paused.\r\n# ");
        });

        source.on('listEnd', function(){
            var seconds = 1; //10;
            connection.write("End of the list reached.Closing in " + seconds + " seconds\r\n# ");
            /*
                KOAN #6
                should trigger a inactivity timeout on the socket
            */
            connection.setTimeout(seconds * 1000, function(){
                delete sessionsDB[this.remoteAddress];
                connection.end("Your session has expired. Closing.");
            });
        });
        /*
            KOAN #7
            should receive incoming data from connections
        */
        connection.on('data', function(data){

            data = data.toString('utf8');
            // se deshabilita el timeout por si hubiera sido activado
            this.setTimeout(0);

            // Como telnet cada caracter que escribamos
            // debemos monitorear cuando el caracter enter sea escrito
            if( (data!="\r\n") && (data!="\n") ){
                this.prompt += data;
                return;
            }

            var command = this.prompt.split(data)[0]; // limpiar el prompt del caracter enter
            this.prompt = ''; // Limpiando el prompt

            switch(command){
                case "list": //list
                    var playlist = source.list();
                    this.write("\r\nSongs in the playlist");
                    this.write("\r\n---------------------");
                    for (var i=0; i < playlist.length; i++){
                        var song = playlist[i];
                        this.write("\r\n" + (source.currentTrack() == song? "> " : "  ") + song);
                    }
                    this.write("\r\n# ");
                    break;
                case "play": //play
                    source.play();
                    break;
                case "pause": //pause
                    source.pause();
                    break;
                case "next": //next
                    source.next();
                    break;
                case "prev": //prev
                    source.prev();
                    break;
                case "exit": //exit
                    delete sessionsDB[this.remoteAddress];
                    this.end("Bye.");
                    break;
                default:
                    this.write("Command " + command + " unknown\r\n# ");
            }

        });

        connection.on('close', function(){
            source.stop();
            udpSocket.close();
            rtpprotocol = source = null;
        });

        connection.write("\r\nNow, point your player to:\r\n\trtp://" + remoteIP + ":5002\r\n# ");

    });
};

exports.create = function(){
    var actions = [];

    var app;
    var library = new nodeMp3.Mp3Library({ basedir: '../data/songs/' });
    library.on('ready', function(){
        app = new RemotePrompt(this);

        for (var i = 0; i< actions.length; i++){
            actions[i].apply(app);
        }
        actions = undefined;
    });

    // TO COMPLETELY IGNORE:
    // some kind of ugly, lame & messy code mixing promise pattern with proxy
    // pattern.
    //
    // This offers an object with same listen method as RemotePrompt class
    // invocable when app is not ready yet. It offers too an onListening method
    // that will install a callback on 'listening' event on server property of
    // RemotePrompt; this method should not be in RemotePrompt class itself but
    // it's useful for testing purposes. It's also chainable.
    return new (function(){
        var _defer = function(callback){
            if (actions){
                actions.push(callback);
            } else {
                callback.apply(app);
            }
        };

        var self = this;
        this.listen = function(port){
            _defer(function(){
                this.listen(port);
            });
        };

        this.close = function(){
            _defer(function(){
                this.close();
            });
        };

        this.onListening = function(callback){
            _defer(function(){
                this.server.on('listening', callback);
            });
            return self;
        };

        this.getServer = function(callback){
            _defer(function(){
                callback(this.server);
            });
        };
    })();
};
