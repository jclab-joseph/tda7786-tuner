# TDA7786 Node.JS Driver

# Status

src/temp-develop.ts 파일을 실행하면 동작한다. 하지만 노이즈가 많이 끼고 소리가 매우 작게 들린다. 회로 문제일지도 모르겠지만 코드 문제에 더 가능성을 두고 있다. (회로가 문제 있을 가능성이 낮아서..)

protocol에 대한 정보가 거의 없어서 명령에 대한 성공 실패도 알기 어렵다.

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