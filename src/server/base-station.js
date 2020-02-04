import { RadioReceiver } from './radio-receiver';
import { SensorSocketServer } from './web-socket-server';
import {GpsClient } from './gps-client';
import { StationConfig } from './station-config';
import { Logger } from './data/logger';

const fs = require('fs');
const heartbeats = require('heartbeats');
const moment = require('moment');
const http = require('http');
const path = require('path');
const { spawn }  = require('child_process');

class BaseStation {
  constructor(config_filename) {
    this.config = new StationConfig(config_filename);
    this.active_radios = {};
    this.gps_client = new GpsClient({
      count_gps_records: 10
    });
    this.station_id;
    this.date_format;
    this.gps_logger;
  }

  init() {
    this.config.load().then((data) => {
      // loaded the config - now save it to disk
      this.config.save().catch((err) => {
        // there was an error saving this config file ... cannot handle persistent storage
        console.error(err);
        this.record('error saving config to disk');
      }).then(() => {

        this.date_format = this.config.data.record.date_format;
        this.station_id = this.getId();
        console.log(this.config.data.record);
        let base_log_dir = this.config.data.record.base_log_directory;
        this.gps_logger = new Logger({
          id: this.station_id,
          header: [
            'recorded at',
            'gps at',
            'latitude',
            'longitude',
            'altitude',
            'quality'
          ],
          base_path: base_log_dir,
          suffix: 'gps-data'
        });
        this.base_data_filename = `CTT-${this.station_id}-raw-data.csv`;
        this.data_file_uri = path.join(base_log_dir, this.base_data_filename);

        this.node_data_filename = `CTT-${this.station_id}-node-data.csv`;
        this.node_file_uri = path.join(base_log_dir, this.node_data_filename);

        this.log_filename = `sensor-station-${this.station_id}.log`;
        this.log_file_uri = path.join(base_log_dir, this.log_filename);

        this.gps_client.start();
        this.record('initializing base station');
        this.startWebsocketServer();
        this.startTimers();
        this.start();
      });
    });

  }

  startWebsocketServer() {
    this.sensor_socket_server = new SensorSocketServer({
      port: 8001
    });
    this.sensor_socket_server.on('cmd', (cmd) => {
      let line;
      switch (cmd.cmd) {
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
    this.heartbeat.createEvent(this.config.data.record.flush_data_cache_seconds, (count, last) => {
      if (this.record.enabled === true) {
        this.writeBeeps();
        this.writeNodes();
      }
    });
    if (this.config.data.gps.enabled === true) {
      if (this.config.data.gps.record === true) {
        this.heartbeat.createEvent(this.config.data.gps.seconds_between_fixes, (count, last) => {
          let line;

          let now = moment(new Date()).format(this.date_format);
          if (this.gps_client.latest_gps_fix) {
            // we have a fix
            let fix = this.gps_client.latest_gps_fix;
            line = [
              now,
              moment(fix.time).format(this.date_format),
              fix.lat,
              fix.lon,
              fix.alt,
              fix.mode
            ]
          } else {
            // no fix - add recorded at
            line = [
              now,
              null,
              null,
              null,
              null,
              null
            ]
          }
          this.gps_logger.addRecord(line);
          this.gps_logger.writeCacheToDisk();
        });
      }
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

  getRadioReport() {
    const radios = [];
    this.active_radios.forEach((port) => {
      radios.push(this.active_radios[port]);;
    })
    return radios;
  }

  start() {
    this.record('starting radio receivers');
    this.config.data.radios.forEach((radio) => {
      console.log('processing', radio);
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: radio.path,
        channel: radio.channel 
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
      this.active_radios[radio.channel] = beep_reader;
    });
  }
}

export { BaseStation };
