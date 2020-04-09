const fetch = require('node-fetch');
const os = require('os');

class ServerApi {
  constructor() {
    this.endpoint = "http://wildlife-debug.celltracktech.com:8014/station"
    this.hardware_endpoint = "http://localhost:3000/";
    this.details = [
      'modem',
      'sensor/details',
      'peripherals',
      'gps',
      'about'
    ]
  }

  healthCheckin() {
    let promises = [];
    this.details.forEach((post) => {
      let uri = `${this.hardware_endpoint}${post}`
      promises.push(fetch(uri).then(res => res.json()));
    });
    Promise.all(promises)
      .then((responses) => {
        console.log('Got Responses');
        console.log(responses);
      })
      .catch((err) => {
        console.error(err);
        console.error('error getting station details');
      });
  }
}

export { ServerApi };