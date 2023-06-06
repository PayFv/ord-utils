import { Psbt, payments } from "bitcoinjs-lib";
import { OrdTransaction, InscribeTransaction, UnspentOutput, toXOnly, build_script } from "./OrdTransaction";
import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";
import { satoshisToAmount } from "./utils";
import { LocalWallet } from "./LocalWallet";

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
    if (v.ords.length > 0) {
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
    console.log(`output:` , output , networkFee )
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
    if (v.ords.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  // find NFT
  let found = false;

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    if (ordUtxo.ords.find((v) => v.id == toOrdId)) {
      if (ordUtxo.ords.length > 1) {
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
    if (v.ords.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  // find NFT
  let foundedCount = 0;

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    if (ordUtxo.ords.find((v) => toOrdIds.includes(v.id))) {
      if (ordUtxo.ords.length > 1) {
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
    if (v.ords.length > 0) {
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
  enableRBF = true ,
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
}){
  const ord_value = 546

  // const nonOrdUtxos: UnspentOutput[] = [];
  // const ordUtxos: UnspentOutput[] = [];
  // utxos.forEach((v) => {
  //   if (v.ords.length > 0) {
  //     ordUtxos.push(v);
  //   } else {
  //     nonOrdUtxos.push(v);
  //   }
  // });

  const tmp_reveal_tx = new InscribeTransaction( wallet, network , pubkey , feeRate)

  tmp_reveal_tx.setInscription( tag, content_type, content )

  tmp_reveal_tx.addOutput(toAddress, ord_value )

  tmp_reveal_tx.build_reveal_input( utxos[0] )
  const reveal_tx_network_fee = await tmp_reveal_tx.calNetworkFee()
  // console.log(`Reveal tx's network fee: ${reveal_tx_network_fee}`)

  const commit_amt = reveal_tx_network_fee + ord_value

  // console.log( utxos )
  const commit_p2tr = tmp_reveal_tx.getP2TRAddress()
  const receivers = [{
    address: commit_p2tr.address,
    amount: commit_amt
  }]
  if( commission ) receivers.push( commission )

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
    enableRBF
  })
  // console.log( commit_tx )
  const commit_tx_detail = commit_tx.extractTransaction()
  const commit_txid = commit_tx_detail.getId()

  tmp_reveal_tx.build_reveal_input({
    txId: commit_txid,
    outputIndex: 0,
    satoshis: commit_amt
  })

  const reveal_tx: Psbt = await tmp_reveal_tx.createSignedInscribe()
  // reveal_tx_input_data.index = 0 
  
  // tmp_reveal_tx.addRevealInput({

  // })
  // reveal_tx_input_data.witnessUtxo = {
  //   value: commit_tx.txOutputs[0].value,
  //   script: commit_tx.txOutputs[0].script
  // }

  // const reveal_transaction = new OrdTransaction(wallet, network, pubkey, feeRate)
  // reveal_transaction.addRevealInput({
  //   data: reveal_tx_input_data,
  //   utxo: tmp_utxo
  // })

  // reveal_transaction.addOutput(toAddress, ord_value )

  // const reveal_tx = await reveal_transaction.createSignedPsbt()

  // if( dump ) {
  //   console.log(`Commit Tx ===> `)
  //   tmp_reveal_tx.dumpTx( commit_tx )

  //   console.log(`Reveal Tx ===> `)
  //   tmp_reveal_tx.dumpTx( reveal_tx )
  // }

  if( dump ) {
    console.log(`createInscribe(reveal tx)==> `)
    tmp_reveal_tx.dumpTx( reveal_tx)
  }

  return {
    commit_tx , 
    reveal_tx
  }

}