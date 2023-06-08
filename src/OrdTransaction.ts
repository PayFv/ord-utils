import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";
import Script from "btc-script-builder-thords"
import { LocalWallet } from "./LocalWallet";
import { Taptree } from "bitcoinjs-lib/src/types";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
interface TxInput {
  data: {
    hash: string;
    index: number;
    witnessUtxo: { value: number; script: Buffer };
    tapInternalKey?: Buffer;
    tapLeafScript?: {
      leafVersion: number,
      script: Buffer,
      controlBlock: Buffer
    }[]
  };
  utxo: UnspentOutput;
}

interface Inscription {
  tag: string,
  content_type: string,
  content: Buffer
}

interface TxOutput {
  address: string;
  value: number;
}

export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

export interface UnspentOutput {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  addressType: AddressType;
  address: string;
  inscriptions: {
    id: string;
    offset: number;
  }[];
}
export enum AddressType {
  P2PKH,
  P2WPKH,
  P2TR,
  P2SH_P2WPKH,
  M44_P2WPKH,
  M44_P2TR,
}

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

export function build_script(internalKey: Buffer, tag: String, content_type: String, content: Buffer) {
  // const internalKey = toXOnly(Buffer.from(this.pubkey, "hex"))
  const tag_buff = Buffer.from(tag || 'ord', 'utf-8')
  const content_type_buff = Buffer.from(content_type, 'utf-8')
  const content_buff = content

  const reveal_script = new Script()

  reveal_script
    .addData(internalKey)
    .addOp('OP_CHECKSIG')
    //add inscription
    .addOp('OP_FALSE')
    .addOp('OP_IF')
    .addData(tag_buff)
    // .addData( '01')
    // .addByte(0x01)
    .addData(new Uint8Array([1]))
    .addData(content_type_buff)
    .addByte(0x00)
  const PUSH_DATA_LIMIT = 520 // 520

  for (let i = 0; i < content.length; i += PUSH_DATA_LIMIT) {
    const v = content_buff.subarray(i, i + PUSH_DATA_LIMIT)
    reveal_script.addData(v)
  }

  reveal_script.addOp("OP_ENDIF")

  const reveal_script_buff = reveal_script.compile()

  const scriptTree: Taptree = {
    output: reveal_script_buff
  }

  const redeem = {
    output: reveal_script_buff,
    redeemVersion: 192
  }

  return { scriptTree, redeem };

}

export function utxoToInput(utxo: UnspentOutput, publicKey: Buffer): TxInput {
  if (
    utxo.addressType === AddressType.P2TR ||
    utxo.addressType === AddressType.M44_P2TR
  ) {
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: toXOnly(publicKey),
    };
    return {
      data,
      utxo,
    };
  } else if (
    utxo.addressType === AddressType.P2WPKH ||
    utxo.addressType === AddressType.M44_P2WPKH
  ) {
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
    return {
      data,
      utxo,
    };
  } else if (utxo.addressType === AddressType.P2PKH) {
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
    return {
      data,
      utxo,
    };
  } else if (utxo.addressType === AddressType.P2SH_P2WPKH) {
    const redeemData = bitcoin.payments.p2wpkh({ pubkey: publicKey });
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      redeemScript: redeemData.output,
    };
    return {
      data,
      utxo,
    };
  }
}

export class OrdTransaction {
  private inputs: TxInput[] = [];
  public outputs: TxOutput[] = [];
  private changeOutputIndex = -1;
  private wallet: any;
  public changedAddress: string;
  private network: bitcoin.Network = bitcoin.networks.bitcoin;
  private feeRate: number;
  private pubkey: string;
  private enableRBF = true;
  constructor(wallet: any, network: any, pubkey: string, feeRate?: number) {
    this.wallet = wallet;
    this.network = network;
    this.pubkey = pubkey;
    this.feeRate = feeRate || 5;
  }

  setEnableRBF(enable: boolean) {
    this.enableRBF = enable;
  }

  setChangeAddress(address: string) {
    this.changedAddress = address;
  }

  addInput(utxo: UnspentOutput) {
    this.inputs.push(utxoToInput(utxo, Buffer.from(this.pubkey, "hex")));
  }

  getTotalInput() {
    return this.inputs.reduce(
      (pre, cur) => pre + cur.data.witnessUtxo.value,
      0
    );
  }

  getTotalOutput() {
    return this.outputs.reduce((pre, cur) => pre + cur.value, 0);
  }

  getUnspent() {
    return this.getTotalInput() - this.getTotalOutput();
  }

  async isEnoughFee() {
    const psbt1 = await this.createSignedPsbt();
    if (psbt1.getFeeRate() >= this.feeRate) {
      return true;
    } else {
      return false;
    }
  }

