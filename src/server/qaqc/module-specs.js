import { QaqcPacket } from './packet';
const moment = require('moment');

/**
 * Compute Module Spec Data
 *  Disk Space (kb)   : UInt32LE
 *  Total Memory (kb) : UInt32LE
 *  Image Date        : UInt16LE
 *  Softare Update    : UInt16LE
 */
class ModuleSpecsPacket {
  constructor(opts) {
    this.station_id = opts.station_id;
    // expected kb - bytes will overrun 32 bit uint
    this.total_memory = opts.total_memory;
    this.disk_size = opts.disk_size;
    this.image_date = opts.image_date;
    this.software_update = opts.software_update;

    this.packet = new QaqcPacket({
      category: 1,
      type: 7,
      station_id: this.station_id,
      payload: this.getPayload()
    })
  }

  getDaysFromEpoch(date) {
    let days = Math.round(date.getTime() / 1000 / 60.0 / 60.0 / 24.0);
    if (days < 0) {
      days = 0;
    }
    if (days > 65535) {
      days = 65535;
    }
    return days;
  }

  getPayload() {
    // verify serial is 16 characters as expected - pad 0's if not
    let disk_buffer = Buffer.alloc(4);
    disk_buffer.writeUInt32LE(this.disk_size);

    let memory_buffer = Buffer.alloc(4);
    memory_buffer.writeUInt32LE(this.total_memory);

    let date = new Date(this.image_date);
    let date_buffer = Buffer.alloc(2);
    date_buffer.writeUInt16LE(this.getDaysFromEpoch(date));

    let update = new Date(this.software_update);
    let update_buffer = Buffer.alloc(2);
    update_buffer.writeUInt16LE(this.getDaysFromEpoch(update));

    return Buffer.concat([
      disk_buffer,
      memory_buffer,
      date_buffer,
      update_buffer
    ]);
  }
}

export { ModuleSpecsPacket };