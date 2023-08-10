
import { Psbt, networks, payments } from "bitcoinjs-lib";
import { createInscriptionOffer, createUnsignedBuyOffer, createDummyUTXO, AddressType } from "../src";

const buyer_public_key = "0369d1059da3bcf1e321fe381b5ac432f328d951c6dd677938ead941b4c06c90b2"
const seller_publick_key = '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d'
const inscription =
{
    "inscriptionId": "e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0",
    "inscriptionNumber": 4673,
    "address": "tb1pmjuwvnz77gffv6rxgpn2l82q8wddv9k5a25nsxn4qp860eeu6yfqeq3ssp",
    "outputValue": 546,
    "preview": "https://ordinals.com/preview/e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0",
    "content": "https://ordinals.com/content/e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0",
    "contentLength": 55,
    "contentType": "text/plain;charset=utf-8",
    "contentBody": "",
    "timestamp": 1684824415,
    "genesisTransaction": "e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100e",
    "location": "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b:0:0",
    "output": "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b:0",
    "offset": 0
}

const inscription_output = inscription.output.split(':')
// scriptPK 5120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd112
const inscription_utxo = {
    txId: inscription_output[0],
    outputIndex: +inscription_output[1],
    satoshis: inscription.outputValue,
    scriptPk: seller_publick_key,
    addressType: AddressType.P2TR,
    address: inscription.address,
    inscriptions: [{
        id: inscription.inscriptionId,
        offset: inscription.offset,
    }]
}

describe("Make Sell Offer ---->", () => {

    it('generate dummy utxo', async function () {
        const network = networks.testnet

        const utxos = [
            {
                "txId": "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b",
                "outputIndex": 1,
                "satoshis": 199787,
                "scriptPk": "51202e3a8862b40e3a0b296c58fab3d16a35d980ce10bfec33539708fb10f37b01f3",
                "addressType": 2,
                "address": "",
                "inscriptions": []
            }
        ]

        const fee_rate = 1
        const dummy_utxo_psbt = await createDummyUTXO({
            network,
            publick_key: buyer_public_key,
            utxos, fee_rate
        })

        console.log(`Dummy psbt hex ----> `)
        console.log(dummy_utxo_psbt.dummy_utxo.toHex())

    })

    it("generate offer", async function () {

        const network = networks.testnet
        const public_key = '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d'

        // from unisat 


        const offer = await createInscriptionOffer({
            inscription_utxo,
            rec_public_key: public_key,
            amount: 3011,
            network,
            // commission: {
            //     address: 'tb1p9cagsc45pcaqk2tvtrat85t2xhvcpnsshlkrx5uhpra3pummq8eskp0jga',
            //     value: 1234
            // },
        })
        console.log(`Sell Offer ----> `)
        console.log(offer.toHex())

    })

    it('Buy sign ----> ', async function () {

        const order_psbt_hex = `70736274ff0100fd0601020000000300000000000000000000000000000000000000000000000000000000000000000100000000ffffffff01000000000000000000000000000000000000000000000000000000000000000200000000ffffffff6b8420b56db2e0975f568c6a94897d5a0eae5a2ab02e43777352435569045f930000000000ffffffff0300000000000000002251205416311c38701908e4f0ca5623bd631eda9b29c9923b7912031cf17b376aab6222020000000000002251205416311c38701908e4f0ca5623bd631eda9b29c9923b7912031cf17b376aab62c30b000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd112000000000001012bc30b0000000000002251205416311c38701908e4f0ca5623bd631eda9b29c9923b7912031cf17b376aab620117201bc91251f239f888706817e93e419f1532be84a1fc77166526902a36f6e8c7070001012bc30b0000000000002251205416311c38701908e4f0ca5623bd631eda9b29c9923b7912031cf17b376aab620117201bc91251f239f888706817e93e419f1532be84a1fc77166526902a36f6e8c7070001012b2202000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd1120108430141baaf59cb38675235579c434bb3506fe5469cc43acfceee45c3c34d21b82edbe23f7f3147ad60a57d9c37df77e97f5ac879a3180dc60d3f46de58ccfd8054c4f88300000000`

        const network = networks.testnet
        const fee_rate = 6

        const dummy_utxos = [
            {
                "txId": "23c8a5e8a2c546aee8d8468cf04b23b451d9418a49e7dbebe8fa6f6255b7b58b",
                "outputIndex": 0,
                "satoshis": 5306,
                "address": "",
                "scriptPk": "51202e3a8862b40e3a0b296c58fab3d16a35d980ce10bfec33539708fb10f37b01f3",
                "addressType": 2,
                "inscriptions": []
            },
            {
                "txId": "a90a998ea137838249eddc87649af470b068a1adb77644d711fde6a691eb74aa",
                "outputIndex": 0,
                "satoshis": 1000,
                "address": "",
                "scriptPk": "51202e3a8862b40e3a0b296c58fab3d16a35d980ce10bfec33539708fb10f37b01f3",
                "addressType": 2,
                "inscriptions": []
            }]

        const utxos = [{
                "txId": "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b",
                "outputIndex": 1,
                "satoshis": 199787,
                "address": "",
                "scriptPk": "51202e3a8862b40e3a0b296c58fab3d16a35d980ce10bfec33539708fb10f37b01f3",
                "addressType": 2,
                "inscriptions": []
        },]

        // console.log( utxos )

        const offer = await createUnsignedBuyOffer({
            order_psbt_hex,
            network,
            buyer_public_key,
            dummy_utxos,
            utxos,
            inscription_utxo,
            fee_rate,
        })

        console.log(offer.toHex())

    })

})