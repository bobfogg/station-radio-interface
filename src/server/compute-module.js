import { resolve } from 'path';

const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

class ComputeModule {
  constructor() {
    this.filename = '/proc/cpuinfo'
    this.serial;
    this.hardware;
    this.revision;
    this.processors = [];
    this.parse();
  }

  getBootcount() {
    return parseInt(fs.readFileSync('/etc/bootcount'));
  }

  data() {
    return {
      bootcount: this.getBootcount(),
      hardware: this.hardware,
      serial: this.serial,
      revision: this.revision,
      loadavg_15min: os.loadavg()[2],
      free_mem : os.freemem(),
      total_mem : os.totalmem(),
      uptime: os.uptime()
    }
  }

  getDiskUsagePercent() {
    return new Promise((resolve) => {
      const df = spawn('df');
      let buffer = '';
      df.stdout.on('data', (data) => {
        buffer += data.toString();
      })
      df.on('close', (code) => {
        buffer.split('\n').forEach((line) => {
          if (line.search(/\/dev\/root/) != -1) {
            let vals = line.split(/\s+/);
            let space_total = parseInt(vals[1]);
            let space_available = parseInt(vals[3]);
            resolve({
              total: space_total,
              available: space_available
            });
          }
        })
        resolve();
      })
    })
  }

  parse() {
    let contents = fs.readFileSync(this.filename);
    let processor; // 
    contents.toString().split('\n').forEach((line) => {
      line = line.trim();
      let vals = line.split(':');
      if (vals.length == 2) {
        let key = vals[0].trim();
        let value = vals[1].trim();
        switch(key) {
          case 'processor':
            if (processor) {
              this.processors.push(processor);
            }
            processor = {};
            break;
          case 'Hardware':
            this.hardware = value;
            break;
          case 'Revision':
            this.revision = value;
            break;
          case 'Serial':
            this.serial = value;
            break;
          default:
            // assume it's a processor trait
            processor[key] = value;
            break;
        }
      }
    })
  }
}

export { ComputeModule };