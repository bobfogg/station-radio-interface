const fs = require('fs');
import default_config from './default-config';

class StationConfig {
    constructor(filename) {
        if (filename) {
            this.data = this.load(filename);
        } else {
            this.data = this.loadDefaultConfig();
        }
    }

    pretty() {
        return JSON.stringify(this.data, null, 2);
    }

    load(filename) {
        return new Promise((resolve, reject) => {
            let contents = fs.readFileSync(filename);
            let data;
            try {
                data = JSON.parse(contents);
                resolve(data);
            } catch(err) {
                reject(err);
            }
        });
    }

    loadDefaultConfig() {
        return default_config;
    }

    write(filename) {
        return new Promise((resolve, reject) => {
            let logfilename = this.filename;
            if (filename) {
                // if provided - write to filename
                logfilename = filename;
            }
            let contents = JSON.stringify(this.data, null, 2);
            fs.writeFile(filename, contents, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
}

export { StationConfig };