import { QaqcPacket } from './packet';

/**
 * Compute Module Packet Data
 *  Serial 8 byte hex
 *  Hardware 8 byte char
 *  Revision 3 byte hex
 */
class ModuleIdPacket {
  constructor(opts) {
    this.station_id = opts.station_id;
    this.hardware = opts.hardware;
    this.serial = opts.serial;
    this.revision = opts.revision;

    this.packet = new QaqcPacket({
      category: 1,
      type: 6,
      station_id: this.station_id,
      payload: this.getPayload()
    })
  }

  getPayload() {
    // verify serial is 16 characters as expected - pad 0's if not
    let serial = this.serial.padStart(16, '0').slice(0,16);
    console.log(serial);
    let serial_buffer = Buffer.from(serial, 'hex');
    let hardware = this.hardware.padStart(8,' ');
    console.log(hardware);
    let hardware_buffer = Buffer.from(hardware);
    let revision = this.revision.padStart(6,'0').slice(0,6);
    console.log(revision);
    let revision_buffer = Buffer.from(revision, 'hex');
    return Buffer.concat([
      serial_buffer,
      hardware_buffer,
      revision_buffer
    ]);
  }
}

export { ModuleIdPacket };