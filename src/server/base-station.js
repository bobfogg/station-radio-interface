import { RadioReceiver } from './radio-receiver';
import { SensorSocketServer } from './http/web-socket-server';
import { GpsClient } from './gps-client';
import { StationConfig } from './station-config';
import { DataManager } from './data/data-manager';
const fetch = require('node-fetch');

const fs = require('fs');
const heartbeats = require('heartbeats');
const moment = require('moment');
const path = require('path');
const _ = require('lodash');

/**
 * manager class for controlling / reading radios
 * and writing to disk
 */
class BaseStation {
  /**
   * 
   * @param {*} config_filename - string filename used to persist changes / control behaviour
   */
  constructor(config_filename) {
    this.config = new StationConfig(config_filename);
    this.active_radios = {};
    this.gps_client = new  GpsClient({
      max_gps_records: 50
    });
    this.gps_client.on('3d-fix', (fix) => {
      fix.msg_type = 'gps';
      let data = this.gps_client.info();
      data.msg_type = 'gps';
      this.broadcast(JSON.stringify(data));
    });
    this.station_id;
    this.date_format;
    this.gps_logger;
    this.data_manager;
    this.heartbeat = heartbeats.createHeart(1000);
  }

  /**
   * load config - start the data manager, gps client, web socket server, timers, radios
   */
  init() {
    this.config.load().then((data) => {
      // merge default config with current config if there are missing fields
      this.config.data = _.merge(this.config.default_config, this.config.data);
      // loaded the config - now save it to disk
      this.config.save().catch((err) => {
        // there was an error saving this config file ... cannot handle persistent storage
        console.error(err);
        this.record('error saving config to disk');
      }).then(() => {
        this.date_format = this.config.data.record.date_format;
        // config loaded / merged with defaults / saved to disk - start the software
        this.getId().then((id) => {
          // read ID from file
          this.station_id = id;
          let base_log_dir = this.config.data.record.base_log_directory;
          this.data_manager = new DataManager({
            id: this.station_id, 
            base_log_dir: base_log_dir,
            date_format: this.date_format,
            flush_data_cache_seconds: this.config.data.record.flush_data_cache_seconds
          });

          this.log_filename = `sensor-station-${this.station_id}.log`;
          this.log_file_uri = path.join(base_log_dir, this.log_filename);

          this.gps_client.start();
          this.record('initializing base station');
          this.startWebsocketServer();
          this.startTimers();
          this.startRadios();
        });
      });
    });
  }

  toggleRadioMode(opts) {
    if (opts.channel in Object.keys(this.active_radios)) {
      this.record(`toggling ${opts.mode} mode on channel ${opts.channel}`);
      let radio = this.active_radios[opts.channel];
      this.config.toggleRadioMode({
        channel: opts.channel,
        cmd: radio.preset_commands[opts.mode]
      });
      radio.issuePresetCommand(opts.mode)
    } else {
      this.record(`invalid radio channel ${opts.channel}`);
    }
  }

  /**
   * start web socket server
   */
  startWebsocketServer() {
    this.sensor_socket_server = new SensorSocketServer({
      port: this.config.data.http.websocket_port
    });
    this.sensor_socket_server.on('cmd', (cmd) => {
      let line;
      switch (cmd.cmd) {
        case('toggle_radio'):
          let channel = cmd.data.channel;
          this.toggleRadioMode({
            channel: channel,
            mode: cmd.data.type
          });
          break;
        case('about'):
          fetch('http://localhost:3000/about')
            .then((response) => {
              return response.json();
            })
            .then((res) =>  {
              let data = res;
              console.log('ABOUT', data);
              data.station_id = this.station_id;
              data.msg_type = 'about';
              this.broadcast(JSON.stringify(data));
            })
            .catch((err) => {
              console.log('unable to request info from hardware server');
              console.error(err);
            });
          break;
        default:
          break;
        }
    });
    this.sensor_socket_server.on('client_conn', (ip) => {
      this.log(`client connected from IP: ${ip}`);
    })
  }

  /**
   * start timers for writing data to disk, collecting GPS data
   */
  startTimers() {
    // start data rotation timer
    this.heartbeat.createEvent(this.config.data.record.rotation_frequency_minutes*60, this.data_manager.rotate.bind(this.data_manager));
    if (this.config.data.record.enabled === true) {
      // start data write to disk timer
      this.heartbeat.createEvent(this.config.data.record.flush_data_cache_seconds, this.data_manager.writeCache.bind(this.data_manager));
      if (this.config.data.gps.enabled === true) {
        if (this.config.data.gps.record === true) {
          // start gps timer
          this.heartbeat.createEvent(this.config.data.gps.seconds_between_fixes, (count, last) => {
            this.data_manager.handleGps(this.gps_client.info());
          });
        }
      }
    }
  }
  
  /**
   * get base station id
   */
  getId() {
    return new Promise((resolve, reject) => {
      // load id from static json
      fs.readFile('/etc/ctt/station-id', (err, contents) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          resolve(contents.toString().trim());
        } catch(err) {
          console.error(err);
          reject(err);
        }
      });
    });
  }

  /**
   * 
   * @param {*} msg - message to broadcast across the web socket server
   */
  broadcast(msg) {
    if (this.sensor_socket_server) {
      this.sensor_socket_server.broadcast(msg);
    }
  }

  /**
   * 
   * @param  {...any} msgs - write data to log and broadcast across web socket server
   */
  record(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).utc().format(this.date_format));
    let line = msgs.join(' ') + '\r\n';
    try {
      fs.appendFileSync(this.log_file_uri, line);
    } catch(err) {
      console.error(err);
    }
  }

  /**
   * 
   * @param  {...any} msgs - broadcast data across web socket server
   */
  log(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).utc().format(this.date_format));
  }

  getStationConfig() {

  }

  /**
   * start the radio receivers
   */
  startRadios() {
    this.record('starting radio receivers');
    this.config.data.radios.forEach((radio) => {
      let beep_reader = new RadioReceiver({
        baud_rate: 115200,
        port_uri: radio.path,
        channel: radio.channel 
      });
      beep_reader.on('beep', (beep) => {
        //console.log(beep);

        this.data_manager.handleRadioBeep(beep);
        beep.msg_type = 'beep';
        this.broadcast(JSON.stringify(beep));
      });
      beep_reader.on('open', (info) => {
        this.record('opened radio on port', info.port_uri);
        this.active_radios[info.port_uri] = info;
        beep_reader.issueCommands(radio.config);
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
