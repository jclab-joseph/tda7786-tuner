/*
  Copyright (c) 2021 JC-Lab <development@jc-lab.net>
  Apache License 2.0
 */

import * as i2c from 'i2c-bus';
import {PromisifiedBus} from 'i2c-bus';
import {Gpio} from 'onoff';

import {AMFEReg, FMCustomWSPData, FMFEReg, i2cBootData, WXFEReg} from './const-datas';

import {EliteAlignMode, EliteChangeBandCode, EliteCmdCode, EliteDataMode, EliteReadBandCode} from './enums';
import {TunnerFMStatus} from './model';

function clearArray(dest: number[]) {
  while (dest.length > 0) {
    dest.shift();
  }
}

function bufferToNumberArray(buf: Buffer): number[] {
  const out: number[] = new Array<number>(buf.byteLength);
  buf.forEach((v, i) => out[i] = v);
  return out;
}

function sleepUs(count: number): Promise<void> {
  return Promise.resolve();
}

function sleepMs(count: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, count);
  });
}

function numberArrayToHex(data: number[]): string {
  return Buffer.from(data).toString('hex');
}

export class Driver {
  private readonly _i2cBus: PromisifiedBus;
  private readonly _i2cAddress: number;
  private readonly _rstnGpio: Gpio;

  private _flagTDBusy: boolean = false;
  private _flagTDColl: boolean = false;
  private _flagSeqChg: boolean = false;

  public constructor(i2cBus: PromisifiedBus, i2cAddress: number, rstnGpio: Gpio | number) {
    this._i2cBus = i2cBus;
    this._i2cAddress = i2cAddress;
    if (typeof rstnGpio === 'number') {
      this._rstnGpio = new Gpio(rstnGpio, 'out');
    } else {
      this._rstnGpio = rstnGpio;
    }
  }

  public init() {
    return this._rstnGpio.write(0)
      .then(() => sleepMs(300))
      .then(() => this._rstnGpio.write(1))
      .then(() => this.eliteBootcodeDownload())
      .then(() => sleepMs(10))
      .then(() => this.eliteDirectRead([0x01, 0x90, 0xEB], 1, EliteDataMode.XX1))
      .then((out) => {
        if (out[0] == 0xaf && out[1] == 0xfe && out[2] == 0x42 && out[3] == 0x00) {
          return Promise.resolve();
        }
        return Promise.reject(`Initialize failed: status=${Buffer.from(out).toString('hex')}`);
      });
  }

