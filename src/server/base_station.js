import { RadioReceiver } from './radio_receiver';
import { ComputeModule } from './compute-module';
import { SensorSocketServer } from './web-socket-server';
import { Uploader } from './uploader';
const fs = require('fs');
const heartbeats = require('heartbeats');
const moment = require('moment');
const http = require('http');
const path = require('path');
const gpsd = require('node-gpsd');
const zlib = require('zlib');
const { spawn }  = require('child_process');
const glob = require('glob');

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
    this.log_filename = 'sensor-station.log';
    this.log_file_uri = path.join(this.base_log_dir, this.log_filename);
    this.record('initializing base station');

    let info = this.getId();
    this.base_data_filename = `CTT-${info.imei}-data.csv`;
    this.data_file_uri = path.join(this.base_log_dir, this.base_data_filename);

    this.node_data_filename = `CTT-${info.imei}-node-data.csv`;
    this.node_file_uri = path.join(this.base_log_dir, this.node_data_filename);

    this.update_screen_freq = opts.update_screen_freq;
    this.beep_cache = [];
    this.node_cache = [];
    this.flush_freq = opts.flush_data_secs;
    this.server_checkin_freq = opts.server_checkin_freq;
    this.rotation_freq = opts.rotation_freq;
    this.imei = info.imei;
    this.sim = info.sim;
    this.updating_screen = false;
    this.uploading = false;
    this.upload_freq = opts.upload_freq;
    this.uploader = new Uploader(this.imei);
    this.current_upload_file;
    this.date_format = 'YYYY-MM-DD HH:mm:ss';
    this.hostname = 'account.celltracktech.com';
    this.port = 80;
    this.server_checkin_url = '/station/v1/checkin/';
    this.record_data = true;
    this.write_errors = opts.write_errors;
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


    this.sensor_socket_server = new SensorSocketServer({
      port: 8001
    });
    this.sensor_socket_server.on('cmd', (cmd) => {
      let line;
      switch (cmd.cmd) {
        case('about'):
        let info = this.compute_module.data();
        info.station_id = this.imei;
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
            console.log('serror saving radio');
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
            line = "mode:node_v2";
            this.record('toggle node mode on radio', channel, JSON.stringify(cmd));
            radio.write("mode:node_v2");
            break;
            case('tag'):
            this.record('toggle lifetag mode on radio', channel)
            radio.write("mode:tag_fsk");
            break;
            case('cornell'):
            this.record('toggle cornell mode on radio', channel)
            radio.write("mode:tag_ook");
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

    this.heartbeat = heartbeats.createHeart(1000);
    this.heartbeat.createEvent(this.flush_freq, (count, last) => {
      if (this.record_data) {
        this.writeBeeps();
        this.writeNodes();
      }
    })
    this.heartbeat.createEvent(this.server_checkin_freq, (count, last) => {
        this.serverCheckin();
    });
    this.heartbeat.createEvent(this.rotation_freq, (count, last) => {
      this.record('rotating radio tag data file');
      this.rotateDataFile(this.data_file_uri, this.base_data_filename).then((res) => {
        this.rotateDataFile(this.node_file_uri, this.node_data_filename);
      }).catch((err) => {
        this.record('error rotating data file')
        console.error(err);
      });
    });
    this.heartbeat.createEvent(this.update_screen_freq, (count, last) => {
      this.updateDisplay(false);
    });
    this.heartbeat.createEvent(this.upload_freq, (count, last) => {
      this.uploadFiles();
    });
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
    this.updateDisplay(true); // turn on welcome screen
  }

  updateDisplay(welcome=false) {
    if (this.updating_screen) {
      this.log('screen update not finished - skipping update');
      return;
    }
    this.updating_screen = true;
    let view  = welcome ? 'welcome' : 'main';
    let args =[
      '/home/pi/ctt/caseys-software/update_screen.py',
      '--beeps',
      this.beep_count_total,
      '--nodes',
      this.total_nodes.size,
      '--gps',
      3,
      '--signal',
      0,
      '--view',
      view
    ];
    this.log(`updating ${view} display`);
    const cmd = spawn('python', args, {
			env: {
				PYTHONPATH: '$PYTHONPATH:/home/pi/.local/lib/python2.7/site-packages'
			}
		});
    cmd.on('close', (code) => {
      this.log('finished updating screen');
      this.updating_screen = false;
    });
		cmd.stderr.on('data', (data) =>{
			console.log('display error');
			console.log(data.toString());
		});
    cmd.on('error', (err) => {
      console.log('error running command...');
      console.log(line);
      console.error(err);
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
    return JSON.parse(contents);
  }

  broadcast(msg) {
    if (this.sensor_socket_server) {
      this.sensor_socket_server.broadcast(msg);
    }
  }

  uploadFiles() {
    if (this.uploading) {
      this.record('data upload still in progress, ignoring upload job');
      return;
    }
    this.uploading = true;
    this.uploadNext();
  }

  uploadNext() {
    let dirname = path.join(this.base_log_dir, 'uploaded');
    this.createDir(dirname);
    this.createDir(path.join(this.base_log_dir, 'uploaded', 'ctt'));
    this.createDir(path.join(this.base_log_dir, 'uploaded', 'sg'));
    this.uploader.getFilesToUpload().then((res) => {
      if (res.ctt.length > 0) {
        this.current_upload_file = res.ctt.shift();
        this.record('begin file upload', this.current_upload_file);
        this.uploader.uploadCttFile(this.current_upload_file).then((data) => {
          let basename = path.basename(this.current_upload_file);
          let dest = path.join(dirname, 'ctt', basename);
          fs.renameSync(this.current_upload_file, dest);
          this.record('finished file upload', this.current_upload_file);
          this.uploadNext();
        }).catch((err) => {
          // unable to upload file
          this.record('error trying to upload file', this.current_upload_file);
          console.error(err);
          this.current_upload_file = null;
          this.uploading = false;
          return;
        })

      } else if (res.sg.length > 0) {
        this.current_upload_file = res.sg.shift();
        this.record('begin sg file upload', this.current_upload_file);
        this.uploader.uploadSgFile(this.current_upload_file).then((data) => {
          let basename = path.basename(this.current_upload_file);
          let dest = path.join(dirname, 'sg', basename);
          fs.renameSync(this.current_upload_file, dest);
          this.record('finished file upload', this.current_upload_file);
          this.uploadNext();
        }).catch((err) => {
          // unable to upload file
          this.record('error trying to upload file', this.current_upload_file);
          console.error(err);
          this.current_upload_file = null;
          this.uploading = false;
          return;
        })

      } else {
        // nothing to upload
        this.uploading = false;
        this.record('upload job finished');
        return;
      }
    });
  }

  rotateDataFile(fileuri, new_basename) {
    return new Promise((resolve, reject) => {
      fs.stat(fileuri, (err, stats) => {
        if (err) {
          // file access error - doesn't exist / bad perms  nothing to rotate
          this.record('no data file to rotate');
          return;
        }
        let now = moment(new Date()).format('YYYY-MM-DD_HHmmss');
        let newname = `${new_basename}.${now}`
        // ensure rotation directory exists
        this.createDir(path.join(this.base_log_dir, 'rotated')); 
        this.rotated_uri = path.join(this.base_log_dir, 'rotated', newname);
        fs.rename(fileuri, this.rotated_uri, (err) => {
          if (err) {
            this.record('error rotating data file', err);
            reject(err);
          }
          const inp = fs.createReadStream(this.rotated_uri);
          const out = fs.createWriteStream(this.rotated_uri+'.gz');
          const gzip = zlib.createGzip();
          inp.pipe(gzip).pipe(out);
          out.on('close', () => {
            this.record('finished write stream, deleting original file:', this.rotated_uri);
            fs.unlink(this.rotated_uri, (err) => {
              if (err) {
                this.record('error deleting rotated file', err);
                reject(err);
              }
              resolve(true);
            });
          });
          out.on('error', (err) => {
            reject(err);
          });
        });
      });
    })
  }

  record(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).format(this.date_format));
    let line = msgs.join(' ') + '\r\n';
    fs.appendFile(this.log_file_uri, line, (err) => {
      if (err) throw err;
    });
  }

  log(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).format(this.date_format));
  }

  serverCheckin() {
    try {
      this.record('checking in to server');
      this.compute_module.getDiskUsagePercent().then((usage) => {
        let postData = {
          modem: {
          imei: this.imei,
          sim: this.sim
          },
        }
        postData.module = this.compute_module.data();
        postData.module.disk_available = usage.available;
        postData.module.disk_total = usage.total;
        postData.gps = {
          lat: this.gps_info.lat,
          lng: this.gps_info.lon,
          time: this.gps_info.time,
        };
        postData.beep_count = this.beep_count_since_checkin;
        postData.unique_tags = this.unique_tags.size;
        postData.node_count = this.nodes.size;
        const payload = JSON.stringify(postData);
        const options = {
          hostname: this.hostname,
          port: this.port,
          path: this.server_checkin_url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
          }
        };
        const req = http.request(options, (res) => {
          res.setEncoding('utf8');
          if (res.statusCode == 204) {
            this.record('valid server checkin; reset beep count')
            this.beep_count_since_checkin = 0;
            this.unique_tags.clear();
            this.nodes.clear();
          }

        });
        req.on('error', (e) => {
          this.record(`checkin error: ${e.message}`)
        })
        req.write(payload);
        req.end();
      });

    } catch(err) {
      this.record('unable to checkin to server', err)
    }
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
      let port = this.radios[channel];
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: port,
        channel: channel
      });
      beep_reader.on('beep', (beep) => {
        this.handle_beep(beep); 
      });
      beep_reader.on('fw', (fw) => {
        this.log('fw query', fw);
        fw.msg_type = 'fw';
        this.broadcast(JSON.stringify(fw));
      });
      beep_reader.on('node-alive', (node_alive) => {
        this.handle_node_alive(node_alive);
      });
      beep_reader.on('node-beep', (node_beep) => {
        this.handle_node_beep(node_beep);
      });
      beep_reader.on('response', (res) => {
        this.record(`Radio ${res.channel} response: ${res.res}`)
      });
      beep_reader.start();
      beep_reader.on('open', (info) => {
        this.record('opened radio on port', info.port_uri);
        this.active_radios[info.port_uri] = info;
      });
      beep_reader.on('log', (msg) => {
        this.record('Beep Reader '+beep_reader.port_uri+' Log: '+msg);
      });
      beep_reader.on('close', (info) => {
        if (info.port_uri in Object.keys(this.active_radios)) {
        }
      });
      this.active_radios[channel] = beep_reader;
    });
    this.serverCheckin();
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
