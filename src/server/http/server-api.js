const fetch = require('node-fetch');
const os = require('os');

class ServerApi {
  constructor() {
    this.endpoint = "https://account.celltracktech.com/station/v2/checkin/"
    this.hardware_endpoint = "http://localhost:3000/";
    this.details = [
      'modem',
      'sensor/details',
      //'peripherals',
      'gps',
      'about'
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

  downgrade(info) {
    return {
      modem: {
        imei: info.modem.imei,
        sim: info.modem.sim
      },
      module: {
        bootcount: 0,
        hardware: info.about.hardware,
        serial: info.about.serial,
        revision: info.about.revision,
        loadavg_15min: info.about.loadavg_15min,
        free_mem: info.about.free_mem,
        uptime: info.about.uptime,
        disk_available: info.about.disk_usage.available,
        disk_total: info.about.disk_usage.total
      },
      gps: {
        lat: info.gps.mean.lat,
        lng: info.gps.mean.lng,
        time: info.gps.gps.time
      },
      sensor: this.sensor_data,
      beep_count: 0,
      unique_tags: 0,
      node_count: 0
    }
  }

  filterStats(stats) {
    console.log('filtering tags');
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
            'about': responses[3]
          }
        })
        .then((data) => {
          let v1_checkin_data = data //this.downgrade(data);
          v1_checkin_data.stats = this.filterStats(stats);
          let gps_time = data.gps.gps.time;
          data.gps = data.gps.mean;
          data.gps.time = gps_time;
          data.sensor = this.sensor_data;
          fetch(this.endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
          })
          .then(res => res.json())
          .then((json) => {
            // we have a successful server checkin - clear sensor data
            this.sensor_data = [];
            console.log('checkin success!');
            console.log(json);
            resolve(json)
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