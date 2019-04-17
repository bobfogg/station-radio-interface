import { BaseStation } from './server/base_station';

const DataFile = '/data/ctt/ctt.log';
const LogFile = '/data/ctt/sensor-station.log';
const station = new BaseStation({
  data_filename: DataFile
});
station.start({});
