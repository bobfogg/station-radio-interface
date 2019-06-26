import { RadioReceiver } from './radio_receiver';
import { ComputeModule } from './compute-module';
import { SensorSocketServer } from './web-socket-server';
const fs = require('fs');
const heartbeats = require('heartbeats');
const moment = require('moment');
const http = require('http');
const gpsd = require('node-gpsd');

class BaseStation {
  constructor(opts) {
    this.radios = {
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0': 1,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.1:1.0': 2,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.2:1.0': 3,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0': 4,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.4:1.0': 5
    }
    this.active_radios = {};
    this.data_filename = opts.data_filename;
    this.log_filename = opts.log_filename;
    this.log('initializing radio receiver');
    this.beep_cache = [];
    this.flush_freq = opts.flush_data_secs;
    this.server_checkin_freq = opts.server_checkin_freq;
    this.sensor_socket_server = new SensorSocketServer({
      port: 8001
    });

    this.heartbeat = heartbeats.createHeart(1000);
    this.heartbeat.createEvent(this.flush_freq, (count, last) => {
      this.writeBeeps();
    })
    this.heartbeat.createEvent(this.server_checkin_freq, (count, last) => {
        this.serverCheckin();
    });
    this.date_format = 'YYYY-MM-DD HH:mm:ss';
    this.hostname = 'wildlife-debug.celltracktech.net';
    this.port = 8014;
    this.server_checkin_url = '/station/v1/checkin/';
    this.write_errors = opts.write_errors;
    let info = this.getId();
    this.imei = info.imei;
    this.sim = info.sim;
    this.beep_count_since_checkin = 0;
    this.unique_tags = new Set();
    this.compute_module = new ComputeModule();
    this.gps_info = {
      msg_type: 'gps',
      time: null,
      lat: null,
      lon: null
    };
    this.gps_listener = new gpsd.Listener({
      port: 2947,
      hostname: 'localhost',
      parse: true
    });
    this.gps_listener.connect(() => {
      this.log('listening to GPSD');
    });
    this.gps_listener.on('TPV', (data) => {
      Object.assign(this.gps_info, data);
      this.sensor_socket_server.broadcast(JSON.stringify(this.gps_info));
    });
    this.gps_listener.on('SKY', (data) => {
      Object.assign(this.gps_info, data);
    })
    this.gps_listener.watch();
  }

  getId() {
    let contents = fs.readFileSync('/etc/station-id');
    return JSON.parse(contents);
  }


  log(...msgs) {
    msgs.unshift(moment(new Date()).format(this.date_format));
    let line = msgs.join(' ') + '\r\n';
    fs.appendFile(this.log_filename, line, (err) => {
      if (err) throw err;
    });
    try {
      this.sensor_socket_server.broadcast(JSON.stringify({'msg_type': 'log', 'data': line}))
    } catch(err) {
      console.error(err);
    }
    console.log(...msgs);
  }

  serverCheckin() {
    try {
      this.log('checking in to server', this.hostname, this.port, this.server_checkin_url);
      this.compute_module.getDiskUsagePercent().then((usage) => {
        let postData = {
          modem: {
          imei: this.imei,
          sim: this.sim
          },
        }
        postData.module = this.compute_module.data();
        postData.module.disk_available = usage.available;
        postData.module.disk_total = usage.total;
        postData.gps = {
          lat: this.gps_info.lat,
          lng: this.gps_info.lon,
          time: this.gps_info.time,
        };
        postData.beep_count = this.beep_count_since_checkin;
        postData.unique_tags = this.unique_tags.size;
        const payload = JSON.stringify(postData);
        const options = {
          hostname: this.hostname,
          port: this.port,
          path: this.server_checkin_url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
          }
        };
        const req = http.request(options, (res) => {
          res.setEncoding('utf8');
          if (res.statusCode == 204) {
            this.log('valid server checkin; reset beep count')
            this.beep_count_since_checkin = 0;
            this.unique_tags.clear();
          }

        });
        req.on('error', (e) => {
          this.log(`checkin error: ${e.message}`)
        })
        req.write(payload);
        req.end();
      });

    } catch(err) {
      this.log('unable to checkin to server', err)
    }
  }

  writeBeeps() {
    let vals = [], lines=[], beep;
    let n = 0;
    while (this.beep_cache.length > 0) {
      n += 1;
      beep = this.beep_cache.shift();
      vals = [
        beep.received_at.format(this.date_format),
        beep.channel,
        beep.tag_id,
        beep.rssi,
      ];
      if (this.write_errors == true) {
        vals.push(beep.error_bits);
      }
      lines.push(vals.join(','));
    }
    if (lines.length > 0) {
      fs.appendFile(this.data_filename, lines.join('\r\n')+'\r\n', (err) => {
        if (err) throw err;
      });
    }

    this.log(`flush beep cache: ${n} beeps`);
  }

  getRadioReport() {
    const radios = [];
    this.active_radios.forEach((port) => {
      radios.push(this.active_radios[port]);;
    })
    return radios;
  }

  start() {
    this.log('starting radio receivers');
    Object.keys(this.radios).forEach((port) => {
      let channel = this.radios[port];
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: port,
        channel: channel
      });
      beep_reader.on('beep', (beep) => {
        this.handle_beep(beep); 
      });
      beep_reader.start();
      beep_reader.on('open', (info) => {
        this.log('opened radio on port', info.port_uri);
        this.active_radios[info.port_uri] = info;
      });
      beep_reader.on('log', (msg) => {
        this.log('Beep Reader '+beep_reader.port_uri+' Log: '+msg);
      })
      beep_reader.on('close', (info) => {
        if (info.port_uri in Object.keys(this.active_radios)) {
          delete this.active_radios[info.port_uri];
        }
      })
    });
    this.serverCheckin();
  }

  handle_beep(beep) {
    this.beep_cache.push(beep);
    this.beep_count_since_checkin += 1;
    beep.msg_type = 'beep';
    this.sensor_socket_server.broadcast(JSON.stringify(beep));
    this.unique_tags.add(beep.tag_id);
  }
}

export { BaseStation };
