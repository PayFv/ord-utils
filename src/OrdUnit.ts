
export class OrdUnit {
  satoshis: number;
  inscriptions: {
    id: string;
    outputOffset: number;
    unitOffset: number;
  }[];
  constructor(
    satoshis: number,
    inscriptions: {
      id: string;
      outputOffset: number;
      unitOffset: number;
    }[]
  ) {
    this.satoshis = satoshis;
    this.inscriptions = inscriptions;
  }

  hasOrd() {
    return this.inscriptions.length > 0;
  }

}
