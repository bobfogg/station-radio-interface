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
  }

  log(...msgs) {
    msgs.unshift(moment(new Date()).format('YYYY-MM-DD HH:mm:ss'));
    console.log(...msgs);
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
    this.reader = this.buildSerialInterface();
  }

  buildSerialInterface() {
    const port = new SerialPort(this.port_uri, {
      baudRate: this.baud_rate
    });
    port.on('open', () => {
      let msg = ['opened serial interface to lifetag', this.port_uri, '@', this.baud_rate, 'bps'].join(' ');
      this.emit('log', msg);
      this.active = true;
      this.emit('open', this.data());
    });
    port.on('close', () => {
      this.emit('log', 'port '+this.port_uri+ ' was closed');
      this.active = false;
      this.emit('close', this.data());
    });
    port.on('error', (err) => {
      this.emit('log', 'serial error '+ err);
      this.active = false;
      this.emit('close', this.data());
    });
    const parser = new Readline();
    parser.on('data', (line) => {
      const raw_beep = JSON.parse(line);
			this.emit('beep', {
				received_at: moment(new Date()),
				channel: this.channel,
				tag_id: raw_beep.data.tag.id,
        rssi: raw_beep.rssi,
        error_bits: raw_beep.data.tag.error_bits
			});
    });
    return port.pipe(parser);
  }
}

export { RadioReceiver };
