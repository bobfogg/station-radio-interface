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
    this.sensor_data = [];
    this.max_sensor_records = 100;
  }

  pollSensors() {
    console.log('polling sensor data');
    let uri = `${this.hardware_endpoint}sensor/details`
    console.log('posting to uri', uri);
    fetch(uri).then(res => res.json())
      .then((data) => {
        console.log('adding sensor data');
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

  healthCheckin(stats) {
    let promises = [];
    this.details.forEach((post) => {
      let uri = `${this.hardware_endpoint}${post}`
      promises.push(fetch(uri).then(res => res.json()));
    });
    Promise.all(promises)
      .then((responses) => {
        return {
          'modem': responses[0],
          'sensor': responses[1],
          'peripherals': responses[2],
          'gps': responses[3],
          'about': responses[4]
        }
      })
      .then((data) => {
        let v1_checkin_data = data //this.downgrade(data);
        v1_checkin_data.stats = stats;
        console.log(JSON.stringify(v1_checkin_data,null,2));
        // clear sensor data
        this.sensor_data = [];
      })
      .catch((err) => {
        console.error(err);
        console.error('error getting station details');
      });
  }
}

export { ServerApi };