  async calNetworkFee() {
    const psbt = await this.createSignedPsbt();
    let txSize = psbt.extractTransaction(true).toBuffer().length;
    psbt.data.inputs.forEach((v) => {
      if (v.finalScriptWitness) {
        txSize -= v.finalScriptWitness.length * 0.75;
      }
    });
    const fee = Math.ceil(txSize * this.feeRate);
    return fee;
  }

  addOutput(address: string, value: number) {
    this.outputs.push({
      address,
      value,
    });
  }

  getOutput(index: number) {
    return this.outputs[index];
  }

  addChangeOutput(value: number) {
    this.outputs.push({
      address: this.changedAddress,
      value,
    });
    this.changeOutputIndex = this.outputs.length - 1;
  }

  getChangeOutput() {
    return this.outputs[this.changeOutputIndex];
  }

  getChangeAmount() {
    const output = this.getChangeOutput();
    return output ? output.value : 0;
  }

  removeChangeOutput() {
    this.outputs.splice(this.changeOutputIndex, 1);
    this.changeOutputIndex = -1;
  }

  removeRecentOutputs(count: number) {
    this.outputs.splice(-count);
  }

  async createSignedPsbt() {
    const psbt = new bitcoin.Psbt({ network: this.network });
    this.inputs.forEach((v, index) => {
      if (v.utxo.addressType === AddressType.P2PKH) {
        //@ts-ignore
        psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = true;
      }
      psbt.addInput(v.data);
      if (this.enableRBF) {
        psbt.setInputSequence(index, 0xfffffffd); // support RBF
      }
    });

    this.outputs.forEach((v) => {
      psbt.addOutput(v);
    });

    await this.wallet.signPsbt(psbt);

    return psbt;
  }

  async generate(autoAdjust: boolean) {
    // Try to estimate fee
    const unspent = this.getUnspent();
    this.addChangeOutput(Math.max(unspent, 0));
    const psbt1 = await this.createSignedPsbt();
    // this.dumpTx(psbt1);
    this.removeChangeOutput();

    // todo: support changing the feeRate
    const txSize = psbt1.extractTransaction().toBuffer().length;
    const fee = txSize * this.feeRate;

    if (unspent > fee) {
      const left = unspent - fee;
      if (left > UTXO_DUST) {
        this.addChangeOutput(left);
      }
    } else {
      if (autoAdjust) {
        this.outputs[0].value -= fee - unspent;
      }
    }
    const psbt2 = await this.createSignedPsbt();
    const tx = psbt2.extractTransaction();

    const rawtx = tx.toHex();
    const toAmount = this.outputs[0].value;
    return {
      fee: psbt2.getFee(),
      rawtx,
      toSatoshis: toAmount,
      estimateFee: fee,
    };
  }

  async dumpTx(psbt) {
    const tx = psbt.extractTransaction();
    const size = tx.toBuffer().length;
    const feePaid = psbt.getFee();
    const feeRate = (feePaid / size).toFixed(4);

    console.log(`
=============================================================================================
Summary
  txid:     ${tx.getId()}
  Size:     ${tx.byteLength()}
  Fee Paid: ${psbt.getFee()}
  Fee Rate: ${feeRate} sat/B
  Detail:   ${psbt.txInputs.length} Inputs, ${psbt.txOutputs.length} Outputs
----------------------------------------------------------------------------------------------
Inputs
${this.inputs
        .map((input, index) => {
          const str = `
=>${index} ${input.data.witnessUtxo.value} Sats
        lock-size: ${input.data.witnessUtxo.script.length}
        via ${input.data.hash} [${input.data.index}]
`;
          return str;
        })
        .join("")}
total: ${this.getTotalInput()} Sats
----------------------------------------------------------------------------------------------
Outputs
${this.outputs
        .map((output, index) => {
          const str = `
=>${index} ${output.address} ${output.value} Sats`;
          return str;
        })
        .join("")}

total: ${this.getTotalOutput() - feePaid} Sats
=============================================================================================
    `);
  }
}

export class InscribeTransaction {
  private inputs: TxInput[] = [];
  private reveal_input: TxInput;
  public outputs: TxOutput[] = [];
  private changeOutputIndex = -1;
  private wallet: LocalWallet;
  public changedAddress: string;
  private network: bitcoin.Network = bitcoin.networks.bitcoin;
  private feeRate: number;
  private pubkey: string;
  private enableRBF = true;
  private inscription: Inscription;
  private reveal_script: any;
  private p2tr: any;
  constructor(wallet: LocalWallet, network: any, pubkey: string, feeRate?: number) {
    this.wallet = wallet;
    this.network = network;
    this.pubkey = pubkey;
    this.feeRate = feeRate || 5;
  }

  setEnableRBF(enable: boolean) {
    this.enableRBF = enable;
  }

  setChangeAddress(address: string) {
    this.changedAddress = address;
  }

  getInternalPubkey() {
    return toXOnly(this.wallet.keyPair.publicKey)
  }

  addInput(input: TxInput) {
    this.inputs.push(input)
  }

