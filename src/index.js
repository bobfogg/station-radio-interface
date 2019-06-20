import { BaseStation } from './server/base_station';

const DataFile = '/data/ctt.log';
const LogFile = '/data/sensor-station.log';

const station = new BaseStation({
  data_filename: DataFile,
  log_filename: LogFile,
  write_errors: true,
  flush_data_secs: 10,
});
station.start({});
