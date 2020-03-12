const moment = require('moment');
/**
 * file formatter for GPS files
 */
class NodeHealthFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'Time',
      'RadioId',
      'NodeId',
      'NodeRSSI',
      'Battery',
      'Celsius',
      'RecordedAt',
      'Firmware',
      'SolarVolts',
      'SolarCurrent',
      'CumulativeSolarCurrent',
      'Latitude',
      'Longitude'
    ];
    this.date_format = opts.date_format;
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let node_id;
    // check for new protocol 
    if (record.protocol) {
      // new protocol detected - check if a node origin
      if (record.meta.source) {
        node_id = record.meta.source.id;
      }
      if (node_id == null) {
        console.error('no node id in record', record);
        return;
      }
      let recorded_at = moment(new Date(record.data.sent_at*1000));
      return [
        record.received_at.format(this.date_format),
        record.channel,
        node_id,
        record.meta.rssi,
        record.data.bat_v / 100,
        record.data.temp_c,
        recorded_at.format(this.date_format),
        record.data.fw,
        record.data.sol_v,
        record.data.sol_ma,
        record.data.sum_sol_ma,
        record.data.lat ? record.data.lat / 1000000 : '',
        record.data.lon ? record.data.lon / 1000000 : '' 
      ];
    } else {
      if (record.data.node_alive == null) {
        console.error('invalid node health message', record);
        return;
      }
      let fields = [
        record.received_at.format(this.date_format),
        record.channel,
        record.data.node_alive.id,
        record.rssi,
        record.data.node_alive.battery_mv / 1000,
        record.data.node_alive.celsius, 
        '',
        record.data.node_alive.firmware,
        '',
        '',
        '',
      ]
      return fields;
    }
  }
}

export { NodeHealthFormatter };