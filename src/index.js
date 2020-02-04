import { BaseStation } from './server/base-station';

const station = new BaseStation('/etc/station-config.json');
station.init({});
