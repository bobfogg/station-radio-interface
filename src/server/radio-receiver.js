const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const moment = require('moment');
const EventEmitter = require('events');

/* event emitter for a radio:   events
  beep  - parsed JSON document from radio
  raw   - radio output not JSON parsable 
  open  - radio port opened
  close - radio closed / radio error
*/
class RadioReceiver extends EventEmitter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    super();
    this.port_uri = opts.port_uri;
    this.baud_rate = opts.baud_rate;
    this.channel = opts.channel;
    this.restart_ms = opts.restart_ms | 15000;
    this.restart_on_close = opts.restart_on_close | true;
    this.serialport;
    this.parser;
    this.fw_version = null;
    this.commands = [];
    this.current_command = null;
    this.delay = 0.25;

    this.preset_commands = {
      "node": "preset:node3",
      "tag": "preset:fsktag",
      "ook": "prset:ooktag"
    }
  }

  issuePresetCommand(cmd) {
    console.log('about to issue preset command', cmd)
    let write_cmd = this.preset_commands[cmd];
    if (write_cmd) {
      console.log('issuing preset', write_cmd, 'to', this.channel);
      this.write(write_cmd);
    }
  }

  /**
   * 
   * @param {list} cmds - array of commands to issue
   */
  issueCommands(cmds) {
    let n = 0;
    cmds.forEach((cmd) => {
      n += 1;
      setTimeout(this.write.bind(this), this.delay*n*1000, cmd);
    });
  }

  /**
   * 
   * @param {*} data - write given data to the radio
   */
  write(data) {
    console.log('write', data);
    console.log(`${new Date()} writing to radio ${this.channel}:  ${data.trim()}`)
    this.serialport.write(data.trim()+'\r\n', function(err) {
      if (err) {
        this.emit('error', `error writing to radio ${this.data()}; ${err.toString()}`);
      }
    });
  }

  /**
   * meta data about self
   */
  data() {
    return {
      port_uri: this.port_uri,
      baud_rate: this.baud_rate,
      channel: this.channel,
    }
  }

  /**
   * start the radio
   * 
   * @param {*} delay start the radio after delay milliseconds
   */
  start(delay=0) {
    let self = this;
    setTimeout(() => {
      self.buildSerialInterface();
    }, delay);
  }

  /**
   * establish radio interface connection
   * emit basic events
   */
  buildSerialInterface() {
    let port = new SerialPort(this.port_uri, {
      baudRate: this.baud_rate
    });
    port.on('open', () => {
      this.emit('open', this.data());
    });
    port.on('close', () => {
      this.emit('close', this.data());
      if (this.restart_on_close == true) {
        // restart the radio interface after given delay
        this.start(this.restart_ms);
      }
    });
    port.on('error', (err) => {
      this.emit('error', `${err.toString()+this.data().toString()}`);
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
        if (raw_beep.key) {
          // radio command response
          this.emit('response', raw_beep);
        } else {
          this.emit('beep', raw_beep);
        }
      } catch(err) {
        // not a JSON document - emit the raw input
        this.emit('raw', line);
        return;
      }
    });
    this.parser = port.pipe(parser);
  }
}

export { RadioReceiver };
