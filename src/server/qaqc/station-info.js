import { QaqcPacket } from './packet';
const Uint64LE = require('int64-buffer').Uint64LE;

class StationInfoPacket {
  constructor(opts) {
    this.station_id = opts.station_id;
    this.imei = opts.imei;
    this.sim = opts.sim;
    this.packet = new QaqcPacket({
      category: 1,
      type: 1,
      payload: this.getPayload(),
      station_id: this.station_id
    });
  }

 getPayload() {
    let imei = new Uint64LE(this.imei, 10);
    let sim = new Uint64LE(this.sim, 10);
    return Buffer.concat([
      imei.toBuffer(),
      sim.toBuffer()
    ])
  }

}

export { StationInfoPacket };