  public eliteDirectWrite(addressBuffer: number[], dataBuffer: number[], dataNum: number, mode: EliteDataMode, cmd: number) {
    const buffer: number[] = [];
    // const checksum: [number, number, number, number] = [0, 0, 0, 0];
    let checksum: number = 0;
    switch (mode) {
    case EliteDataMode.XX1:
      buffer.push((addressBuffer[0] & 0x01) | 0x80); // mode + addr1
      buffer.push(addressBuffer[1]);
      buffer.push(addressBuffer[2]);
      buffer.push(dataBuffer[0]);
      buffer.push(dataBuffer[1]);
      buffer.push(dataBuffer[2]);
      buffer.push(dataBuffer[3]);
      break;
    case EliteDataMode.XX2:
      buffer.push((addressBuffer[0] & 0x01) | 0x90); // mode + addr1
      buffer.push(addressBuffer[1]);
      buffer.push(addressBuffer[2]);
      buffer.push(dataBuffer[0]);
      buffer.push(dataBuffer[1]);
      buffer.push(dataBuffer[2]);
      break;
    case EliteDataMode.XX3:
      buffer.push((addressBuffer[0] & 0x01) | 0xe0); // mode + addr1
      buffer.push(addressBuffer[1]);
      buffer.push(addressBuffer[2]);
      for (let i=0; i<dataNum; i++) {
        buffer.push(dataBuffer[i * 4]);
        buffer.push(dataBuffer[i * 4 + 1]);
        buffer.push(dataBuffer[i * 4 + 2]);
        buffer.push(dataBuffer[i * 4 + 3]);

        checksum += dataBuffer[i * 4] << 24;
        checksum += dataBuffer[i * 4 + 1] << 16;
        checksum += dataBuffer[i * 4 + 2] << 8;
        checksum += dataBuffer[i * 4 + 3];

        checksum &= 0xffffffff;

        // for (let j=3; j>=1; j--) {
        //   checksum[j]=checksum[j] + dataBuffer[i*4+j];
        //   if (checksum[j] >= 256)
        //   {
        //     checksum[j - 1] = checksum[j - 1] + 1;
        //     checksum[j] = checksum[j] - 256;
        //   }
        //   checksum[0] += dataBuffer[i * 4];
        //   if (checksum[0] >= 256) {
        //     checksum[0] -= 256;
        //   }
      }
      if (cmd) {
        buffer.push((checksum >> 24) & 0xff);
        buffer.push((checksum >> 16) & 0xff);
        buffer.push((checksum >> 8) & 0xff);
        buffer.push((checksum) & 0xff);
      }
      break;
    case EliteDataMode.XX4:
      buffer.push((addressBuffer[0] & 0x01) | 0xf0); // mode + addr1
      buffer.push(addressBuffer[1]);
      buffer.push(addressBuffer[2]);
      for (let i=0; i<dataNum; i++) {
        buffer.push(dataBuffer[i * 3]);
        buffer.push(dataBuffer[i * 3 + 1]);
        buffer.push(dataBuffer[i * 3 + 2]);

        checksum += dataBuffer[i * 3] << 16;
        checksum += dataBuffer[i * 3 + 1] << 8;
        checksum += dataBuffer[i * 3 + 2] << 0;

        checksum &= 0xffffff;

        // for (let j=3; j>=1; j--) {
        //   checksum[j]=checksum[j] + dataBuffer[i*4+j];
        //   if (checksum[j] >= 256)
        //   {
        //     checksum[j - 1] = checksum[j - 1] + 1;
        //     checksum[j] = checksum[j] - 256;
        //   }
        //   checksum[0] += dataBuffer[i * 4];
        //   if (checksum[0] >= 256) {
        //     checksum[0] -= 256;
        //   }
      }
      if (cmd) {
        buffer.push((checksum >> 16) & 0xff);
        buffer.push((checksum >> 8) & 0xff);
        buffer.push((checksum) & 0xff);
      }
      break;
    default:
      return Promise.reject(new Error('unknown mode: ' + mode));
    }
    return this._i2cWrite(Buffer.from(buffer));
  }

