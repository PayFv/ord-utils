
import { Psbt, networks, payments } from "bitcoinjs-lib";
import { createInscriptionOffer, createUnsignedBuyOffer, createDummyUTXO, AddressType } from "../src";

describe("Make Sell Offer ---->", () => {

    it("generate offer", async function () {

        const network = networks.testnet

        // scriptPK 5120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd112
        const inscription_utxo = {
            txId: "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b",
            outputIndex: 0,
            satoshis: 546,
            scriptPk: '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d',
            addressType: AddressType.P2TR,
            address: 'tb1pmjuwvnz77gffv6rxgpn2l82q8wddv9k5a25nsxn4qp860eeu6yfqeq3ssp',
            inscriptions: [{
                id: 'e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0',
                offset: 0,
            }]
        }

        const offer = await createInscriptionOffer({
            inscription_utxo,
            rec_public_key: '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d',
            amount: 30000,
            network,
            commission: {
                address: 'tb1p9cagsc45pcaqk2tvtrat85t2xhvcpnsshlkrx5uhpra3pummq8eskp0jga',
                value: 1234
            },
        })
        
        console.log(offer.toHex())

    })

    it('Buy sign ----> ', async function () {

        const order_psbt_hex = `70736274ff0100dd0200000002da32f29e31b9c134432807bcf6a4ecd64fc17886f92609ec997b1b3ece0e50485902000000ffffffff6b8420b56db2e0975f568c6a94897d5a0eae5a2ab02e43777352435569045f930000000000ffffffff0322020000000000002251205416311c38701908e4f0ca5623bd631eda9b29c9923b7912031cf17b376aab623075000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd112d2040000000000002251202e3a8862b40e3a0b296c58fab3d16a35d980ce10bfec33539708fb10f37b01f3000000000001012b30750000000000002251205416311c38701908e4f0ca5623bd631eda9b29c9923b7912031cf17b376aab620117201bc91251f239f888706817e93e419f1532be84a1fc77166526902a36f6e8c7070001012b2202000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd1120108430141462faf9bf974b12def243e1b81e7c1ff7ee0ffecb28d56d24fc4beb85a65775b90f1252bd02e407fcb08cd6473f1f91e1138fcf4a46c2e03166e1f83ac7b6e778300000000`
        const inscription_output = '935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846bi0'

        const network = networks.testnet
        const amount = 30000
        const indexes = [1, 1]
        const fee_rate = 6

        const to_submit_txs = []


        const dummy_utxos = [{
            txId: "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b",
            outputIndex: 0,
            satoshis: 50000,
            scriptPk: '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d',
            addressType: AddressType.P2TR,
            address: 'tb1pmjuwvnz77gffv6rxgpn2l82q8wddv9k5a25nsxn4qp860eeu6yfqeq3ssp',
            inscriptions: [{
                id: '',
                offset: 0
                // id: 'e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0',
                // offset: 0,
            }]
        },{
            txId: "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846b",
            outputIndex: 0,
            satoshis: 50000,
            scriptPk: '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d',
            addressType: AddressType.P2TR,
            address: 'tb1pmjuwvnz77gffv6rxgpn2l82q8wddv9k5a25nsxn4qp860eeu6yfqeq3ssp',
            inscriptions: [{
                id: '',
                offset: 0
                // id: 'e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0',
                // offset: 0,
            }]
        }]

        const utxos = [{
            txId: "935f04695543527377432eb02a5aae0e5a7d89946a8c565f97e0b26db520846a",
            outputIndex: 0,
            satoshis: 50000,
            scriptPk: '03ac6d5bda18a62e940ee7e2c332da70968945a453329551001d5c8c6fe281669d',
            addressType: AddressType.P2TR,
            address: 'tb1pmjuwvnz77gffv6rxgpn2l82q8wddv9k5a25nsxn4qp860eeu6yfqeq3ssp',
            inscriptions: [{
                id: '',
                offset: 0
                // id: 'e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0',
                // offset: 0,
            }]
        }]

        // if( utxos.length < 2 ) {
        //     const dummy_utxo = await createDummyUTXO({
        //         network,
        //         utxo: utxos[0],
        //         fee_rate
        //     })

        //     const scriptPk = utxos[0].scriptPk
        //     // call unisat to sign ,https://demo.unisat.io/
        //     // console.log( dummy_utxo.toHex())    
            
        //     const signed_dummy_utxo = Psbt.fromHex('70736274ff01008902000000016b8420b56db2e0975f568c6a94897d5a0eae5a2ab02e43777352435569045f930000000000ffffffff025802000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd1125cbd000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd112000000000001012b50c3000000000000225120dcb8e64c5ef2129668664066af9d403b9ad616d4eaa9381a75004fa7e73cd11201084201409d8f8de53cfbe7ce298d46a5b70288fbfe2684bf3b4b89606ee987ab80c9478d9d0f44e32818ad13015fd298082de19f1efa4b84a8f8a4b39f1432eda8c5530a000000')

        //     // to sign
        //     const dummy_txid = signed_dummy_utxo.extractTransaction().getId()

        //     // // remove utxo
        //     utxos.shift()

        //     signed_dummy_utxo.txOutputs.forEach( ( output, idx ) => {
        //         utxos.push({
        //             txId: dummy_txid,
        //             outputIndex: idx,
        //             satoshis: output.value,
        //             scriptPk ,
        //             addressType: AddressType.P2TR,
        //             address: output.address! ,
        //             inscriptions: [{
        //                 id: '',
        //                 offset: 0
        //                 // id: 'e6c0d0d309f94dd606cb81b02821e67da286156c8110fcaca4709f69fc42100ei0',
        //                 // offset: 0,
        //             }]
        //         })
        //     }) 

        // }

        // console.log( utxos )

        const offer = await createUnsignedBuyOffer({
            order_psbt_hex,
            network,
            dummy_utxos,
            utxos,
            inscription_output,
            fee_rate,
        })

        console.log(offer.txOutputs)

    })

})