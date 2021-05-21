# TDA7786 Node.JS Driver

# Requirements

* Connect I2C
* Connect RSTN to GPIO

## GPIO Permission Setting

```bash
$ sudo groupadd -r gpio
$ sudo usermod -a -G gpio,i2c <USERNAME>
$ sudo chown root:gpio /sys/class/gpio/*
$ sudo chmod 660 /sys/class/gpio/*

$ cat <<EOF | sudo tee /etc/udev/rules.d/gpio.rules
KERNEL=="gpiochip*", GROUP="gpio"
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", ACTION=="add", PROGRAM="/bin/sh -c 'chown root:gpio /sys/class/gpio/*; chmod 770 /sys/class/gpio; chmod 220 /sys/class/gpio/export /sys/class/gpio/unexport'"
SUBSYSTEM=="gpio", KERNEL=="gpio*", ACTION=="add", PROGRAM="/bin/sh -c 'chown root:gpio /sys%p/active_low /sys%p/direction /sys%p/edge /sys%p/value ; chmod 660 /sys%p/active_low /sys%p/direction /sys%p/edge /sys%p/value'"
EOF
```

# Usage

```typescript
import * as i2c from 'i2c-bus';
import {Driver, EliteAlignMode} from 'tda7786-driver';

i2c.openPromisified(1) // open i2c-1
  .then((bus) => {
    // 0x61 / 0x64
    const driver = new Driver(
        bus,
        0x61, // address
        4 // GPIO 4 - RSTN
    );
    driver.init()
      .then(() => driver.eliteCmdStartup(EliteAlignMode.AlignVCO_EUUSA))
      .then(() => console.log('init ok'))
      .catch((err) => console.error('init failed: ', err));
  });
...
```

# Thanks

* https://github.com/huashan2019/py1809

# License

Apache License 2.0