const http = require('http');
const moment = require('moment');
const WebSocket = require('ws');

class SensorSocketServer {
  constructor(opts) {
    this.port = opts.port;
    this.protocol = 'beep-protocol';
    this.server = this.buildServer();
  }

  log(...msgs) {
    msgs = msgs.unshift(moment(new Date()));
  }

  broadcast(msg) {
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  buildServer() {
    const wss = new WebSocket.Server({
      port: this.port
    });
    return wss;
  }
};
 
export { SensorSocketServer };