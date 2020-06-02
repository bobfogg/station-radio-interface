const Uint64LE = require('int64-buffer').Uint64LE;
import { QaqcPacket } from './packet';

class GpsPacket {
  constructor(opts) {
    this.lat = opts.lat;
    this.lng = opts.lng;
    this.gps_time = opts.gps_time;
    this.mode = opts.mode;
    this.nsats = opts.nsats;
    this.station_id = opts.station_id;

    this.packet = new QaqcPacket({
      category: 1,
      type: 2,
      station_id: this.station_id,
      payload: this.getPayload()
    })
  }

  getTime() {
    let buffer;
    try {
      let date = new Date(this.gps_time);
      let ms = new Uint64LE(date.getTime().toString(), 10);
      buffer = ms.toBuffer();
    } catch(err) {
      console.error('error getting time', this.gps_time);
      console.error(err);
      buffer = Buffer.alloc(8);
    }
    return buffer;
  }

  getPayload() {
    let buffer = Buffer.alloc(10);

    if (this.mode) {
      buffer.writeInt32LE(Math.round(this.lat*1000000), 0);
      buffer.writeInt32LE(Math.round(this.lng*1000000), 4);
      buffer.writeUInt8(this.mode, 8);
      buffer.writeUInt8(this.nsats, 9);
    }
    return Buffer.concat([
      buffer,
      this.getTime()
    ]);
  }

}

export { GpsPacket };