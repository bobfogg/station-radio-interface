const EventEmitter = require('events');
const moment = require('moment');
const WebSocket = require('ws');

class SensorSocketServer extends EventEmitter {
  constructor(opts) {
    super();
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

    wss.on('connection', (ws, req) => {
      let ip
      try {
        ip = req.connection.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
      } catch(err) {
        ip = req.connection.remoteAddress;
      }
      this.emit('client_conn', ip);
      ws.on('message', (msg) => {
        let data = JSON.parse(msg);
        let msg_type = data.msg_type;
        delete data.msg_type;
        this.emit(msg_type, data);
      });
    });
    return wss;
  }
};
 
export { SensorSocketServer };