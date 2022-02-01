import config from '../config.json'

export async function addAsset() {
	const { ethereum } = window

	await ethereum.request({
		method: 'wallet_watchAsset',
		params: {
			type: 'ERC20',
			options: {
                address: config.bonded.address,
                symbol: config.bonded.symbol,
                decimals: config.bonded.decimals,
                image: config.bonded.image,
            },
		},
	})
}