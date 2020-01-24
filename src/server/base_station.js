import { RadioReceiver } from './radio_receiver';
import { ComputeModule } from './compute-module';
import { SensorSocketServer } from './web-socket-server';
const fs = require('fs');
const heartbeats = require('heartbeats');
const moment = require('moment');
const http = require('http');
const path = require('path');
const gpsd = require('node-gpsd');
const { spawn }  = require('child_process');

class BaseStation {
  constructor(opts) {
    this.radios = {
      1: '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0',
      2: '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.1:1.0',
      3: '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.2:1.0',
      4: '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0',
      5: '/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.4:1.0'
    }
    this.active_radios = {};
    this.base_log_dir = opts.base_log_dir
    this.toggle_modem_light_freq = 60 * 2;
    this.server_update_freq = 60*60*24;

    this.update_screen_freq = opts.update_screen_freq;
    this.beep_cache = [];
    this.node_cache = [];
    this.flush_freq = opts.flush_data_secs;
    this.gps_rotation_freq = opts.gps_rotation_freq;
    this.date_format = 'YYYY-MM-DD HH:mm:ss';
    this.hostname = 'account.celltracktech.com';
    this.port = 443;
    this.server_update_url = '/station/v1/update/';
    this.record_data = true;
    this.write_errors = opts.write_errors;
    this.gps_record_freq = opts.gps_record_freq;
    this.beep_count_since_checkin = 0;
    this.beep_count_total = 0;
    this.nodes = new Set();
    this.total_nodes = new Set();
    this.unique_tags = new Set();
    this.compute_module = new ComputeModule();

    this.gps_info = {
      msg_type: 'gps',
      time: null,
      lat: null,
      lon: null
    };

  }

  init() {
    this.station_id = this.getId();
    this.base_data_filename = `CTT-${this.station_id}-raw-data.csv`;
    this.data_file_uri = path.join(this.base_log_dir, this.base_data_filename);

    this.node_data_filename = `CTT-${this.station_id}-node-data.csv`;
    this.node_file_uri = path.join(this.base_log_dir, this.node_data_filename);

    this.gps_data_filename = `CTT-${this.station_id}-gps.csv`;
    this.gps_file_uri = path.join(this.base_log_dir, this.gps_data_filename);

    this.log_filename = `sensor-station-${this.station_id}.log`;
    this.log_file_uri = path.join(this.base_log_dir, this.log_filename);

    this.updateSelf();
    this.record('initializing base station');
    this.startModem();
    this.startWebsocketServer();
    this.startTimers();
    this.startGpsClient();
    this.start();
  }

  startWebsocketServer() {
    this.sensor_socket_server = new SensorSocketServer({
      port: 8001
    });
    this.sensor_socket_server.on('cmd', (cmd) => {
      let line;
      switch (cmd.cmd) {
        case('about'):
        let info = new ComputeModule().data();
        info.station_id = this.station_id;
        this.broadcast(JSON.stringify({
          msg_type: 'about',
          data: info
        }));
        break;
        case('save_radio'):
        Object.keys(this.active_radios).forEach((channel) => {
          this.record(`saving config for radio ${channel}`);
          let radio = this.active_radios[channel];
          try {
            radio.write("save");
          } catch(err) {
            console.log(`error saving radio on channel ${channel}`);
            console.error(err);
          }
        });
        break;
        case('toggle_radio'):
        let channel = cmd.data.channel;
        if (channel in Object.keys(this.active_radios)) {
          let radio = this.active_radios[channel];
          switch (cmd.data.type) {
            case('node'):
            line = "preset:node";
            this.record('toggle node mode on radio', channel);
            //radio.write("mode:node_v2");
            radio.write("preset:node2");
            break;
            case('tag'):
            this.record('toggle lifetag mode on radio', channel);
            //radio.write("mode:tag_fsk");
            console.log('writing to radio');
            radio.write("preset:fsktag");
            break;
            case('ook'):
            this.record('toggle ook mode on radio', channel);
            radio.write("preset:node3");

            break;
            default:
              this.record('invalid command type', cmd);
              break;
          }
          break;
        }
        default:
          this.record('unknown cmd', JSON.stringify(cmd));
      }
    });
    this.sensor_socket_server.on('client_conn', (ip) => {
      this.log(`client connected from IP: ${ip}`);
    })
  }

  startTimers() {
    this.heartbeat = heartbeats.createHeart(1000);
    this.heartbeat.createEvent(this.server_update_freq, (count, last) => {
      this.updateSelf();
    });
    this.heartbeat.createEvent(this.flush_freq, (count, last) => {
      if (this.record_data) {
        this.writeBeeps();
        this.writeNodes();
      }
    })
    this.heartbeat.createEvent(this.gps_record_freq, (count, last) => {
      this.logGPS();
    });
  }
  
