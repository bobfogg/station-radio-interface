import { BaseStation } from './server/base_station';

const station = new BaseStation({
  base_log_dir: '/data', // 
  record_data: true, // future option to toggle data logging
  write_errors: false,
  flush_data_secs: 30, // flush data to file ever 30 secs
  server_checkin_freq: 3 * 60 * 60, // 3 hour server checkins
  update_screen_freq: 90, //90 sec screen update
  rotation_freq: 60 * 60,  // 60 minute rotation
  upload_freq: 61.3 * 60 * 2, // hourly
  gps_record_freq: 15 * 60, // 15 minute GPS fix
  gps_rotation_freq: 60 * 60 * 12, // rotate every 12 hours
});
station.init({});
