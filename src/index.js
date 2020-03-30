import { BaseStation } from './server/base-station';

const station = new BaseStation('/etc/ctt/station-config.json');
station.init({});
