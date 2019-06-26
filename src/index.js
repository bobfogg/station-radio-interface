import { BaseStation } from './server/base_station';

const DataFile = '/data/ctt.log';
const LogFile = '/data/sensor-station.log';

const station = new BaseStation({
  data_filename: DataFile,
  log_filename: LogFile,
  write_errors: false,
  flush_data_secs: 10,
  server_checkin_freq: 20
});
station.start({});
