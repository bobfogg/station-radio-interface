import { BaseStation } from './server/base_station';

const station = new BaseStation({
  base_log_dir: '/data',
  record_data: true,
  write_errors: false,
  flush_data_secs: 30,
  server_checkin_freq: 60 * 60,
  update_screen_freq: 90,
  rotation_freq: 60 * 60,  // 60 minute rotation
  upload_freq: 61.3 * 60 * 2, // hourly
  gps_record_freq: 15 * 60,
  gps_rotation_freq: 60 * 60 * 12, // rotate every 12 hours
});
station.start({});
