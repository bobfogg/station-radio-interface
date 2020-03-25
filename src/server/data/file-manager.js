const path = require('path');
const moment = require('moment');
const fs = require('fs');
const zlib = require('zlib');

/**
 * utility class for generating Filenames / Fileuris from the station id and base log directory
 */
export class FileManager {
  /**
   * 
   * @param {*} opts.id - base station id
   * @param {*} opts.base_log_dir - base log directory to store data files
   */
  constructor(opts) {
    this.id = opts.id;
    this.base_log_dir = opts.base_log_dir;
  }

  /**
   * 
   * @param {*} suffix - given file suffix, generate filename
   */
  getFileName(suffix) {
    return `CTT-${this.id}-${suffix}.csv`;
  }

  /**
   * 
   * @param {*} suffix - given file suffix, generate file uri
   */
  getFileUri(suffix) {
    let filename = this.getFileName(suffix);
    return path.join(this.base_log_dir, filename);
  }

  /**
   * 
   * @param {*} filename - data file to copmress
   */
  compress(uri) {
    return new Promise((resolve, reject) => {
      // compress the data
      const inp = fs.createReadStream(uri);
      let outfilename = uri+'.gz';
      const out = fs.createWriteStream(outfilename);
      const gzip = zlib.createGzip();
      inp.pipe(gzip).pipe(out);
      out.on('close', () => {
        // finished compressing
        resolve(outfilename);
      });
      out.on('error', (err) => {
        // error with compressin stream
        reject(err);
      });
    });

  }

  /**
   * 
   * @param {*} fileuri 
   */
  rotateUpload(fileuri) {
    return new Promise((resolve, reject) => {
      let basename = path.posix.basename(fileuri);
      let new_directory = path.join('/', 'data', 'uploaded');
      let newuri = path.join(new_directory, basename);
      console.log('rotating to', newuri, 'from', fileuri);

      // make sure uploaded directory exists
      fs.mkdirSync(new_directory, {
        recursive: true
      });

      // move to the uploaded uri
      fs.rename(fileuri, newuri, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(newuri);
      });
    });
  }

  /**
   * 
   * @param {opts.fileuri} fileuri 
   * @param {opts.new_basename} new_basename 
   */
  rotateDataFile(opts) {
    return new Promise((resolve, reject) => {
      // append date as suffix to data file
      let now = moment(new Date()).format('YYYY-MM-DD_HHmmss');
      let newname = `${opts.new_basename.replace('.csv','')}.${now}.csv`
      let rotated_uri = path.join(this.base_log_dir, 'rotated', newname);

      // ensure the rotated directory exists
      fs.mkdirSync(path.join(this.base_log_dir, 'rotated'), {
        recursive: true
      });

      // check if the file exists before rotating
      fs.access(opts.fileuri, (err) => {
        if (err) {
          // file does not exist
          console.log('file does not exist - resolving false', opts.fileuri);
          resolve(false);
          return;
        }
        // file exists
        fs.rename(opts.fileuri, rotated_uri, (err) => {
          if (err) {
            // cannot rename
            reject(err);
            return;
          }
          this.compress(rotated_uri).then((compressed_file_uri) => {
            // compression is complete 
            fs.unlink(rotated_uri, (err) => {
              // delete file
              if (err) {
                // error deleting file
                reject(err);
                return;
              }
              // complete
              resolve(compressed_file_uri);
            })
          }).catch((err) => {
            reject(err);
          });
        });
      });
    });
  }
}