  startGpsClient() {
    this.gps_listener = new gpsd.Listener({
      port: 2947,
      hostname: 'localhost',
      parse: true
    });
    this.gps_listener.connect(() => {
      this.record('listening to GPSD');
    });
    this.gps_listener.on('TPV', (data) => {
      data.system_time = new Date();
      Object.assign(this.gps_info, data);
      this.sensor_socket_server.broadcast(JSON.stringify(this.gps_info));
    });
    this.gps_listener.on('SKY', (data) => {
      Object.assign(this.gps_info, data);
    })
    this.gps_listener.watch();
  }

  startModem() {
    const cmd = spawn('systemctl', ['start',  'modem.service']);
    this.record('starting modem service');
    cmd.stderr.on('data', (err) => {
      this.record('error starting modem service', err.toString());
    });
    cmd.stdout.on('data', (data) => {
      this.record(data);
    });
    cmd.on('close', (code) => {
      this.record("modem done starting");
    })
  }

  createDir(dirname) {
    if (!fs.existsSync(dirname)) {
      this.record('creating directory', dirname);
      fs.mkdirSync(dirname);
    }
  }

  getId() {
    let contents = fs.readFileSync('/etc/station-id');
    let meta = JSON.parse(contents);
    return meta.id;
  }

  broadcast(msg) {
    if (this.sensor_socket_server) {
      this.sensor_socket_server.broadcast(msg);
    }
  }

