import { BaseStation } from './server/base_station';

const station = new BaseStation({
    radios: [
        '/dev/ttyACM0',
        '/dev/ttyACM1',
        '/dev/ttyACM2',
        '/dev/ttyACM3'
    ]
});
station.start();