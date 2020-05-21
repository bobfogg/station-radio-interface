class QaqcPacket {
  /**
   * opts.category
   * opts.type
   * opts.payload - Buffer of bytes for payload to send
   */
  constructor(opts) {
    this.prefix = 'SS';
    this.category = opts.category;
    this.type = opts.type;
    this.station_id = Buffer.from(opts.station_id, 'hex');
    this.payload = opts.payload;
  }

  /**
   * header of the packet includes category, type, payload length
   */
  getHeader() {
    let buffer = Buffer.alloc(3);
    buffer.writeInt8(this.category, 0);
    buffer.writeInt8(this.type, 1);
    buffer.writeInt8(this.station_id.length+this.payload.length, 2);
    return Buffer.concat([
      buffer,
      this.station_id
    ])
  }

  /**
   * fletcher checksum
   * https://en.wikipedia.org/wiki/Fletcher%27s_checksum 
   */
  getChecksum() {
    let checksum_a = 0, checksum_b = 0;
    let checksum_payload = Buffer.concat([this.getHeader(), this.payload]);
    checksum_payload.forEach((b) => {
      checksum_a = (checksum_a + b) % 255;
      checksum_b = (checksum_b + checksum_a) % 255;
    });
    let result = (checksum_b << 8) | checksum_a;

    let buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(result,0);
    return buffer;
  }

  /**
   * generate the byte array for the message packet
   */
  getMessageBytes() {
    return Buffer.concat([
      Buffer.from(this.prefix), 
      this.getHeader(), 
      this.payload, 
      this.getChecksum()
    ]);
  }

  base64() {
    let bytes = this.getMessageBytes();
    return bytes.toString('base64');
  }
}

export { QaqcPacket };