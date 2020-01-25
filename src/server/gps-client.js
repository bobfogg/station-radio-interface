const gpsd = require ('node-gpsd');
const EventEmitter = require('events');

/**
 * maintain a connection to gpsd daemon and maintain most recent gps info
 * merge sky satellites with gps data into gps_sate object
 */
class GpsClient {
    constructor() {
        this.latest_gps_fix;
        this.latest_sky_view;
        this.latest_fix;

        this.buildGpsClient();
    }

    buildGpsClient() {
        this.gps_listener = new gpsd.Listener({
            port: 2947,
            hostname: 'localhost',
            parse: true
        });
        this.gps_listener.on('TPV', (data) => {
            // time-position-velocity report
            this.latest_fix = data;
            if (data.mode > 1) {
                // we have a 2d or 3d fix
                if (this.latest_gps_fix=== null) {
                    // first gps fix acquired
                    this.emit('initial-fix', data);
                }
                this.latest_gps_fix = data;
            }

            // handle fix type
            switch(data.mode) {
                case 0:
                    break;
                case 1:
                    break;
                case 2:
                    // 2d fix
                    this.emit('2d-fix', data);
                    break;
                case 3:
                    // 3d fix
                    this.emit('3d-fix', data);
                    break;
                default:
                    break;
            }
        });

        this.gps_listener.on('SKY', (data) => {
            // sky view of GPS satellite positions
            if (this.latest_sky_view=== null) {
                // first satellite view acquired
                this.emit('initial-sky', data);
            }
            this.latest_sky_view = data;
        });
    }

    start() {
        console.log('connecting');
        this.gps_listener.connect(() => {
            console.log('connected');
        });
        this.gps_listener.watch();
    }

    stop() {
        this.gps_listener.disconnect();
    }
}

export { GpsClient };