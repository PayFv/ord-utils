import { OrdTransaction, InscribeTransaction, UnspentOutput, AddressType } from "./OrdTransaction";
import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";
import { satoshisToAmount } from "./utils";
import { LocalWallet, NetworkType, toPsbtNetwork, randomWIF, toXOnly } from "./LocalWallet";
import { Psbt, payments, networks, Transaction } from "bitcoinjs-lib";
import { off } from "process";

export {
  LocalWallet,
  NetworkType,
  toPsbtNetwork,
  randomWIF,
  AddressType
}

export async function createSendBTC({
  utxos,
  toAddress,
  toAmount,
  wallet,
  network,
  changeAddress,
  receiverToPayFee,
  feeRate,
  pubkey,
  dump,
  enableRBF = true,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toAmount: number;
  wallet: any;
  network: any;
  changeAddress: string;
  receiverToPayFee?: boolean;
  feeRate?: number;
  pubkey: string;
  dump?: boolean;
  enableRBF?: boolean;
}) {
  const tx = new OrdTransaction(wallet, network, pubkey, feeRate);
  tx.setEnableRBF(enableRBF);
  tx.setChangeAddress(changeAddress);

  const nonOrdUtxos: UnspentOutput[] = [];
  const ordUtxos: UnspentOutput[] = [];
  utxos.forEach((v) => {
    if (v.inscriptions.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  tx.addOutput(toAddress, toAmount);

  const outputAmount = tx.getTotalOutput();

  let tmpSum = tx.getTotalInput();
  for (let i = 0; i < nonOrdUtxos.length; i++) {
    const nonOrdUtxo = nonOrdUtxos[i];
    if (tmpSum < outputAmount) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
      continue;
    }

    const fee = await tx.calNetworkFee();
    if (tmpSum < outputAmount + fee) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
    } else {
      break;
    }
  }

  if (nonOrdUtxos.length === 0) {
    throw new Error("Balance not enough");
  }

  if (receiverToPayFee) {
    const unspent = tx.getUnspent();
    if (unspent >= UTXO_DUST) {
      tx.addChangeOutput(unspent);
    }

    const networkFee = await tx.calNetworkFee();
    const output = tx.outputs.find((v) => v.address === toAddress);
    if (output.value < networkFee) {
      throw new Error(
        `Balance not enough. Need ${satoshisToAmount(
          networkFee
        )} BTC as network fee`
      );
    }
    output.value -= networkFee;
  } else {
    const unspent = tx.getUnspent();
    if (unspent === 0) {
      throw new Error("Balance not enough to pay network fee.");
    }

    // add dummy output
    tx.addChangeOutput(1);

    const networkFee = await tx.calNetworkFee();
    if (unspent < networkFee) {
      throw new Error(
        `Balance not enough. Need ${satoshisToAmount(
          networkFee
        )} BTC as network fee, but only ${satoshisToAmount(unspent)} BTC.`
      );
    }

    const leftAmount = unspent - networkFee;
    if (leftAmount >= UTXO_DUST) {
      // change dummy output to true output
      tx.getChangeOutput().value = leftAmount;
    } else {
      // remove dummy output
      tx.removeChangeOutput();
    }
  }

  const psbt = await tx.createSignedPsbt();
  if (dump) {
    tx.dumpTx(psbt);
  }

  return psbt;
}

export async function createSendOrd({
  utxos,
  toAddress,
  toOrdId,
  wallet,
  network,
  changeAddress,
  pubkey,
  feeRate,
  outputValue,
  dump,
  enableRBF = true,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toOrdId: string;
  wallet: any;
  network: any;
  changeAddress: string;
  pubkey: string;
  feeRate?: number;
  outputValue: number;
  dump?: boolean;
  enableRBF?: boolean;
}) {
  const tx = new OrdTransaction(wallet, network, pubkey, feeRate);
  tx.setEnableRBF(enableRBF);
  tx.setChangeAddress(changeAddress);

  const nonOrdUtxos: UnspentOutput[] = [];
  const ordUtxos: UnspentOutput[] = [];
  utxos.forEach((v) => {
    if (v.inscriptions.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  // find NFT
  let found = false;

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    if (ordUtxo.inscriptions.find((v) => v.id == toOrdId)) {
      if (ordUtxo.inscriptions.length > 1) {
        throw new Error("Multiple inscriptions! Please split them first.");
      }
      tx.addInput(ordUtxo);
      tx.addOutput(toAddress, ordUtxo.satoshis);
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error("inscription not found.");
  }

  // format NFT
  tx.outputs[0].value = outputValue;

  // select non ord utxo
  const outputAmount = tx.getTotalOutput();
  let tmpSum = tx.getTotalInput();
  for (let i = 0; i < nonOrdUtxos.length; i++) {
    const nonOrdUtxo = nonOrdUtxos[i];
    if (tmpSum < outputAmount) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
      continue;
    }

    const fee = await tx.calNetworkFee();
    if (tmpSum < outputAmount + fee) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
    } else {
      break;
    }
  }

  const unspent = tx.getUnspent();
  if (unspent == 0) {
    throw new Error("Balance not enough to pay network fee.");
  }

  // add dummy output
  tx.addChangeOutput(1);

  const networkFee = await tx.calNetworkFee();
  if (unspent < networkFee) {
    throw new Error(
      `Balance not enough. Need ${satoshisToAmount(
        networkFee
      )} BTC as network fee, but only ${satoshisToAmount(unspent)} BTC.`
    );
  }

  const leftAmount = unspent - networkFee;
  if (leftAmount >= UTXO_DUST) {
    // change dummy output to true output
    tx.getChangeOutput().value = leftAmount;
  } else {
    // remove dummy output
    tx.removeChangeOutput();
  }

  const psbt = await tx.createSignedPsbt();
  if (dump) {
    tx.dumpTx(psbt);
  }

  return psbt;
}

export async function createSendMultiOrds({
  utxos,
  toAddress,
  toOrdIds,
  wallet,
  network,
  changeAddress,
  pubkey,
  feeRate,
  dump,
  enableRBF = true,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toOrdIds: string[];
  wallet: any;
  network: any;
  changeAddress: string;
  pubkey: string;
  feeRate?: number;
  dump?: boolean;
  enableRBF?: boolean;
}) {
  const tx = new OrdTransaction(wallet, network, pubkey, feeRate);
  tx.setEnableRBF(enableRBF);
  tx.setChangeAddress(changeAddress);

  const nonOrdUtxos: UnspentOutput[] = [];
  const ordUtxos: UnspentOutput[] = [];
  utxos.forEach((v) => {
    if (v.inscriptions.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  // find NFT
  let foundedCount = 0;

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    if (ordUtxo.inscriptions.find((v) => toOrdIds.includes(v.id))) {
      if (ordUtxo.inscriptions.length > 1) {
        throw new Error(
          "Multiple inscriptions in one UTXO! Please split them first."
        );
      }
      tx.addInput(ordUtxo);
      tx.addOutput(toAddress, ordUtxo.satoshis);
      foundedCount++;
    }
  }

  if (foundedCount != toOrdIds.length) {
    throw new Error("inscription not found.");
  }

  // Do not format NFT
  // tx.outputs[0].value = outputValue;

  // select non ord utxo
  const outputAmount = tx.getTotalOutput();
  let tmpSum = tx.getTotalInput();
  for (let i = 0; i < nonOrdUtxos.length; i++) {
    const nonOrdUtxo = nonOrdUtxos[i];
    if (tmpSum < outputAmount) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
      continue;
    }

    const fee = await tx.calNetworkFee();
    if (tmpSum < outputAmount + fee) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
    } else {
      break;
    }
  }

  const unspent = tx.getUnspent();
  if (unspent == 0) {
    throw new Error("Balance not enough to pay network fee.");
  }

  // add dummy output
  tx.addChangeOutput(1);

  const networkFee = await tx.calNetworkFee();
  if (unspent < networkFee) {
    throw new Error(
      `Balance not enough. Need ${satoshisToAmount(
        networkFee
      )} BTC as network fee, but only ${satoshisToAmount(unspent)} BTC.`
    );
  }

  const leftAmount = unspent - networkFee;
  if (leftAmount >= UTXO_DUST) {
    // change dummy output to true output
    tx.getChangeOutput().value = leftAmount;
  } else {
    // remove dummy output
    tx.removeChangeOutput();
  }

  const psbt = await tx.createSignedPsbt();
  if (dump) {
    tx.dumpTx(psbt);
  }

  return psbt;
}

export async function createSendMultiBTC({
  utxos,
  receivers,
  wallet,
  network,
  changeAddress,
  feeRate,
  pubkey,
  dump,
  enableRBF = true,
}: {
  utxos: UnspentOutput[];
  receivers: {
    address: string;
    amount: number;
  }[];
  wallet: any;
  network: any;
  changeAddress: string;
  feeRate?: number;
  pubkey: string;
  dump?: boolean;
  enableRBF?: boolean;
}) {
  const tx = new OrdTransaction(wallet, network, pubkey, feeRate);
  tx.setEnableRBF(enableRBF);
  tx.setChangeAddress(changeAddress);

  const nonOrdUtxos: UnspentOutput[] = [];
  const ordUtxos: UnspentOutput[] = [];
  utxos.forEach((v) => {
    if (v.inscriptions.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  receivers.forEach((v) => {
    tx.addOutput(v.address, v.amount);
  });

  const outputAmount = tx.getTotalOutput();

  let tmpSum = tx.getTotalInput();
  for (let i = 0; i < nonOrdUtxos.length; i++) {
    const nonOrdUtxo = nonOrdUtxos[i];
    if (tmpSum < outputAmount) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
      continue;
    }

    const fee = await tx.calNetworkFee();
    if (tmpSum < outputAmount + fee) {
      tx.addInput(nonOrdUtxo);
      tmpSum += nonOrdUtxo.satoshis;
    } else {
      break;
    }
  }

  if (nonOrdUtxos.length === 0) {
    throw new Error("Balance not enough");
  }

  const unspent = tx.getUnspent();
  if (unspent === 0) {
    throw new Error("Balance not enough to pay network fee.");
  }

  // add dummy output
  tx.addChangeOutput(1);

  const networkFee = await tx.calNetworkFee();
  if (unspent < networkFee) {
    throw new Error(
      `Balance not enough. Need ${satoshisToAmount(
        networkFee
      )} BTC as network fee, but only ${satoshisToAmount(unspent)} BTC.`
    );
  }

  const leftAmount = unspent - networkFee;
  if (leftAmount >= UTXO_DUST) {
    // change dummy output to true output
    tx.getChangeOutput().value = leftAmount;
  } else {
    // remove dummy output
    tx.removeChangeOutput();
  }

  const psbt = await tx.createSignedPsbt();
  if (dump) {
    console.log(`crateSendMultiBTC ===>`)
    tx.dumpTx(psbt);
  }

  return psbt;
}

export async function createInscriptionRevealTx({
  commit_tx,
  toAddress,
  wallet,
  network,
  feeRate,
  pubkey,
  dump,
  tag = `ord`,
  content_type,
  content,
  cal_network_fee = true,
}: {
  commit_tx: any;
  toAddress: string;
  wallet: LocalWallet;
  network: any;
  feeRate?: number;
  pubkey: string;
  dump?: boolean;
  enableRBF?: boolean;
  commission?: {
    address: string;
    amount: number
  };
  tag: string,
  content_type: string,
  content: Buffer,
  cal_network_fee?: boolean
}) {
  const ord_value = 546

  const tmp_reveal_tx = new InscribeTransaction(wallet, network, pubkey, feeRate)

  tmp_reveal_tx.setInscription(tag, content_type, content)

  tmp_reveal_tx.build_reveal_input(commit_tx)

  tmp_reveal_tx.addOutput(toAddress, ord_value)

  const reveal_tx: Psbt = await tmp_reveal_tx.createSignedInscribe()

  if (dump) {
    console.log(`createInscribe(reveal tx)==> `)
    tmp_reveal_tx.dumpTx(reveal_tx)
  }

  let network_fee = 0
  if (cal_network_fee) {
    network_fee = await tmp_reveal_tx.calNetworkFee()
  }

  const commit_p2tr = tmp_reveal_tx.getP2TRAddress()

  return {
    reveal_tx,
    ord_value,
    network_fee,
    commit_p2tr,
  }

}

export async function createInscribe({
  utxos,
  toAddress,
  wallet,
  network,
  changeAddress,
  feeRate,
  pubkey,
  dump,
  commission,
  enableRBF = false,
  tag = `ord`,
  content_type,
  content
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  wallet: LocalWallet;
  network: any;
  changeAddress: string;
  feeRate?: number;
  pubkey: string;
  dump?: boolean;
  enableRBF?: boolean;
  commission?: {
    address: string;
    amount: number
  };
  tag: string,
  content_type: string,
  content: Buffer
}) {

  const { network_fee, ord_value, commit_p2tr } = await createInscriptionRevealTx({
    commit_tx: utxos[0],
    toAddress,
    wallet,
    network,
    feeRate,
    pubkey,
    dump,
    tag,
    content_type,
    content
  })

  const commit_amt = network_fee + ord_value

  const receivers = [{
    address: commit_p2tr.address,
    amount: commit_amt
  }]
  if (commission) receivers.push(commission)

  const commit_tx: Psbt = await createSendMultiBTC({
    utxos,
    // toAddress: commit_p2tr.address ,
    // toAmount: commit_amt,
    receivers,
    wallet,
    network,
    changeAddress,
    feeRate,
    pubkey,
    dump,
    enableRBF: false
  })
  // console.log( commit_tx )
  const commit_tx_detail = commit_tx.extractTransaction()
  const commit_txid = commit_tx_detail.getId()

  const commit_utxo = {
    txId: commit_txid,
    outputIndex: 0,
    satoshis: commit_amt
  }

  const { reveal_tx } = await createInscriptionRevealTx({
    commit_tx: commit_utxo,
    toAddress,
    wallet,
    network,
    feeRate,
    pubkey,
    dump,
    tag,
    content_type,
    content
  })

  return {
    commit_tx,
    reveal_tx
  }

}

export async function createInscriptionOffer({
  inscription_utxo,
  rec_public_key,
  amount,
  network,
  commission,
}: {
  inscription_utxo: UnspentOutput;
  rec_public_key: string;
  amount: number;
  network: any;
  commission?: {
    address: string;
    value: number
  };
}) {

  const offer = new Psbt({
    network
  })

  let fixed_p2tr = payments.p2tr({
    internalPubkey: toXOnly(Buffer.from('021bc91251f239f888706817e93e419f1532be84a1fc77166526902a36f6e8c707', 'hex')),
    network
  })

  const rec_p2tr = payments.p2tr({
    internalPubkey: toXOnly(Buffer.from(rec_public_key, 'hex')),
    network
  })

  const inscription_p2tr = payments.p2tr({
    internalPubkey: toXOnly(Buffer.from(inscription_utxo.scriptPk, 'hex')),
    network
  })

  // fixed
  offer.addInput({
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    index: 1,
    witnessUtxo: {
      value: amount,
      script: fixed_p2tr.output
    },
    tapInternalKey: fixed_p2tr.internalPubkey
  })


  // fixed
  offer.addInput({
    hash: '0000000000000000000000000000000000000000000000000000000000000001',
    index: 2,
    witnessUtxo: {
      value: amount,
      script: fixed_p2tr.output
    },
    tapInternalKey: fixed_p2tr.internalPubkey
  })

  offer.addInput({
    hash: inscription_utxo.txId,
    index: +inscription_utxo.outputIndex,
    witnessUtxo: {
      value: inscription_utxo.satoshis,
      script: inscription_p2tr.output
    },
    tapInternalKey: inscription_p2tr.internalPubkey,
    sighashType: Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY,
  })


  offer.addOutput({
    address: fixed_p2tr.address,
    value: 0
  })

  // offer.addOutput({
  //   address: fixed_p2tr.address,
  //   value: 0
  // })

  offer.addOutput({
    address: fixed_p2tr.address,
    value: inscription_utxo.satoshis
  })

  offer.addOutput({
    address: rec_p2tr.address,
    value: amount
  })

  if (commission) {
    offer.addOutput(commission)
  }

  return offer

}

export async function createUnsignedBuyOffer({
  order_psbt_hex,
  network,
  buyer_public_key,
  dummy_utxos,
  utxos,
  inscription_utxo,
  fee_rate,
}: {
  order_psbt_hex: string;
  network: any;
  buyer_public_key: string;
  dummy_utxos: UnspentOutput[];
  utxos: UnspentOutput[];
  inscription_utxo: UnspentOutput;
  fee_rate: number;
}) {
  const offer = Psbt.fromHex(order_psbt_hex, {
    network
  })

  if (dummy_utxos.length !== 2) throw new Error('No enough utxos.')

  // offer.input
  // console.log("Inputs: ", offer.data.inputs)  //1

  const offer_sell_input = offer.data.inputs[2]

  const buyer = payments.p2tr({
    internalPubkey: toXOnly(Buffer.from(buyer_public_key, 'hex')),
    network
  })

  const seller = payments.p2tr({
    internalPubkey: toXOnly( Buffer.from(inscription_utxo.scriptPk, 'hex') ),
    network
  })

  const sell_input = {
    hash: inscription_utxo.txId,
    index: inscription_utxo.outputIndex,
    witnessUtxo: offer_sell_input.witnessUtxo,
    finalScriptWitness: offer_sell_input.finalScriptWitness,
    tapInternalKey: seller.internalPubkey
    
  }
  const sell_output = offer.txOutputs[2]

  const psbt = new Psbt({
    network
  })

  const dumy1 = dummy_utxos[0]
  const dumy2 = dummy_utxos[1]

  psbt.addInput({
    hash: dumy1.txId,
    index: +dumy1.outputIndex,
    witnessUtxo: {
      value: dumy1.satoshis,
      script: buyer.output
    },
    tapInternalKey: buyer.internalPubkey,
    sighashType: Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY,
  })

  psbt.addInput({
    hash: dumy2.txId,
    index: +dumy2.outputIndex,
    witnessUtxo: {
      value: dumy2.satoshis,
      script: buyer.output
    },
    tapInternalKey: buyer.internalPubkey,
    sighashType: Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY,
  })

  const dummy_amount = dumy1.satoshis + dumy2.satoshis 

  // add signed inscription utxo
  psbt.addInput( sell_input )

  psbt.addOutput({
    address: buyer.address,
    value: dummy_amount
  })

  psbt.addOutput({
    address: buyer.address,
    value: sell_input.witnessUtxo.value
  })

  psbt.addOutput( sell_output )
  
  const psbt_size = 450
  let buyer_cost = sell_input.witnessUtxo.value + fee_rate * psbt_size

  // console.log( buyer_cost, utxos )
  while( buyer_cost > 0 ) {
    const utxo = utxos.pop()
    const { satoshis, txId, outputIndex } = utxo 
    psbt.addInput({
      hash: txId,
      index: +outputIndex,
      witnessUtxo: {
        value: satoshis,
        script: buyer.output
      },
      tapInternalKey: buyer.internalPubkey,
      sighashType: Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY,
    })

    if( buyer_cost > satoshis ) {
      buyer_cost = buyer_cost - satoshis
    } else {
      const left = satoshis - buyer_cost
      if( left > 600 ) {
        psbt.addOutput({
          address: buyer.address,
          value: left 
        })
      }
      buyer_cost = 0 
    }

  }

  // console.log(`Outpus: `, offer.txOutputs )

  // offer.updateInput( 0 , {
  //   hash: dummy_utxo.txId,
  //   index: +dummy_utxo.outputIndex,
  //   witnessUtxo: {
  //     value: dummy_utxo.satoshis,
  //     script: dummy_p2tr.output
  //   },
  //   tapInternalKey: dummy_p2tr.internalPubkey
  // })

  // offer.addInput({

  // })

  return psbt

}

export async function createDummyUTXO({
  network,
  publick_key,
  utxos,
  fee_rate
}: {
  network: any;
  publick_key: string;
  utxos: UnspentOutput[];
  fee_rate: number
}) {

  const scriptPK = utxos[0].scriptPk
  console.log( scriptPK )
  const dummy_amount = 600
  const network_fee = 200 * fee_rate
  const p2tr = payments.p2tr({
    internalPubkey: toXOnly(Buffer.from( publick_key , 'hex')),
    network
  })

  const dummy_utxo = new Psbt({
    network
  })

  let need_sats = dummy_amount * 2 + network_fee

  dummy_utxo.addOutput({
    address: p2tr.address,
    value: dummy_amount
  })

  dummy_utxo.addOutput({
    address: p2tr.address,
    value: dummy_amount
  })

  while (need_sats > 0) {
    const utxo = utxos.pop()
    const value = utxo.satoshis
    dummy_utxo.addInput({
      hash: utxo.txId,
      index: +utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: p2tr.output
      },
      tapInternalKey: p2tr.internalPubkey,
    })
    if (value >= need_sats) {
      const left = value - need_sats
      dummy_utxo.addOutput({
        address: p2tr.address,
        value: left
      })
      need_sats = 0 
    } else {
      need_sats = need_sats - value
    }
  }

  return {
    dummy_utxo,
    utxos
  }

}

export async function selectDummyUtxo({
  un_utxos,
}: {
  un_utxos: UnspentOutput[];
}) {

  const dummy_amount = 600 
  const dummy_utxos = []
  const utxos = []
  
  for(const utxo of un_utxos ) {
    const { satoshis } = utxo 
    if( dummy_utxos.length >= 2 ) {
      utxos.push( utxo )
    } else {
      if( satoshis <= dummy_amount ) {
        dummy_utxos.push( utxo )
      }
    }
  }

  return {
    dummy_utxos ,
    utxos
  }

}

export function generateDummyUtxosFromSignedPsbt({
  signed_dummy_utxo,
  public_key,
  network
}: {
  signed_dummy_utxo: string;
  public_key: string,
  network: any;
}){
  const dummy_psbt = Psbt.fromHex( signed_dummy_utxo , {
    network
  })

  const p2tr = payments.p2tr({
    internalPubkey: toXOnly(Buffer.from( public_key , 'hex')),
    network
  })

  const dummy_amount = 600 
  const txId = dummy_psbt.extractTransaction().getId()
  
  return [
    {
        txId,
        "outputIndex": 0,
        "satoshis": dummy_amount,
        "address": "",
        "scriptPk": p2tr.output,
        "addressType": 2,
        "inscriptions": []
    },
    {
        txId,
        "outputIndex": 1,
        "satoshis": dummy_amount,
        "address": "",
        "scriptPk": p2tr.output,
        "addressType": 2,
        "inscriptions": []
    }]
}