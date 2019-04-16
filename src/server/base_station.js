import { RadioReader } from './radio_receiver';
const moment = require('moment');

class BaseStation {
  constructor(opts) {
    this.radios = this.opts.radios;
    this.beep_readers = [];
  }

  start() {
    this.radios.forEach((radio_port) => {
      let beep_reader = new BeepReader({
        baud_rate: 115200,
        port_uri: radio_port
      });
      beep_reader.on('beep', (beep => {
        console.log(beep);
      }));
      beep_reader.start();
      this.beep_readers.push(beep_reader);
    });
  }
}

export { NodeBaseStation };
