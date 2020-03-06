const path = require('path');
const fs = require('fs');

/**
 * generic logger class is intended receive data records, buffer to cache
 * and write to disk 
 */
class Logger {
  /**
   * @constructor
   * @param {string} opts.id - id of the station used to generate a filename
   * @param {string} opts.base_path - base directory to save data
   * @param {string} opts.suffix - suffix for station
   * @param {object} opts.formatter- data formatter with file header 
   *    formatter expected to have header field and a formatRecord method for translating records to file format
   */
  constructor(opts) {
    this.id = opts.id;
    this.base_path = opts.base_path;
    this.suffix = opts.suffix;
    this.formatter = opts.formatter;

    // check if a line termintaor is passed, otherwise default to windows \r\n
    this.line_terminator = '\r\n';
    if (opts.line_terminator) {
      this.line_terminator = opts.line_terminator;
    }

    // build file uri from id an ssuffix
    this.filename = `CTT-${this.id}-${this.suffix}.csv`;
    this.fileuri = path.join(this.base_path, this.filename);

    this.record_cache = [];
  }

  /**
   * 
   * @param {record} record to add to cache - in final write format
   */
  addRecord(record) {
    let line = this.formatter.formatRecord(record);
    if (line) {
      this.record_cache.push(line);
    }
  }

  /**
   * write cache to disk
   */
  writeCacheToDisk() {
    return new Promise((resolve, reject) => {
      let record, lines=[];
      while (this.record_cache.length > 0) {
        record = this.record_cache.shift();
        lines.push(record.join(','));
      }
      // if there are no lines to write - move on;
      if (lines.length > 0) {
        // if the file doesn't exist - write a header line
        if (!fs.existsSync(this.fileuri)) {
          lines.unshift(this.formatter.header.join(','));
        }
        fs.appendFile(this.fileuri, lines.join(this.line_terminator)+this.line_terminator, (err) => {
          if (err) {
            reject(err);
          }
          // finished writing
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export { Logger };