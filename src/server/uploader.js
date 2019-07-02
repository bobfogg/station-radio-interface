import { S3 } from 'aws-sdk/clients/s3';
const AWS = require('aws-sdk');
const EventEmitter = require('events');
const moment = require('moment');
const fs = require('fs');
const glob = require('glob');
const path = require('path');

class Uploader extends EventEmitter {
  constructor(id) {
    super();
    AWS.config.loadFromPath("/etc/ctt.conf");
    this.id = id;
    this.bucket = 'ctt-motus-development';
    this.api_version = '2006-03-01';
  }

  getFiles(file_pattern) {
    return new Promise((resolve, reject) => {
      glob(file_pattern, (err, filenames) => {
        if (err) {
          reject(err);
        }
        resolve(filenames.sort((a,b) => {
          if (a > b) {
            return 1;
          }
          if (a < b) {
            return -1;
          }
          return 0;
        }).filter((filename) => {
          let stats = fs.statSync(filename);
          if ((new Date() - stats.mtime) < 1000*60*61) {
            // filter out files that have been modified within 61 minutes
            return false;
          }
          return true;
        }));
      });
    });
  }

  getFilesToUpload() {
    return new Promise((resolve) => {
      this.getFiles('/data/rotated/*.gz').then((ctt_files) => {
        this.getFiles('/data/SGdata/*/*.gz').then((sg_files) => {
          resolve({
            'ctt': ctt_files,
            'sg': sg_files
          });
        });
      });
    })
  }

  uploadSgFile(filename) {
    let stats = fs.statSync(filename);
    let mtime = moment(stats.mtime);
    let key = ['ctt', 'data', path.basename(filename)].join('/');
    return new AWS.S3({apiVersion: this.api_version}).putObject({
      Bucket: this.bucket,
      Key: key,
      Body: fs.createReadStream(filename)
    }).promise();
  }

  uploadCttFile(filename) {
    let stats = fs.statSync(filename);
    let mtime = moment(stats.mtime);
    let key = ['tag-data', this.id, mtime.format('YYYY-MM-DD'), path.basename(filename)].join('/');
    return new AWS.S3({apiVersion: this.api_version}).putObject({
      Bucket: this.bucket,
      Key: key,
      Body: fs.createReadStream(filename)
    }).promise();
  }
}

export { Uploader };