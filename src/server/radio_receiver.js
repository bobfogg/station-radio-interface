const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const moment = require('moment');
const EventEmitter = require('events');

class RadioReceiver extends EventEmitter {
  constructor(opts) {
    super();
    this.port_uri = opts.port_uri;
    this.baud_rate = opts.baud_rate;
    this.channel = opts.channel;
    this.reader;
    this.active = false;
    console.log('initialized', this.port_uri, 'at', this.baud_rate, 'channel', this.channel);
  }

  data() {
    return {
      port_uri: this.port_uri,
      baud_rate: this.baud_rate,
      channel: this.channel,
      active: this.active
    }
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
      this.active = true;
      this.emit('open', this.data());
    });
    port.on('close', () => {
      console.log('this port was closed');
      this.active = false;
      this.emit('close', this.data());
    });
    port.on('error', (err) => {
      console.log('serial error', err);
      this.active = false;
      this.emit('close', this.data());
    });
    const parser = new Readline();
    parser.on('data', (line) => {
      const raw_beep = JSON.parse(line);
      switch (raw_beep.type) {
      case 'beep':
        this.emit('beep', {
          received_at: moment(new Date()),
          channel: this.channel,
          radio_id: raw_beep.channel,
          tag_id: raw_beep.data.tag_id,
          rssi: raw_beep.data.rssi,
        });
        break;
      default:
        this.emit('unknown', raw_beep);
      }
    });
    return port.pipe(parser);
  }
}

export { RadioReceiver };