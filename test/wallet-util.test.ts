import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.bitcoin

const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

const pubkey_buff = Buffer.from('0226ba8e29406547a9e5d75127aee5c7b4e3208ee429c02a39e2c6e90178853785', 'hex' )

const psbt = new bitcoin.Psbt({
    network
})

const p2tr = bitcoin.payments.p2tr({
    internalPubkey: toXOnly(pubkey_buff),
    network
})

const inscription = {
    txid : "48500ece3e1b7b99ec0926f98678c14fd6eca4f6bc07284334c1b9319ef232db",
    value : 546,
    vout : "0"
}

const sell_amount = 67001
const scriptPK = p2tr.output || Buffer.from('0','hex')

psbt.addInput({
    hash: '48500ece3e1b7b99ec0926f98678c14fd6eca4f6bc07284334c1b9319ef232da', 
    index: +inscription.vout,
    witnessUtxo: {
        value: sell_amount,
        script: scriptPK
    },
    tapInternalKey: toXOnly( pubkey_buff )
})

psbt.addInput({
    hash: inscription.txid, 
    index: +inscription.vout,
    witnessUtxo: {
        value: inscription.value,
        script: scriptPK
    },
    sighashType: 0x03 | 0x80,
    tapInternalKey: toXOnly( pubkey_buff )
})

const address = p2tr.address || '1'
psbt.addOutput({
    address: 'bc1pyd5um20xna22zw83fxuuu2znux5judh05j9utqqjeslpxzzktfqq8atsh3' ,
    value: inscription.value 
})

psbt.addOutput({
    address ,
    value: sell_amount
})

console.log( psbt.toHex())

// console.log( p2tr.output )
// console.log(`scriptPK: ` , Buffer.from('51204657088751b5db98989bb3f8638f3761adda1d8d1fa4bf9e1fe4c834be27999a','hex'))