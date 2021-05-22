export interface TunnerAMStatus {
  /**
   * Logarithmic field strength indicator
   */
  smeter: number;
  detuning: number;
}

export interface TunnerFMStatus extends TunnerAMStatus {
  multipath: number;
  adjChannel: number;
}
