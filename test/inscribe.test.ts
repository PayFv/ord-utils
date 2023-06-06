import {
    LocalWallet,
    NetworkType,
    publicKeyToScriptPk,
    toPsbtNetwork,
} from "../src/LocalWallet"
import { AddressType, validator } from "../src/OrdTransaction";
import { createInscribe } from "../src"


const feeRate = 2
const networkType = NetworkType.TESTNET
const addressType = AddressType.P2TR
const wallet = new LocalWallet(
    "cQorDQ6ocxuCkHtYNy6rfnRW3qXN3XX5XnNi7HyqjGZ6rDgRhR3J",
    networkType,
    addressType
)
const network = toPsbtNetwork(networkType);
const testUtxoDatas = [
    { satoshis: 200000, ords: [{ id: "001", offset: 1000 }] },
    { satoshis: 6000 },
]

const utxos = testUtxoDatas.map((v, index) => {
    const scriptPk = publicKeyToScriptPk(
      wallet.pubkey,
      addressType,
      networkType
    );
    return {
      txId: "f39c6631fa36762c4a1b1ee2d37e2b3526184d9012d3e0b019b67ffb5d5fef50",
      outputIndex: index,
      satoshis: v.satoshis,
      scriptPk,
      addressType,
      address: wallet.address,
      ords: v.ords || [],
    };
  })

const toAddress = "tb1pcwrxqqwkk3mq04zy9wyxxwt79tljfgu2ghl2h770n5z98yjhvvnqdj2n0z"

const content = Buffer.from(`{"p":"brc-20","op":"transfer","tick":"cmax","amt":"47"}`,'utf-8')

describe("inscribeInscription", () => {
    beforeEach(() => {
        // todo
    });

    it("inscribe", async function () {

        const commission = {
            address: "tb1p2strz8pcwqvs3e8seftz80trrmdfk2wfjgahjysrrnchkdm24d3qhpr723",  //test#0
            amount: 2023
        }

        // console.log(1)
        const v = await createInscribe({
            utxos: utxos,
            toAddress,
            wallet,
            network,
            changeAddress: wallet.address,
            pubkey: wallet.pubkey,
            feeRate,
            dump: true,
            commission,
            tag: `ord`,
            content_type: "text/plain;charset=utf-8",
            content
        })
        // console.log( v )

    });
})