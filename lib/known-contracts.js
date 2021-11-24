import env from './environment'

import tokenAbi from './abi/token.json'
import tokenManagerAbi from './abi/token-manager.json'
import bancorAbi from './abi/bancor.json'
import bondingCurveAbi from './abi/augmented-bonding-curve.json'

import { knownContracts } from '../config'

const KNOWN_CONTRACTS_BY_ENV = new Map(knownContracts)

const ABIS = new Map([
  ['COLLATERAL_TOKEN', tokenAbi],
  ['BONDED_TOKEN', tokenAbi],
  ['TOKEN_MANAGER', tokenManagerAbi],
  ['BANCOR_FORMULA', bancorAbi],
  ['BONDING_CURVE', bondingCurveAbi],
])

export function getKnownAbi(name) {
  return ABIS.get(name)
}

export function getKnownContract(name) {
  const knownContracts = KNOWN_CONTRACTS_BY_ENV.get(env('CHAIN_ID')) || {}
  return [knownContracts[name] || null, getKnownAbi(name) || []]
}

export default KNOWN_CONTRACTS_BY_ENV
