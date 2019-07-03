import { BaseStation } from './server/base_station';

const station = new BaseStation({
  base_log_dir: '/data',
  record_data: true,
  write_errors: false,
  flush_data_secs: 30,
  server_checkin_freq: 61 * 60,
  update_screen_freq: 90,
  rotation_freq: 60 * 30, // 30 minute rotation
  upload_freq: 60 * 60, // hourly
});
station.start({});
