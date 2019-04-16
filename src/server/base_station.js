import { RadioReceiver } from './radio_receiver';
const moment = require('moment');

class BaseStation {
  constructor(opts) {
    this.radios = opts.radios;
    this.beep_readers = [];
    console.log('initializing radio receiver');
  }

  start() {
    console.log('starting radio receivers');
    this.radios.forEach((radio_port) => {
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: radio_port
      });
      beep_reader.on('beep', (beep => {
        console.log(JSON.stringify(beep));
      }));
      beep_reader.start();
      this.beep_readers.push(beep_reader);
    });
  }
}

export { BaseStation };
