const fs = require('fs');
const EventEmitter = require('events');
import default_config from './default-config';

class StationConfig {
    constructor(filename) {
        this.filename = filename;
        this.default_config = default_config;
        this.data;
    }

    pretty() {
        return JSON.stringify(this.data, null, 2);
    }

    load(filename) {
        return new Promise((resolve, reject) => {
            fs.readFile(filename ? filename : this.filename, (err, contents) => {
                if (err) {
                    /* cannot read config file from location */
                    resolve(this.loadDefaultConfig());
                }
                try {
                    this.data = JSON.parse(contents);
                    resolve(this.data);
                } catch(err) {
                    /* cannot read JSON */
                    this.data = this.loadDefaultConfig();
                    resolve(this.data);
                }

            });
        });
    }

    loadDefaultConfig() {
        return this.default_config;
    }

    save(filename) {
        return new Promise((resolve, reject) => {
            let contents = JSON.stringify(this.data, null, 2);
            fs.writeFile(filename ? filename : this.filename, contents, (err) => {
                if (err) {
                    console.error(err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
}

export { StationConfig };