  public eliteDirectRead(addressBuffer: number[], dataNum: number, mode: EliteDataMode): Promise<number[]> {
    const outBuffer: number[] = [];
    switch (mode) {
    case EliteDataMode.XX1:
      outBuffer.push((addressBuffer[0] & 0x01) | 0x00); // mode + addr1
      outBuffer.push(addressBuffer[1]);
      outBuffer.push(addressBuffer[2]);
      return this._i2cWrite(Buffer.from(outBuffer))
        .then(() => sleepUs(4))
        .then(() => {
          const readBuf = Buffer.alloc(4);
          return this._i2cRead(readBuf);
        })
        .then((rres) => {
          return bufferToNumberArray(rres.buffer);
        });
    case EliteDataMode.XX2:
      outBuffer.push((addressBuffer[0] & 0x01) | 0x10); // mode + addr1
      outBuffer.push(addressBuffer[1]);
      outBuffer.push(addressBuffer[2]);
      return this._i2cWrite(Buffer.from(outBuffer))
        .then(() => sleepUs(50))
        .then(() => {
          const readBuf = Buffer.alloc(3);
          return this._i2cRead(readBuf);
        })
        .then((rres) => {
          return bufferToNumberArray(rres.buffer);
        });
    case EliteDataMode.XX3:
      outBuffer.push((addressBuffer[0] & 0x01) | 0x60); // mode + addr1
      outBuffer.push(addressBuffer[1]);
      outBuffer.push(addressBuffer[2]);
      return this._i2cWrite(Buffer.from(outBuffer))
        .then(() => sleepUs(50))
        .then((wres) => {
          const readBuf = Buffer.alloc(dataNum * 4);
          return this._i2cRead(readBuf);
        })
        .then((rres) => {
          return bufferToNumberArray(rres.buffer);
        });
    case EliteDataMode.XX4:
      outBuffer.push((addressBuffer[0] & 0x01) | 0x70); // mode + addr1
      outBuffer.push(addressBuffer[1]);
      outBuffer.push(addressBuffer[2]);
      return this._i2cWrite(Buffer.from(outBuffer))
        .then(() => sleepUs(4))
        .then(() => {
          const readBuf = Buffer.alloc(40);
          return this._i2cRead(readBuf);
        })
        .then((rres) => {
          const dataBuffer: number[] = [];
          dataBuffer.push(rres.buffer[0]);
          dataBuffer.push(rres.buffer[1]);
          dataBuffer.push(rres.buffer[2]);
          const tmp = dataBuffer[2] & 0x1f;
          for (let i=1; i<tmp+1; i++) {
            dataBuffer.push(rres.buffer[i * 3]);
            dataBuffer.push(rres.buffer[i * 3 + 1]);
            dataBuffer.push(rres.buffer[i * 3 + 2]);
          }
          return dataBuffer;
        });
    }
    return Promise.reject(new Error('unknown mode: ' + mode));
  }

