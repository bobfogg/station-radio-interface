const path = require('path');

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
}