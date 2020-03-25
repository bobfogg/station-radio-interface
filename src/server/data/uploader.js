const AWS = require('aws-sdk');
const EventEmitter = require('events');
const moment = require('moment');
const fs = require('fs');
const glob = require('glob');
const path = require('path');

class Uploader extends EventEmitter {
  /**
   * 
   * @param {*} opts.id - station id
   * @param {*} opts.credentials_uri - location to aws credentail file
   */
  constructor(opts) {
    super();
    this.id = opts.station_id;
    this.credentials_uri = opts.credentials_uri;
    this.bucket = 'ctt-motus-development';
    this.api_version = '2006-03-01';
    AWS.config.loadFromPath(this.credentials_uri);
    this.uploading = false; // flag to indicate if current upload in progress
  }

  /**
   * 
   * @param {*} opts.file_pattern - glob pattern of files to upload
   * @param {*} opts.delay - if exists - filter by files at least delay seconds
   *
   * only retrieve files that have been modified > 60 minutes ago
   */
  getFiles(opts) {
    return new Promise((resolve, reject) => {
      // get a list of filenames that match the pattern
      glob(opts.file_pattern, (err, filenames) => {
        if (err) {
          // glob error getting filenames
          reject(err);
        }
        // return list of sorted filenames, filtered by files at least > 60 minutes
        resolve(filenames.sort((a,b) => {
          if (a > b) {
            return 1;
          }
          if (a < b) {
            return -1;
          }
          return 0;
        }).filter((fileuri) => {
          fs.stat(fileuri, (err, stats) => {
            if (err) {
              // problem getting file details...
              reject(err);
              return;
            }
            if ((new Date() - stats.mtime) < opts.delay) {
              return false;
            }
            return true;
          });
        }));
      });
    });
  }

  uploadAll() {
    return new Promise((resolve) => {
      if (this.uploading == false) {
        this.uploading = true;
        this.getFilesToUpload()
        .then((res) => {
          console.log('got files to upload - starting with ctt files', res.ctt);
          return res.ctt.reduce((previous_promise, next_file) => {
            console.log('about to upload', next_file);
            return this.uploadCttFile(next_file);
          }, Promise.resolve())
          .then(() => {
            console.log('about to upload sg files', res.sg);
            return res.sg.reduce((previous_promise, next_file) => {
              return this.uploadSgFile(next_file);
            }, Promise.resolve());
          })
          .catch((err) => {
            console.error('error uploading data files...');
            console.error(err);
          })
          .finally(() => {
            console.log('finished uploading everything');
            resolve();
          });
          
        })
        .catch((err) => {
          // error getting files to upload
          console.error(err);
          resolve();
        });
      } else {
        // upload already in progress - don't do anything
        console.log('upload already in progress - not doing anything');
        resolve();
      }
    })
  }

  getFilesToUpload() {
    return this.getFiles({
      file_pattern: '/data/rotated/*.gz',
      delay: 0
    })
    .then((ctt_files) => {
      let sg_time_delay = 1000*60*61 // only retrive files modified > 1 hour
      this.getFiles('/data/SGdata/*/*.gz', sg_time_delay).then((sg_files) => {
        return Promise.resolve({
          'ctt': ctt_files,
          'sg': sg_files
        });
      });
    })
    .catch((err) => {
      console.error('something went wrong getting files');
      console.error(err);
      resolve({
        'ctt': [],
        'sg': []
      });
    });
  }

  uploadFile(opts) {
    // DEVELOPMENT AWS S3 Key Prefix - TEST
    let key = path.join('TEST', opts.key);
    return new Promise((resolve, reject) => {
      fetch('http://localhost:3000/led/diag/a', {
        method: 'POST',
        body: JSON.stringify({state: 'blink', blink_rate_ms: 100})
      }).then((res) => {
        console.log('LED response', res.json());
      });
      fs.readFile(opts.fileuri, (err, contents) => {
        if (err) {
          return reject(err);
        }
        let s3 = new AWS.S3({apiVersion: this.api_version});
        let params = {
          Bucket: this.bucket,
          Key: key,
          Body: contents
        };
        s3.putObject(params, (err, data) => {
          if (err) {
            reject(err);
            return
          }
          if (data.ETag) {
            let res = {
              fileuri: opts.fileuri,
              etag: data.ETag
            };
            resolve(res);
            return
          }
          console.log('BAD ETAG RESPONSE');
          reject('bad etag response');
          return
        });
      });
    });
  }

  stat(fileuri) {
    return new Promise((resolve, reject) => {
      fs.stat(fileuri, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stats);
      })
    });
  }

  uploadCttFile(filename) {
    return new Promise((resolve) => {
      this.stat(filename)
      .then((stats) => {
        let mtime = moment(stats.mtime);
        let key = ['tag-data', this.id, mtime.format('YYYY-MM-DD'), path.basename(filename)].join('/');
        this.uploadFile({
          fileuri: filename,
          key: key
        }).then((res) => {
          console.log('got response from upload file - passing it along', res);
          resolve(res);
        });
      });
    })
  }
}

export { Uploader };