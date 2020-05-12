const fetch = require('node-fetch');
const os = require('os');

class ServerApi {
  constructor() {
    this.endpoint = "http://station.internetofwildlife.com/station/v2/checkin/"
    this.hardware_endpoint = "http://localhost:3000/";
    this.details = [
      'modem',
      'sensor/details',
      //'peripherals',
      'gps',
      'about',
      'internet/pending-upload'
    ]
    this.sensor_data = [];
    this.max_sensor_records = 100;
  }

  pollSensors() {
    let uri = `${this.hardware_endpoint}sensor/details`
    fetch(uri).then(res => res.json())
      .then((data) => {
        this.sensor_data.push(data);
        if (this.sensor_data.length > this.max_sensor_records) {
          // only store up to a maximum number of sensor records
          this.sensor_data.shift();
        }
      });
  }

  filterStats(stats) {
    Object.keys(stats.channels).forEach((channel) => {
      let channel_data = stats.channels[channel];
      Object.keys(channel_data.beeps).forEach((tag) => {
        let cnt = channel_data.beeps[tag];
        if (cnt < 5) {
          delete channel_data.beeps[tag];
        }
      });
      Object.keys(channel_data.nodes.beeps).forEach((tag) => {
        let cnt = channel_data.nodes.beeps[tag];
        if (cnt < 5) {
          delete channel_data.nodes.beeps[tag];
        }
      });
    });
    return stats;
  }

  checkInternet() {
    return fetch(`${this.hardware_endpoint}internet/status`)
      .then(res => res.json())
      .then(json => {
        if (json.success == 3) {
          return true; 
        }
      })
      .catch((err) => {
        console.error('error checking internet status');
        console.error(err);
        return false;
      })
  }

  healthCheckin(stats) {
    return new Promise((resolve, reject) => {

      let promises = [];
      this.details.forEach((post) => {
        let uri = `${this.hardware_endpoint}${post}`
        promises.push(fetch(uri).then(res => res.json()));
      });
      return Promise.all(promises)
        .then((responses) => {
          return {
            'modem': responses[0],
            //'peripherals': responses[2],
            'gps': responses[2],
            'about': responses[3],
            'uploads': responses[4]
          }
        })
        .then((data) => {
          let v1_checkin_data = data 
          v1_checkin_data.stats = this.filterStats(stats);
          let gps_time = data.gps.gps.time;
          data.gps = data.gps.mean;
          if (data.gps) {
            data.gps.time = gps_time;
          } else {
            data.gps = {
              lat: null,
              lng: null,
              time: null
            }
          }
          data.sensor = this.sensor_data;
          console.log('about to check in');
          fetch(this.endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
          })
          .then((res) => {
            if (res.ok) {
              // we have a successful server checkin - clear sensor data
              this.sensor_data = [];
              resolve();
            } else {
              console.error('did not receive a valid checkin response from the server');
              resolve();
            }
          })
          .catch((err) => {
            console.log('unable to check into server')
            console.error(err);
            reject(err)
          })
        })
        .catch((err) => {
          console.error(err);
          console.error('error getting station details');
          reject(err)
        });
    });
  }
}

export { ServerApi };