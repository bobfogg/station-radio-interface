import { LedDriver } from './led-driver';
const fetch = require('node-fetch');

class StationLeds {
  constructor() {
    this.led_driver = new LedDriver();
    this.hardware_server = 'http://localhost:3000';
    this.ping_count = 3;
    this.led_driver = new LedDriver();
    this.gps_delay_timeout = 60 * 1000; // 60 seconds for gps light to go out
  }

  toggleGps(data) {
    if (data) {
      let now = new Date();
      let gps_time = new Date(data.time);
      let delta = now - gps_time;
      if (delta > this.gps_delay_timeout) {
        this.led_driver.toggleGps({ state: 'off'});
      } else {
        switch(data.mode) {
          case 3:
            this.led_driver.toggleGps({state: 'on'});
            break;
          case 2:
            this.led_driver.toggleGps({state: 'blink', blink_ms: 500});
            break;
          case 1:
            this.led_driver.toggleGps({state: 'blink', blink_ms: 200});
            break;
          default:
            this.led_driver.toggelGps({state: 'off'});
            break;
        }
      }
    } else {
      this.led_driver.toggleGps({state: 'off'});
    }

  }

  toggleInternet() {
    fetch('http://localhost:3000/modem/ppp')
    .then(res => res.json())
    .then(json => {
      if (json.ppp == true) {
          this.led_driver.toggleDiagB({ state: 'on'})
      } else {
          this.led_driver.toggleDiagB({ state: 'off'})
      }
    })
    .catch((err) => {
      console.error(err);
      this.led_driver.toggleDiagB({ state: 'blink', blink_ms: 100});
    })
  }

  toggleOperational() {
    this.led_driver.toggleDiagA({ state: 'toggle'});
  }

  toggleAll(gps) {
    this.toggleGps(gps);
    this.toggleInternet();
    this.toggleOperational();
  }
}

export { StationLeds };