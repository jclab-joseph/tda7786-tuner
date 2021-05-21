/*
  Copyright (c) 2021 JC-Lab <development@jc-lab.net>
  Apache License 2.0
 */

export enum EliteDataMode {
  XX1,
  XX2,
  XX3,
  XX4
}

export enum EliteAlignMode {
  AlignVCO_EUUSA = 0x00, // 87.5 MHz - 108 MHz
  AlignVCO_Japean = 0x01, // 76 MHz - 90 MHz
  AlignVCO = 0x02 // only align
}

export enum EliteBandCode {
  FM = 0x01,
  AM_EU_JP = 0x02,
  AM_US = 0x03,
  WB = 0x04
}

export enum EliteCmdCode {
  ReadDMAMem = 0x00,
  WriteDMAMem = 0x03,
  ReadMem = 0x1E,
  WriteMem = 0x1F,
  ReadTDS = 0x11,

  /**
   * {@link EliteAlignMode}
   */
  Startup = 0x22,

  /**
   * {@link EliteBandCode}
   */
  ChangeBand = 0x23,

  ChangeFreq = 0x24,

  ReadTunerStatus = 0x25,

  SetFEReg = 0x09,

  SetSeekTH = 0x14,
  StartMamnuSeek = 0x15,

  AFCheck = 0x07,
  AFSwitch = 0x10,
  AFStart = 0x0d,
  AFMeasure = 0x0e,
  AFEnd = 0x0f,

  StartAutoSeek = 0x16,

  SeekEnd = 0x17,

  ReadSeekStatus = 0x18,

  ReadRDSQual = 0x13,

  ReadSTStatus = 0x1F,

  SetDiss = 0x1a,
}
