const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const moment = require('moment');
const EventEmitter = require('events');

class RadioReceiver extends EventEmitter {
  constructor(opts) {
    super();
    this.port_uri = opts.port_uri;
    this.baud_rate = opts.baud_rate;
    this.reader;
  }

  start() {
    console.log('starting beep reader', this.port_uri);
    this.reader = this.buildSerialInterface();
  }

  buildSerialInterface() {
    const port = SerialPort(this.port_uri, {
      baudRate: this.baud_rate
    });
    port.on('open', () => {
      console.log('opened serial interface to lifetag', this.port_uri, this.baud_rate)
    });
    port.on('close', () => {
      console.log('this port was closed');
    });
    port.on('error', (err) => {
      console.log('serial error', err);
    });
    const parser = new Readline();
    parser.on('data', (line) => {
      let vals = line.split(',');
      console.log(line);
      if (vals.length == 2) {
        let rssi = parseInt(vals[1]);
        this.emit('beep', {
          tag_serial: vals[0],
          rssi: rssi,
          received_at: moment(new Date()),
          port_uri: this.port_uri
        });
      }
    });
    return port.pipe(parser);
  }
}

export { RadioReceiver };