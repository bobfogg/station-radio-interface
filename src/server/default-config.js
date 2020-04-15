export default {
    radios: [{
        channel: 1,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 2,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.1:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 3,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.2:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 4,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 5,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.4:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    }],
    http: {
        websocket_port: 8001,
        flush_websocket_messages_seconds: 1
    },
    record: {
        enabled: true,
        date_format: "YYYY-MM-DD HH:mm:ss",
        flush_data_cache_seconds: 5,
        checkin_frequency_minutes: 10,
        sensor_data_frequency_minutes: 1,
        rotation_frequency_minutes: 60,
        upload_frequency_minutes: 60,
        base_log_directory: "/data",
        mobile: false
    },
    gps: {
        enabled: true,
        record: true,
        seconds_between_fixes: 60
    }
};