import { BaseStation } from './server/base_station';

const station = new BaseStation({
  base_log_dir: '/data',
  record_data: true,
  write_errors: false,
  flush_data_secs: 20,
  server_checkin_freq: 30,
  rotation_freq: 60 * 5,
});
station.start({});
