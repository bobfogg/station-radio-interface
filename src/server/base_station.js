import { RadioReceiver } from './radio_receiver';
const moment = require('moment');

class BaseStation {
  constructor(opts) {
    this.radios = {
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0': 1,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.4:1.0': 2,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.3:1.0': 3,
      '/dev/unknown': 4,
      '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.1:1.0': 5,
    }
    this.active_radios = {};
    console.log('initializing radio receiver');
  }

  getRadioReport() {
    const radios = [];
    this.active_radios.forEach((port) => {
      radios.push(this.active_radios[port]);;
    })
    return radios;
  }

  start() {
    console.log('starting radio receivers');
    Object.keys(this.radios).forEach((port) => {
      let channel = this.radios[port];
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: port,
        channel: channel
      });
      beep_reader.on('beep', (beep => {
        console.log(JSON.stringify(beep));
      }));
      beep_reader.start();
      beep_reader.on('open', (info) => {
        console.log('radio opened', info);
        this.active_radios[info.port_uri] = info;
      });
      beep_reader.on('close', (info) => {
        if (info.port_uri in Object.keys(this.active_radios)) {
          delete this.active_radios[info.port_uri];
        }
      })
    });
  }
}

export { BaseStation };
