const moment = require('moment');
/**
 * file formatter for GPS files
 */
class GpsFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'recorded at',
      'gps at',
      'latitude',
      'longitude',
      'altitude',
      'quality'
    ];
    this.gps_precision = opts.gps_precision ? opts.gps_precision : 6;
    this.date_format = opts.date_format;
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let fields;
    let now = moment(new Date()).format(this.date_format);
    if (record) {
      fields = [
        now,
        moment(record.time).format(this.date_format),
        record.lat.toFixed(this.gps_precision),
        record.lon.toFixed(this.gps_precision),
        record.alt,
        record.mode
      ]
    } else {
      // no record - add recorded at
      fields = [
        now,
        null,
        null,
        null,
        null,
        null
      ];
    }
    return fields;
  }
}

export { GpsFormatter };