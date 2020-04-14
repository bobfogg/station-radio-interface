class BeepStatManager {
  constructor() {
    this.stats = {
      channels: {}
    }
    for (let i=1; i<=5; i++) {
      this.addStatChannel(i);
    }
  }

  addStatChannel(channel) {
    console.log('adding stat channel', channel);
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
    if (Objects.keys(this.stats.telemetry).includes(record.Id)) {
      channel.telemetry[record.Id] += 1
    } else {
      channel.telemetry[record.Id] = 1;
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