  addRevealInput(reveal_input: TxInput) {
    this.reveal_input = reveal_input
  }

  getRevealInput() {
    return this.reveal_input
  }

  addOutput(address: string, value: number) {
    this.outputs.push({
      address,
      value,
    });
  }

  getOutput(index: number) {
    return this.outputs[index];
  }

  getP2TRAddress() {
    return this.p2tr
  }

  setInscription(tag: string, content_type: string, content: Buffer) {

    if (content.length > 320 * 1024) throw new Error(`Content is to large.${content.length / 1024 / 1024}K`)

    this.inscription = {
      tag, content_type, content
    }

    const internalPubkey = this.getInternalPubkey()
    const reveal_script = build_script(internalPubkey, tag, content_type, content)

    this.reveal_script = reveal_script

    this.p2tr = this.commit_p2tr()

  }

  commit_p2tr() {
    const reveal_script = this.reveal_script
    const internalPubkey = this.getInternalPubkey()
    // console.log( `commit_p2tr:` , internalPubkey, reveal_script.scriptTree, reveal_script.redeem , this.network )
    return bitcoin.payments.p2tr({
      internalPubkey: internalPubkey,
      scriptTree: reveal_script.scriptTree,
      redeem: reveal_script.redeem,
      network: this.network
    })
  }

  build_reveal_input(utxo) {
    const reveal_script = this.reveal_script
    const p2tr = this.p2tr
    const reveal_tx_input_data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: p2tr.output!
      },
      tapLeafScript: [{
        leafVersion: reveal_script.redeem.redeemVersion,
        script: reveal_script.redeem.output,
        controlBlock: p2tr.witness![p2tr.witness!.length - 1]
      }]
    }
    this.reveal_input = {
      data: reveal_tx_input_data,
      utxo
    }
  }

  getTotalInput() {
    let total = this.inputs.reduce(
      (pre, cur) => pre + cur.data.witnessUtxo.value,
      0
    )

    if (this.reveal_input) total += this.reveal_input.data.witnessUtxo.value

    return total
  }

  getTotalOutput() {
    return this.outputs.reduce((pre, cur) => pre + cur.value, 0);
  }

  getUnspent() {
    return this.getTotalInput() - this.getTotalOutput();
  }

  async createSignedInscribe() {

    const psbt = new bitcoin.Psbt({ network: this.network });

    if (this.reveal_input) {
      psbt.addInput(this.reveal_input.data)
    }
    this.inputs.forEach((v, index) => {
      if (v.utxo.addressType === AddressType.P2PKH) {
        //@ts-ignore
        psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = true;
      }
      psbt.addInput(v.data);
      if (this.enableRBF) {
        psbt.setInputSequence(index, 0xfffffffd); // support RBF
      }
    });

    this.outputs.forEach((v) => {
      psbt.addOutput(v);
    });

    // await this.wallet.signPsbt(psbt, opt ); // sign normal input 
    psbt.signInput(0, this.wallet.keyPair)
    psbt.finalizeInput(0)

    return psbt

  }

  async calNetworkFee() {
    const psbt = await this.createSignedInscribe();
    let txSize = psbt.extractTransaction(true).toBuffer().length;
    psbt.data.inputs.forEach((v) => {
      if (v.finalScriptWitness) {
        txSize -= v.finalScriptWitness.length * 0.75;
      }
    });
    const fee = Math.ceil(txSize * this.feeRate);
    return fee;
  }

  async dumpTx(psbt) {
    const tx = psbt.extractTransaction();
    const size = tx.toBuffer().length;
    const feePaid = psbt.getFee();
    const feeRate = (feePaid / size).toFixed(4);

    console.log(`
=============================================================================================
Summary
  txid:     ${tx.getId()}
  Size:     ${tx.byteLength()}
  Fee Paid: ${psbt.getFee()}
  Fee Rate: ${feeRate} sat/B
  Detail:   ${psbt.txInputs.length} Inputs, ${psbt.txOutputs.length} Outputs
----------------------------------------------------------------------------------------------
Inputs
${this.inputs
        .map((input, index) => {
          const str = `
=>${index} ${input.data.witnessUtxo.value} Sats
        lock-size: ${input.data.witnessUtxo.script.length}
        via ${input.data.hash} [${input.data.index}]
`;
          return str;
        })
        .join("")}
=> 0 ${this.reveal_input.data.witnessUtxo.value} Sats 
        lock-size: ${this.reveal_input.data.witnessUtxo.script.length} 
        via ${this.reveal_input.data.hash} [${this.reveal_input.data.index}]
        
total: ${this.getTotalInput()} Sats
----------------------------------------------------------------------------------------------
Outputs
${this.outputs
        .map((output, index) => {
          const str = `
=>${index} ${output.address} ${output.value} Sats`;
          return str;
        })
        .join("")}
=============================================================================================
    `);
  }

}
