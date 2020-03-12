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
      'NodeId',
      'Validated'
    ];
    this.date_format = opts.date_format;
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let fields, node_id, recorded_at;
    let validated = 0;
    let tag_id = record.data.id;
    if (record.protocol) {
      // handle new protocol
      if (record.meta.source) {
        // get the node id, and get the recorded at date from the device
        node_id = record.meta.source.id;
        recorded_at = moment(new Date(record.data.rec_at*1000));
      } else {
        // beep on the radio - use the time it was received
        node_id = '';
        recorded_at = record.received_at;
      }
      if (tag_id.length == 10) {
        // tag includes a CRC - validated by device
        tag_id = tag_id.slice(0,tag_id.length-2);
        validated = 1;
      }
      fields = [
        recorded_at.format(this.date_format),
        record.channel,
        tag_id,
        record.meta.rssi,
        node_id,
        validated
      ];
    } else {
      // handle original protocol
      if (record.data.tag) {
        // beep received at radio
        fields = [
          record.received_at.format(this.date_format),
          record.channel,
          record.data.tag.id,
          record.rssi,
          '',
          validated
        ];
      } else if  (record.data.node_beep) {
        // beep received by a node
        fields = [
          record.received_at.format(this.date_format),
          record.channel,
          record.data.node_tag.tag_id,
          record.data.node_beep.tag_rssi,
          record.data.node_beep.id,
          validated
        ];
      } else {
        console.error(`i don't know what to do ${record}`);
        fields = null;
      }
    }
    return fields;
  }
}

export { BeepFormatter };