  /**
   * Download the boot code data with direct write method
   */
  public eliteBootcodeDownload() {
    return new Promise<void>((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (i >= i2cBootData.length) {
          resolve();
          return ;
        }

        const num = i2cBootData[i];
        const part = i2cBootData.slice(i + 4, i + 4 * num + 4);
        const buffer = [
          (i2cBootData[i + 1] & 0x01) | 0xe0, // addr1
          i2cBootData[i + 2],
          i2cBootData[i + 3],
          ...part
        ];
        this._i2cWrite(Buffer.from(buffer))
          .then(() => {
            i += 4 + part.length;
            next();
          })
          .catch((err) => resolve(err));
      };
      next();
    });
  }

  /**
   * Change band control sequence(change to the specified band and tune to the specified frequency as well)
   *
   * @param alignMode alignMode
   */
  public eliteCmdStartup(alignMode: EliteAlignMode) {
    const para: number[] = [
      0, // Para1
      0,
      alignMode
    ];
    return this.eliteCmdWriteRead(EliteCmdCode.Startup, 1, para, 1)
      .then((res) => {
        this.log('eliteCmdStartup res=' + numberArrayToHex(res));
        return this.readyTdsr();
      });
  }

  /**
   * change band command
   *
   * @param band
   * @param minFreq
   * @param maxFreq
   * @param freq
   */
  public eliteCmdChangeBand(band: EliteChangeBandCode, minFreq: number, maxFreq: number, freq: number) {
    const para: number[] = [
      0, // Para1
      0,
      band,

      (minFreq & 0xff0000) >> 16, // Para2
      (minFreq & 0xff00) >> 8,
      (minFreq & 0xff),

      (maxFreq & 0xff0000) >> 16, // Para3
      (maxFreq & 0xff00) >> 8,
      (maxFreq & 0xff),

      (freq & 0xff0000) >> 16, // Para4
      (freq & 0xff00) >> 8,
      (freq & 0xff),
    ];
    return this.eliteCmdWriteRead(EliteCmdCode.ChangeBand, 4, para, 1)
      .then((res) => {
        this.log('eliteCmdChangeBand res=' + numberArrayToHex(res));
        return this.readyTdsr();
      });
  }

  public eliteCmdWriteBeCoeff(beCoeff: number[]) {
    console.log('eliteCmdWriteBeCoeff START');
    return new Promise<void>((resolve, reject) => {
      let position = 0;
      let offset = 0;
      const next = () => {
        if (position >= beCoeff.length) {
          resolve();
          return ;
        }

        const numWord = beCoeff[position];
        let num = numWord;
        const addrs = [
          beCoeff[position + 1],
          beCoeff[position + 2],
          beCoeff[position + 3]
        ];
        const addrRange =
            (addrs[0] << 16) |
            (addrs[1] << 8) |
            (addrs[2]);

        let cmdcode: EliteCmdCode;

        if ( addrRange <= 0x019fff  || (addrRange >= 0x01c000 && addrRange <= 0x01ffff )) {
          cmdcode = EliteCmdCode.WriteDMAMem;
        }
        else if ( addrRange >= 0x01a000 && addrRange <= 0x01afff) {
          cmdcode = EliteCmdCode.WriteMen;
        }
        else if ( addrRange >= 0x01b000 && addrRange <= 0x01bfff ) {
          cmdcode = EliteCmdCode.WriteMen;
        }

        if (cmdcode === EliteCmdCode.WriteDMAMem) {
          const numArr = [];
          for (let i = 0; i < num; i++) numArr.push(i);

          return numArr.reduce((prev, i) => prev.then(() => {
            const writeBuffer = [
              ...addrs, // Para 1 memory address

              beCoeff[position + 4 + i * 4], // Para 2
              beCoeff[position + 5 + i * 4],
              beCoeff[position + 6 + i * 4],

              beCoeff[position + 5 + i * 4], // Para 3
              beCoeff[position + 6 + i * 4],
              beCoeff[position + 7 + i * 4],
            ];
            return this.eliteCmdWriteRead(cmdcode, 3, writeBuffer, 1)
              .then((res) => {
                console.log(`eliteCmdWriteBeCoeff mid res 1 = ${numberArrayToHex(res)}`);
                let tmpAddr = addrs[0];
                tmpAddr <<= 8;
                tmpAddr |= addrs[1];
                tmpAddr <<= 8;
                tmpAddr |= addrs[2];
                tmpAddr++;
                addrs[0] = (tmpAddr >> 16) & 0xff;
                addrs[1] = (tmpAddr >> 8) & 0xff;
                addrs[2] = (tmpAddr) & 0xff;
              });
          })
          , Promise.resolve())
            .then(() => {
              position += numWord * 4 + 4;
              next();
            })
            .catch((err) => reject(err));
        } else if (cmdcode === EliteCmdCode.WriteMen) {
          const subExec = () => {
            const writeBuffer = [
              ...addrs
            ];
            if (num <= 7) {
              for (let i=0; i<num; i++) {
                writeBuffer[3 + i * 3] = beCoeff[position + 4 + i * 4 + offset];
                writeBuffer[4 + i * 3] = beCoeff[position + 5 + i * 4 + offset];
                writeBuffer[5 + i * 3] = beCoeff[position + 6 + i * 4 + offset];
              }
              return this.eliteCmdWriteRead(cmdcode, num + 1, writeBuffer, 1)
                .then((res) => {
                  console.log(`eliteCmdWriteBeCoeff mid res 2 = ${numberArrayToHex(res)}`);
                  position += numWord * 4 + 4;
                  next();
                })
                .catch((err) => reject(err));
            }
            for (let i=0; i<7; i++) {
              writeBuffer.push(beCoeff[position + 4 + i * 4 + offset]);
              writeBuffer.push(beCoeff[position + 5 + i * 4 + offset]);
              writeBuffer.push(beCoeff[position + 6 + i * 4 + offset]);
            }
            this.eliteCmdWriteRead(cmdcode, 8, writeBuffer, 1)
              .then(() => {
                num -= 7;
                subExec();
              })
              .catch((err) => reject(err));
            subExec();
          };
          subExec();
        }
      };
      next();
    });
  }

  /**
   * Set Front-end Registers command in case customer want to change the FE registers to be different from default values
   *
   * @param band band
   * @param start start
   * @param num num
   */
  public eliteCmdSetFEReg(band: EliteChangeBandCode, start: number, num: number) {
    return Promise.resolve()
      .then(() => {
        if (num === 0) {
          return this.eliteCmdWriteRead(EliteCmdCode.SetFEReg, 0, [], 1);
        } else {
          const writeBuffer = [
            0x00, // Para1 - subaddress
            0x00,
            start,
          ];

          if (start === 15) {
            switch (band) {
            case EliteChangeBandCode.FM:
              writeBuffer[3] = FMFEReg[10 * 3];
              writeBuffer[4] = FMFEReg[10 * 3 + 1];
              writeBuffer[5] = FMFEReg[10 * 3 + 2];
              break;
            case EliteChangeBandCode.WB:
              writeBuffer[3] = WXFEReg[10 * 3];
              writeBuffer[4] = WXFEReg[10 * 3 + 1];
              writeBuffer[5] = WXFEReg[10 * 3 + 2];
              break;
            default:
              writeBuffer[3] = AMFEReg[10 * 3];
              writeBuffer[4] = AMFEReg[10 * 3 + 1];
              writeBuffer[5] = AMFEReg[10 * 3 + 2];
              break;
            }
          }
          else {
            switch (band) {
            case EliteChangeBandCode.FM:
              for (let i=0; i<num; i++) {
                writeBuffer[3 + i * 3] = FMFEReg[start * 3 + i * 3];
                writeBuffer[4 + i * 3] = FMFEReg[start * 3 + i * 3 + 1];
                writeBuffer[5 + i * 3] = FMFEReg[start * 3 + i * 3 + 2];
              }
              break;
            case EliteChangeBandCode.WB:
              for (let i=0; i<num; i++) {
                writeBuffer[3 + i * 3] = WXFEReg[start * 3 + i * 3];
                writeBuffer[4 + i * 3] = WXFEReg[start * 3 + i * 3 + 1];
                writeBuffer[5 + i * 3] = WXFEReg[start * 3 + i * 3 + 2];
              }
              break;
            default:
              for (let i=0; i<num; i++) {
                writeBuffer[3 + i * 3] = AMFEReg[start * 3 + i * 3];
                writeBuffer[4 + i * 3] = AMFEReg[start * 3 + i * 3 + 1];
                writeBuffer[5 + i * 3] = AMFEReg[start * 3 + i * 3 + 2];
              }
              break;
            }
          }

          return this.eliteCmdWriteRead(EliteCmdCode.SetFEReg, num + 1, writeBuffer, 1);
        }
      })
      .then((res) => {
        console.log(`eliteCmdSetFEReg res = ${numberArrayToHex(res)}`);
        return res;
      });
  }

  public tunerChangeFMFreq(freq: number) {
    const minFreq = 76000;
    const maxFreq = 108000;
    const curFreq = freq;

    // optional, in case the FE registers need to be different compared to the default setting in FM band
    return this.eliteCmdSetFEReg(EliteChangeBandCode.FM, 0,10)
    // return this.eliteCmdSetFEReg(EliteBandCode.FM, 15, 1)
      // set the band's range and tune to the frequency in this band as well
      .then(() => this.eliteCmdChangeBand(EliteChangeBandCode.FM, minFreq, maxFreq, curFreq))

      .then(() => this.eliteCmdWriteBeCoeff(FMCustomWSPData))

      // Enable option funtion e.g. Musica
      .then(() => this.eliteCmdMuSICA(0));
  }

  public eliteCmdMuSICA(val: number) {
    const writeBuffer = [
      0x00,
      0x00,
      val
    ];
    return this.eliteCmdWriteRead(EliteCmdCode.MuSICA, 1, writeBuffer, 1);
  }

  /**
   * Tune to specific frequency command
   *
   * @param freq unip is khz
   */
  public eliteCmdChangeFreq(freq: number) {
    const writeBuffer = [
      (freq >> 16) & 0xff,
      (freq >> 8) & 0xff,
      (freq) & 0xff,
    ];
    return this.eliteCmdWriteRead(EliteCmdCode.ChangeFreq, 1, writeBuffer, 1)
      .then(() => this.readyTdsr());
  }

  public eliteCmdReadTunnerStatus(band: EliteReadBandCode): Promise<TunnerFMStatus> {
    const writeBuffer = [
      0x00,
      0x00,
      band
    ];
    return this.eliteCmdWriteRead(EliteCmdCode.ReadTunerStatus, 1, writeBuffer, 2)
      .then((rres) => {
        return {
          smeter: rres[3],
          detuning: rres[4],
          multipath: rres[6],
          adjChannel: rres[7],
        };
      });
  }

  /**
   * Read out the tuner driver status command
   */
  public eliteCmdReadTDSR() {
    return this.eliteCmdWriteRead(EliteCmdCode.ReadTDS, 0, [], 2)
      .then((rres) => {
        this._flagTDBusy = !!(rres[5] & 0x40);
        this._flagTDColl = !!(rres[4] & 0x01);
        this._flagSeqChg = !!(rres[3] & 0x01);
        this.log(`eliteCmdReadTDSR: TDBust=${this._flagTDBusy}, TDColl=${this._flagTDColl}, SeqChg=${this._flagSeqChg}`);
      });
  }

  /**
   * Write data to or read data from Elite by commands
   *
   * @param cmdCode cmdCode
   * @param paraNum paraNum
   * @param writeData writeData
   * @param receNum receive number
   */
  public eliteCmdWriteRead(cmdCode: EliteCmdCode, paraNum: number, writeData: number[], receNum: number) {
    const address = [0x01, 0x90, 0x00];
    const writeBuffer = [
      (cmdCode & 0xf0) >> 4,
      (cmdCode & 0x0f) << 4,
      (paraNum + 1) & 0x1f,
      ...writeData
    ];
    return this.eliteDirectWrite(address, writeBuffer, paraNum + 1, EliteDataMode.XX4, 1)
      .then(() => {
        if (receNum >= 1) {
          address[2] = 0xEB; // command read address
          return this.eliteDirectRead(address, receNum, EliteDataMode.XX4);
        }
        return [];
      });
  }

  public readyTdsr() {
    return new Promise<void>((resolve, reject) => {
      const startTime = process.hrtime.bigint();
      const check = () => {
        this.eliteCmdReadTDSR()
          .then(() => {
            const hrDiff = (process.hrtime.bigint() - startTime) / 1000000n;
            if (this._flagSeqChg) {
              if (hrDiff >= 1000n) {
                reject(new Error('timed out'));
                return ;
              }
              return sleepMs(10)
                .then(() => check());
            } else {
              resolve();
            }
          })
          .catch((err) => reject(err));
      };
      check();
    });
  }

  private _i2cWrite(buf: Buffer): Promise<i2c.BytesWritten> {
    this.log(`i2c write: ${buf.toString('hex')}`);
    return this._i2cBus.i2cWrite(this._i2cAddress, buf.byteLength, buf);
  }

  private _i2cRead(buf: Buffer): Promise<i2c.BytesRead> {
    return this._i2cBus.i2cRead(this._i2cAddress, buf.byteLength, buf)
      .then((res) => {
        this.log(`i2c read: ${res.buffer.toString('hex')}`);
        return res;
      });
  }

  public log(s: string) {
    console.log(s);
  }
}
