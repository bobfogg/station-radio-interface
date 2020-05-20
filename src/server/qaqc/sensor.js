import { QaqcPacket } from './packet';

class SensorPacket {
  constructor(opts) {
    this.battery = opts.battery;
    this.solar = opts.solar;
    this.rtc = opts.rtc;
    this.temp_c = opts.temp_c;
    this.station_id = opts.station_id;

    this.packet = new QaqcPacket({
      category: 1,
      type: 3,
      station_id: this.station_id,
      payload: this.getPayload()
    })
  }

  convert(value) {
    return Math.round(value * 100);
  }

  getPayload() {
    let buffer = Buffer.alloc(8);
    console.log(this.convert(this.rtc));
    buffer.writeUInt16LE(this.convert(this.battery), 0);
    buffer.writeUInt16LE(this.convert(this.solar), 2);
    buffer.writeUInt16LE(this.convert(this.rtc), 4);
    buffer.writeUInt16LE(this.convert(this.temp_c+273.15), 6);
    return buffer;
  }
}

export { SensorPacket };