import { QaqcPacket } from './packet';
const Uint64LE = require('int64-buffer').Uint64LE;

class HardwarePacket {
  constructor(opts) {
    this.station_id = opts.station_id;
    this.usb_hub_count = opts.usb_hub_count;
    this.radio_count = opts.radio_count;
    this.system_time = opts.system_time;

    this.packet = new QaqcPacket({
      category: 1,
      type: 4,
      station_id: this.station_id,
      payload: this.getPayload()
    })
  }

  getPayload() {
    let buffer = Buffer.alloc(2)
    buffer.writeUInt8(this.usb_hub_count, 0);
    buffer.writeUInt8(this.radio_count, 1);
    let date_buffer;
    try {
      let date = new Date(this.system_time);
      let ms = new Uint64LE(date.getTime().toString(), 10);
      date_buffer = ms.toBuffer();
    } catch(err) {
      console.error('invalid date for hardware qaqc packet', this.system_time);
      console.error(err);
      date_buffer = Buffer.alloc(8);
    }
    return Buffer.concat([
      buffer,
      date_buffer
    ]);
  }
}

export { HardwarePacket };