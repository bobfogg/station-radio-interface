import { FileManager } from './file-manager';
import { Logger } from './logger';
import { BeepFormatter } from './beep-formatter';
import { GpsFormatter } from './gps-formatter';
/**
 * manager class for incoming beep packets
 */
class DataManager {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.id = opts.id;
    this.base_log_dir = opts.base_log_dir;
    this.date_format = opts.date_format;

    this.file_manager = new FileManager({
      id: this.id,
      base_log_dir: this.base_log_dir
    });

    this.loggers = {
      beep: new Logger({
        fileuri: this.file_manager.getFileUri('raw-data'),
        formatter: new BeepFormatter({
          date_format: this.date_format
        }) 
      }),
      gps: new Logger({
        fileuri: this.file_manager.getFileUri('gps'),
        formatter: new GpsFormatter({
          date_format: this.date_format
        })
      })
    }
  }

  /**
   * write all the loggers cache to disk
   */
  writeCache() {
    Object.keys(this.loggers).forEach((key) => {
      let logger = this.loggers[key];
      logger.writeCacheToDisk();
    });
  }

  /**
   * 
   * @param {*} beep 
   */
  handleRadioBeep(beep) {
    this.loggers.beep.addRecord(beep);
  }

  /**
   * 
   * @param {*} record - GPS record
   */
  handleGps(record) {
    this.loggers.gps.addRecord(record);
  }
}

export { DataManager };