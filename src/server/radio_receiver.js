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
    this.restart_ms = 5000;
    this.serialport;
    this.parser;
    this.active = false;
  }

  log(...msgs) {
    msgs.unshift('port '+this.port_uri + ' log:');
    msgs.unshift(moment(new Date()).format('YYYY-MM-DD HH:mm:ss'));
    let msg = msgs.join(' ');
    this.emit('log', msgs.join(' '));
  }

  write(data) {
    this.serialport.write(data.trim()+'\r\n');
  }

  data() {
    return {
      port_uri: this.port_uri,
      baud_rate: this.baud_rate,
      channel: this.channel,
      active: this.active
    }
  }

  start(delay=0) {
    // start the radio after given delay in ms
    let self = this;
    //this.parser= this.buildSerialInterface();
    setTimeout(() => {
      self.buildSerialInterface();
    }, delay);
  }

  buildSerialInterface() {
    let port = new SerialPort(this.port_uri, {
      baudRate: this.baud_rate
    });
    port.on('open', () => {
      let msg = ['opened serial interface to lifetag', this.port_uri, '@', this.baud_rate, 'bps'].join(' ');
      this.log(msg);
      this.active = true;
      this.emit('open', this.data());
    });
    port.on('close', () => {
      this.log('closed');
      this.active = false;
      this.emit('close', this.data());
      this.start(this.restart_ms);
      // if the radio is closes - restart after given delay
    });
    port.on('error', (err) => {
      this.log('serial error', err);
      this.active = false;
      this.emit('close', this.data());
    });
    this.serialport = port;
    let parser = new Readline();
    parser.on('data', (line) => {
      let raw_beep;
      let now = moment(new Date()).utc();
      try {
        raw_beep = JSON.parse(line);
        raw_beep.channel = this.channel;
        raw_beep.received_at = now;
      } catch(err) {
        // not a JSON document - assume this is an outgoing command
        this.log('command issued', line);
        return;
      }
      if (raw_beep.res) {
        this.emit('response', raw_beep);
        return;
      }
      if (raw_beep.firmware) {
        raw_beep.channel = this.channel;
        this.emit('fw', raw_beep);
        return;
      }
      if (raw_beep.data.tag) {
        this.emit('beep', {
          received_at: now,
          tag_at: now,
          channel: this.channel,
          tag_id: raw_beep.data.tag.id,
          rssi: raw_beep.rssi,
          error_bits: raw_beep.data.tag.error_bits,
          node_id: null,
          node_rssi: null
        });
        return;
      }
      if (raw_beep.data.node_alive) {
        this.emit('node-alive', raw_beep)
        return;
      }
      if (raw_beep.data.node_beep) {
        this.emit('node-beep', raw_beep);
        return;
      }
      console.log('unknown line');
      console.log(raw_beep);
    });
    this.parser = port.pipe(parser);
  }
}

export { RadioReceiver };
