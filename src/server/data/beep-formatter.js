const moment = require('moment');
/**
 * file formatter for GPS files
 */
class BeepFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'Time',
      'RadioId',
      'TagId',
      'TagRSSI',
      'NodeId'
    ];
    this.date_format = opts.date_format;
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let fields, node_id;
    let now = moment(new Date()).format(this.date_format);
    if (record.protocol) {
      if (record.source) {
        node_id = record.source.id;
      } else {
        node_id = '';
      }
      fields = [
        now,
        record.channel,
        record.data.id,
        record.meta.rssi,
        node_id
      ];
    } else {
      // console.error('i dont know what to do', record);
    }
    return fields;
  }
}

export { BeepFormatter };