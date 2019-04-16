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
    console.log('initialized', this.port_uri, 'at', this.baud_rate);
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
      const beep = JSON.parse(line);
      beep.received_at = moment(new Date());
      this.emit('beep', beep);
    });
    return port.pipe(parser);
  }
}

export { RadioReceiver };