const bondingCurveAddr = process.argv.slice(2)[0]
const collateralTokenAddr = process.argv.slice(2)[1]
const chainId = parseInt(process.argv.slice(2)[2])
const fs = require('fs');

const { Contract, providers } = require('ethers')
const config = require('../config.json')
const bondingCurveAbi = require('../lib/abi/augmented-bonding-curve.json')
const tokenAbi = require('../lib/abi/token.json')

const rpc = {
  100: 'https://xdai.rpc.blossom.software/'
}

async function main() {
  const provider = new providers.JsonRpcProvider(rpc[chainId], chainId)
  const bondingCurve = new Contract(bondingCurveAddr, bondingCurveAbi, provider)
  const collateral = new Contract(collateralTokenAddr, tokenAbi, provider)
  const bonded = new Contract(await bondingCurve.token(), tokenAbi, provider)

  config.knownContracts[String(chainId)] = {
    BANCOR_FORMULA: await bondingCurve.formula(),
    BONDING_CURVE_RESERVE: await bondingCurve.reserve(),
    BONDING_CURVE: bondingCurve.address,
    COLLATERAL_TOKEN: collateral.address,
    BONDED_TOKEN: bonded.address,
    TOKEN_MANAGER: await bondingCurve.tokenManager()
  }

  config.collateral = {
    symbol: await collateral.symbol(),
    decimals: await collateral.decimals()
  }

  config.bonded = {
    symbol: await bonded.symbol(),
    decimals: await bonded.decimals()
  }
  fs.writeFileSync("./config.json", JSON.stringify(config, null, '  '));
  console.log(config)
  console.log("Saved new config.json")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });