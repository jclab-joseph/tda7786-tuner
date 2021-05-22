/*
  Copyright (c) 2021 JC-Lab <development@jc-lab.net>
  Apache License 2.0
 */

import * as i2c from 'i2c-bus';
import {Driver} from './driver';
import {EliteAlignMode, EliteReadBandCode} from './enums';

i2c.openPromisified(1)
  .then((bus) => {
    // 0x61 / 0x64
    const driver = new Driver(bus, 0x61, 4);
    driver.init()
      .then(() => driver.eliteCmdStartup(EliteAlignMode.AlignVCO_EUUSA))
      .then(() => driver.tunerChangeFMFreq(931000))
      .then(() => driver.eliteCmdChangeFreq(931000))
      .then(() => {
        setInterval(() => {
          driver.eliteCmdReadTunnerStatus(EliteReadBandCode.FM)
            .then((res) => console.log(res));
        }, 1000);
      })
      .catch((err) => console.error('init failed: ', err));
  });

