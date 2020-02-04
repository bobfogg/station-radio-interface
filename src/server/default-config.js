export default {
    radios: [{
        channel: 1,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0",
        config: [
            "preset:tagfsk"
        ],
        record: true
    },{
        channel: 2,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.1:1.0",
        config: [
            "preset:tagfsk"
        ],
        record: true
    },{
        channel: 3,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.2:1.0",
        config: [
            "preset:tagfsk"
        ],
        record: true
    },{
        channel: 4,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0",
        config: [
            "preset:tagfsk"
        ],
        record: true
    },{
        channel: 5,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.4:1.0",
        config: [
            "preset:tagfsk"
        ],
        record: true
    }],
    record: {
        enabled: true,
        date_format: "YYYY-MM-DD HH:mm:ss",
        flush_data_cache_seconds: 30,
        base_log_directory: "/data",
        mobile: true
    },
    gps: {
        enabled: true,
        record: true,
        seconds_between_fixes: 60
    }
};