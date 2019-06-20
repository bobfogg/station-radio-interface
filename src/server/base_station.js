import { RadioReceiver } from './radio_receiver';
const io = require('socket.io-emitter')({ host: '127.0.0.1', port: 6379 });
const fs = require('fs');
const heartbeats = require('heartbeats');
const moment = require('moment');

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
    this.heartrate = opts.flush_data_secs * 1000;
    this.heartbeat = heartbeats.createHeart(this.heartrate);
    this.heartbeat.createEvent(1, (count, last) => {
      this.writeBeeps();
    })
    this.date_format = 'YYYY-MM-DD HH:mm:ss';
    this.write_errors = opts.write_errors;
  }

  log(...msgs) {
    msgs.unshift(moment(new Date()).format(this.date_format));
    fs.appendFile(this.log_filename, msgs.join(' ')+'\r\n', (err) => {
      if (err) throw err;
    });
    console.log(...msgs);
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

    this.log('wrote '+ n + ' beeps');
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
      beep_reader.on('beep', (beep => {
        this.handle_beep(beep);
      }));
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
  }

  handle_beep(beep) {
    io.emit(beep);
    this.beep_cache.push(beep);
  }
}

export { BaseStation };
