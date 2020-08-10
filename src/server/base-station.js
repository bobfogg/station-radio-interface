import { RadioReceiver } from './radio-receiver';
import { SensorSocketServer } from './http/web-socket-server';
import { GpsClient } from './gps-client';
import { StationConfig } from './station-config';
import { DataManager } from './data/data-manager';
import { ServerApi } from './http/server-api';
import { StationLeds } from './led/station-leds';
import { QaqcReport }  from './qaqc/report';
const fetch = require('node-fetch');
const { spawn } = require('child_process');
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
    this.station_leds = new StationLeds();
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
    // record the date/time the station is started
    this.begin = moment(new Date()).utc();
    this.heartbeat = heartbeats.createHeart(1000);
    this.server_api = new ServerApi();
  }

  /**
   * 
   * @param  {...any} msgs wrapper for data logger
   */
  stationLog(...msgs) {
    this.data_manager.log(msgs);
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
        this.stationLog('error saving config to disk');
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
            flush_data_cache_seconds: this.config.data.record.flush_data_cache_seconds,
            radios: this.config.data.radios
          });

          this.log_filename = `sensor-station-${this.station_id}.log`;
          this.log_file_uri = path.join(base_log_dir, this.log_filename);

          this.gps_client.start();
          this.stationLog('initializing base station');
          this.startWebsocketServer();
          this.startTimers();
          this.startRadios();
          this.toggleLeds();
        });
      });
    });
  }

  toggleRadioMode(opts) {
    if (opts.channel in Object.keys(this.active_radios)) {
      this.stationLog(`toggling ${opts.mode} mode on channel ${opts.channel}`);
      let radio = this.active_radios[opts.channel];
      this.config.toggleRadioMode({
        channel: opts.channel,
        cmd: radio.preset_commands[opts.mode]
      });
      radio.issuePresetCommand(opts.mode)
    } else {
      this.stationLog(`invalid radio channel ${opts.channel}`);
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
      switch (cmd.cmd) {
        case('toggle_radio'):
          let channel = cmd.data.channel;
          this.toggleRadioMode({
            channel: channel,
            mode: cmd.data.type
          });
          break;
        case('stats'):
          let stats = this.data_manager.stats.stats;
          stats.msg_type = 'stats';
          this.broadcast(JSON.stringify(stats));
          break;
        case('checkin'):
          this.checkin();
          break;
        case('upload'):
          this.runCommand('upload-station-data');
          break
        case('update-station'):
          this.runCommand('update-station');
          break;

        case('qaqc'):
          this.qaqc();
          break;
        case('about'):
          fetch('http://localhost:3000/about')
            .then(res => res.json()) 
            .then((json) =>  {
              let data = json;
              data.station_id = this.station_id;
              data.msg_type = 'about';
              data.begin = this.begin;
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
      this.stationLog(`client connected from IP: ${ip}`);
    })
  }

  /**
   * 
   * @param {*} cmd - run a given bash command and pipe output to web socket
   */
  runCommand(cmd) {
    const command_process = spawn(cmd);
    this.stationLog('running command', cmd);
    command_process.stdout.on('data', (data) => {
      let msg = {
        data: data.toString(),
        msg_type: 'log'
      }
      this.stationLog(data);
      this.broadcast(JSON.stringify(msg));
    });
    command_process.stderr.on('data', (data) => {
      let msg = {
        data: data.toString(),
        msg_type: 'log'
      }
      this.stationLog('stderr', data);
      this.broadcast(JSON.stringify(msg));
    });
    command_process.on('close', (code) => {
      this.stationLog('finished running', cmd, code);
    });
    command_process.on('error', (err) => {
      console.error('command error');
      console.error(err);
      this.stationLog('command error', err.toString())
    })
  }

  /**
   * run qaqc - send diagnostics over radio
   */
  qaqc() {
    this.log('init QAQC report');
    // use radio 1
    let radio = this.active_radios[1];
    let stats = this.data_manager.stats.stats;
    let report = new QaqcReport({
      station_id: this.station_id,
      stats: stats.channels
    });
    report.getResults().then((results) => {
      let packets = report.generatePackets(results);
      let cmds = [];
    
      Object.keys(packets).forEach((key) => {
        let packet = packets[key];
        let msg = packet.packet.base64();
        cmds.push('tx:'+msg);
      });
      radio.issueCommands(cmds);
    });
  }

  /**
   * checkin to the server
   */
  checkin() {
    this.stationLog('server checkin initiated');
    this.server_api.checkInternet()
      .then((internet_status) => {
      if (internet_status == true) {
        // we have internet - check into server
        this.server_api.healthCheckin(this.data_manager.stats.stats)
        .then((response) => {
          if (response == true) {
            this.stationLog('server checkin success');
          } else {
            this.stationLog('checkin failed');
          }
        })
        .catch((err) => {
          this.stationLog('server checkin error', err.toString());
        });
      } else {
        this.stationLog('no internet - ignoring server checkin');
      }
    });
  }

  /**
   * control on-board LEDs
   */
  toggleLeds() {
    this.station_leds.toggleAll(this.gps_client.latest_gps_fix);
  }

  /**
   * 
   */
  writeAliveMsg() {
    this.stationLog('alive');
  }

  /**
   * 
   */
  pollSensors() {
    this.stationLog('polling sensor data');
    try {
      this.server_api.pollSensors();
    } catch(err) {
      this.stationLog(`error polling sensor data ${err.toString()}`);
    }
  }

  rotateDataFiles() {
    this.stationLog('rotating data files');
    this.data_manager.rotate()
    .then(() => {
      this.stationLog('rotation finished');
    })
    .catch((err) => {
      this.stationLog(`error rotating data files: ${err}`);
    });
  }

  /**
   * start timers for writing data to disk, collecting GPS data
   */
  startTimers() {
    // start data rotation timer
    // checkin after 10 seconds of station running
    setTimeout(this.checkin.bind(this), 10000);
    // this.heartbeat.createEvent(5, this.qaqc.bind(this));
    this.heartbeat.createEvent(this.config.data.record.rotation_frequency_minutes*60, this.rotateDataFiles.bind(this));
    this.heartbeat.createEvent(this.config.data.record.sensor_data_frequency_minutes*60, this.pollSensors.bind(this));
    this.heartbeat.createEvent(this.config.data.record.checkin_frequency_minutes*60, this.checkin.bind(this));
    this.heartbeat.createEvent(this.config.data.led.toggle_frequency_seconds, this.toggleLeds.bind(this));
    this.heartbeat.createEvent(this.config.data.record.alive_frequency_seconds, this.writeAliveMsg.bind(this));
    if (this.config.data.record.enabled === true) {
      // start data write to disk timer
      this.heartbeat.createEvent(this.config.data.record.flush_data_cache_seconds, this.data_manager.writeCache.bind(this.data_manager));
      if (this.config.data.gps.enabled === true) {
        if (this.config.data.gps.record === true) {
          // start gps timer
          this.heartbeat.createEvent(this.config.data.gps.seconds_between_fixes, (count, last) => {
            this.stationLog('recording GPS fix');
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
   * @param  {...any} msgs - broadcast data across web socket server
   */
  log(...msgs) {
    this.broadcast(JSON.stringify({'msg_type': 'log', 'data': msgs.join(' ')}));
    msgs.unshift(moment(new Date()).utc().format(this.date_format));
  }

  /**
   * start the radio receivers
   */
  startRadios() {
    this.stationLog('starting radio receivers');
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
        this.stationLog('opened radio on port', radio.channel);
        this.active_radios[info.port_uri] = info;
        beep_reader.issueCommands(radio.config);
      });
      beep_reader.on('write', (msg) => {
        this.stationLog(`writing message to radio ${msg.channel}: ${msg.msg}`);
      });
      beep_reader.on('error', (err) => {
        this.stationLog(`radio error on channel ${radio.channel};  ${err}`);
      });
      beep_reader.on('close', (info) => {
        this.stationLog(`radio closed ${radio.channel}`);
        if (info.port_uri in Object.keys(this.active_radios)) {
        }
      });
      beep_reader.start(1000);
      this.active_radios[radio.channel] = beep_reader;
    });
  }
}

export { BaseStation };