  record(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).utc().format(this.date_format));
    let line = msgs.join(' ') + '\r\n';
    fs.appendFile(this.log_file_uri, line, (err) => {
      if (err) throw err;
    });
  }

  log(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).utc().format(this.date_format));
  }

  updateSelf() {
    try {
      this.record('checking for system update');
      let postData = {
        modem: {
        imei: this.imei,
        sim: this.sim
        }
      }
      const payload = JSON.stringify(postData);
      const options = {
        hostname: this.hostname,
        port: this.port,
        path: this.server_update_url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      };
      const req = http.request(options, (res) => {
        let buffer = '';
        res.setEncoding('utf8');
        if (res.statusCode == 200) {
          this.record('rx server update response')
        } 
        res.on('data', (data) => {
          buffer += data.toString();
        })
        res.on('close', () => {
          console.log('done');
        });
        res.on('end', (data) => {
          if (buffer.length > 0) {
            this.record('server delivered an update file');
            fs.writeFile('/tmp/server-update.sh', buffer, (err) => {
              const cmd = spawn('/bin/bash', ['/tmp/server-update.sh']);
              cmd.on('close', (code) => {
                this.record('finished running update script with code', code.toString());
              });
              cmd.stderr.on('data', (data) => {
                this.log(data.toString());
              });
              cmd.stdout.on('data', (data) => {
                this.log('running', data.toString());
              })
            })
          }
        });
      });
      req.on('error', (e) => {
        this.record(`server update error: ${e.message}`)
      })
      req.write(payload);
      req.end();
    } catch(err) {
      this.record('unable to check for system update', err.toString())
    }
  }

  logGPS() {
    return new Promise((resolve, reject) => {
      let lines = [];
      let header = [
        'recorded at',
        'gps at',
        'latitude',
        'longitude',
        'altitude',
        'quality'
      ]
      let line = [
        moment(new Date()).toISOString(),
        this.gps_info.time, 
        this.gps_info.lat, 
        this.gps_info.lon,
        this.gps_info.alt,
        this.gps_info.mode
      ].join(',');
      lines.push(line);
      if (!fs.existsSync(this.gps_file_uri)) {
        lines.unshift(header);
      }
      fs.appendFile(this.gps_file_uri, lines.join('\r\n')+'\r\n', (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      })
    })
  }

  writeNodes() {
    return new Promise((resolve, reject) => {
      let vals = [], lines=[], node_alive, info;
      let header = [
        'Time',
        'RadioId',
        'NodeId',
        'NodeRSSI',
        'Battery',
        'Celsius',
      ];
      let n = 0;

      while (this.node_cache.length > 0) {
        n += 1;
        node_alive = this.node_cache.shift();
        vals = [
          node_alive.received_at.toISOString(),
          node_alive.channel,
          node_alive.node_id,
          node_alive.rssi,
          node_alive.battery,
          node_alive.celsius
        ];
        lines.push(vals.join(','));
      }
      if (lines.length > 0) {
        // data to write to file - verify that the ile exists
        if (!fs.existsSync(this.node_file_uri)) {
          // add header line if the file does not exists
          lines.unshift(header.join(','));
        }
        fs.appendFile(this.node_file_uri, lines.join('\r\n')+'\r\n', (err) =>{
          if (err) {
            reject(err);
          }
        });
      }
      this.record(`flush node alive cache: ${n} messages`);
    });
  }

  writeBeeps() {
    return new Promise((resolve, reject) => {
      let vals = [], lines=[], beep;
      let n = 0;
      let header = [
        'Time',
        'RadioId',
        'TagId',
        'TagRSSI',
        'NodeId'
      ]
      if (this.write_errors == true) {
        header.push('ErrorBits');
      }
      while (this.beep_cache.length > 0) {
        n += 1;
        beep = this.beep_cache.shift();
        vals = [
          beep.received_at.toISOString(),
          beep.channel,
          beep.tag_id,
          beep.tag_rssi,
          beep.node_id
        ];
        if (this.write_errors == true) {
          vals.push(beep.error_bits);
        }
        lines.push(vals.join(','));
      }
      if (lines.length > 0) {
        if (!fs.existsSync(this.data_file_uri)) {
          lines.unshift(header.join(','));
        }
        fs.appendFile(this.data_file_uri, lines.join('\r\n')+'\r\n', (err) => {
          if (err) {
            reject(err);
          }
          resolve()
        });
      }
      this.record(`flush beep cache: ${n} beeps`);
    })
  }

  getRadioReport() {
    const radios = [];
    this.active_radios.forEach((port) => {
      radios.push(this.active_radios[port]);;
    })
    return radios;
  }

  start() {
    this.record('starting radio receivers');
    Object.keys(this.radios).forEach((channel) => {
      channel = parseInt(channel);
      let port = this.radios[channel];
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: port,
        channel: channel
      });
      beep_reader.on('beep', (beep) => {
        console.log(beep);
      });
      beep_reader.on('open', (info) => {
        this.record('opened radio on port', info.port_uri);
        this.active_radios[info.port_uri] = info;
      });
      beep_reader.on('close', (info) => {
        if (info.port_uri in Object.keys(this.active_radios)) {
        }
      });
      beep_reader.start(1000);
      this.active_radios[channel] = beep_reader;
    });
  }

  handle_node_alive(node_alive) {
    let info = node_alive.data.node_alive;
    let msg = `radio: ${node_alive.channel}; node ${info.id}; firmware: ${info.firmware}; battery: ${info.battery_mv/1000}V;`
    node_alive.msg_type='node-alive';
    this.nodes.add(info.id);
		this.total_nodes.add(info.id);

    this.node_cache.push({
      received_at: node_alive.received_at,
      channel: node_alive.channel,
      node_id: info.id,
      firmware: info.firmware,
      battery: info.battery_mv / 1000,
      celsius: info.celsius,
      rssi: node_alive.rssi,
      avg_cca: info.avg_cca
    });
    this.sensor_socket_server.broadcast(JSON.stringify({
      msg_type: 'node-alive',
      received_at: moment(new Date()).utc(),
      channel: node_alive.channel,
      node_id: info.id,
      firmware: info.firmware,
      battery: info.battery_mv/1000,
      rssi: node_alive.rssi,
    }));
  }

  handle_node_beep(node_beep) {
    let now = moment(new Date()).utc();
    let node_info = node_beep.data.node_beep;
    let tag_info = node_beep.data.node_tag;
    let then = now.subtract(node_info.offset_ms, 'ms');
    this.beep_cache.push({
      received_at: then,
      channel: node_beep.channel,
      tag_id: tag_info.tag_id,
      tag_rssi: node_info.tag_rssi,
      node_id: node_info.id,
      error_bits: 0
    })
    this.sensor_socket_server.broadcast(JSON.stringify({
      msg_type: 'beep',
      received_at: now,
      tag_at: then,
      channel: node_beep.channel,
      tag_id: tag_info.tag_id,
      rssi: node_info.tag_rssi,
      error_bits: 0,
      node_id: node_info.id,
      node_rssi: node_beep.rssi
    }));
    this.nodes.add(node_info.id);
		this.total_nodes.add(node_info.id);
  }

  handle_beep(beep) {
    this.beep_cache.push({
      received_at: beep.received_at,
      channel: beep.channel,
      tag_id: beep.tag_id,
      tag_rssi: beep.rssi,
      node_id: beep.node_id,
      error_bits: beep.error_bits
    });
    this.beep_count_since_checkin += 1;
    this.beep_count_total += 1;
    beep.msg_type = 'beep';
    this.sensor_socket_server.broadcast(JSON.stringify(beep));
    this.unique_tags.add(beep.tag_id);
  }
}

export { BaseStation };
