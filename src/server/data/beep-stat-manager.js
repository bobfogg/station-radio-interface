class BeepStatManager {
  constructor(opts) {
    this.radios = opts.radios;
    this.stats = {
      channels: {}
    }
    this.radios.forEach((radio) => {
      this.addStatChannel(radio.channel);
    });
  }

  addStatChannel(channel) {
    this.stats.channels[channel] = {
      beeps: {},
      nodes: {
        beeps: {},
        health: {}
      },
      telemetry: {},
    }
  }

  getChannel(record) {
    return this.stats.channels[record.RadioId];
  }

  addBeep(record) {
    let channel = this.getChannel(record);
    let beep_stats;
    if (record.NodeId.length > 0) {
      // from a node
      beep_stats = channel.nodes.beeps;
    } else {
      beep_stats = channel.beeps;
    }
    if (Object.keys(beep_stats).includes(record.TagId)) {
      beep_stats[record.TagId] += 1;
    } else {
      beep_stats[record.TagId] = 1;
    }
  }

  addTelemetryBeep(record) {
    let channel = this.getChannel(record);
    let hardware_id = record.Id;
    if (Object.keys(channel.telemetry).includes(hardware_id)) {
      channel.telemetry[hardware_id] += 1
    } else {
      channel.telemetry[hardware_id] = 1;
    }
  }

  addNodeHealth(record) {
    let channel = this.getChannel(record);
    let node_id = record.NodeId;
    delete record.NodeId;
    channel.nodes.health[node_id] = record;
  }

}
export { BeepStatManager };