import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Contract as EthersContract, utils as EthersUtils } from 'ethers'
import { getKnownContract, getKnownAbi } from './known-contracts'
import { useWalletAugmented } from './wallet'
import { bigNum } from './utils'
import { parseUnits } from './web3-utils'

import { collateral, bonded } from '../config'

const ONE = bigNum(10).pow(18)
const PCT_BASE = bigNum(10).pow(18)

const contractsCache = new Map()
const tokenDecimals = new Map([
  [collateral.symbol, collateral.decimals],
  [bonded.symbol, bonded.decimals],
])

export function getContract(address, abi, ethersProvider) {
  if (!address || !ethersProvider) {
    return null
  }
  if (contractsCache.has(address)) {
    return contractsCache.get(address)
  }

  const contract = new EthersContract(
    address,
    abi,
    ethersProvider.getSigner()
  )

  contractsCache.set(address, contract)

  return contract
}

function useKnownContract(name) {
  const { ethersProvider } = useWalletAugmented()
  const [address, abi] = getKnownContract(name)
  return useMemo(() => {
    return getContract(address, abi, ethersProvider)?.connect(ethersProvider.getSigner())
  }, [address, abi, ethersProvider])
}

export function useTokenDecimals(symbol) {
  return tokenDecimals.get(symbol)
}

export function useCollateral() {
  const bondingCurveContract = useKnownContract('BONDING_CURVE')
  const [address] = getKnownContract('COLLATERAL_TOKEN')
  
  const [[virtualSupply, virtualBalance, reserveRatio], setCollateral] = useState([])

  const fetchCollateral = useCallback(async () => {
    try {
      if(!bondingCurveContract) {
        return null
      }
      const [, _virtualSupply, _virtualBalance, _reserveRatio] = await bondingCurveContract.getCollateralToken(address)
      return setCollateral([_virtualSupply, _virtualBalance, _reserveRatio])
    } catch (err) {
      console.log(err)
      throw new Error(err.message)
    }
  }, [address, bondingCurveContract])

  useEffect(() => {
    fetchCollateral()
  }, [fetchCollateral])

  return [virtualSupply, virtualBalance, reserveRatio]
}

//returns the tribute percentages as a number between 0 an 100
export function useTributePcts() {
  const bondingCurveContract = useKnownContract('BONDING_CURVE')

  const [entryTribute, setEntryTribute] = useState(bigNum(0))
  const [exitTribute, setExitTribute] = useState(bigNum(0))

  const getTribute = useCallback(async () => {
    try {
      if(!bondingCurveContract) {
        return null
      }
      setEntryTribute(await bondingCurveContract.buyFeePct())
      setExitTribute(await bondingCurveContract.sellFeePct())
    } catch (err) {
      console.log(err)
      throw new Error(err.message)
    }
  }, [bondingCurveContract])
  
  useEffect(() => {
    getTribute()
  }, [getTribute])
  
  return [entryTribute, exitTribute]
}


export function useTokenBalance(symbol, address = '') {
  const { account } = useWalletAugmented()
  const [[balance, spendableBalance], setBalances] = useState([bigNum(-1), bigNum(0)])
  const tokenContract = useKnownContract(collateral.symbol === symbol ? 'COLLATERAL_TOKEN' : 'BONDED_TOKEN')
  const tokenManagerContract = useKnownContract('TOKEN_MANAGER')

  const cancelBalanceUpdate = useRef(null)

  const updateBalance = useCallback(() => {
    let cancelled = false

    if (cancelBalanceUpdate.current) {
      cancelBalanceUpdate.current()
      cancelBalanceUpdate.current = null
    }

    if ((!account && !address) || !tokenContract) {
      setBalances([bigNum(-1), bigNum(0)])
      return
    }

    cancelBalanceUpdate.current = () => {
      cancelled = true
    }
    const requestedAddress = address || account
    const totalBalance = tokenContract.balanceOf(requestedAddress)

    const balances = collateral.symbol === symbol || !tokenManagerContract ?
      [totalBalance, totalBalance] :
      [totalBalance, tokenManagerContract.spendableBalanceOf(requestedAddress)]

    Promise.all(balances).then(([balance, spendableBalance]) => {
      if (!cancelled) {
        setBalances([balance, spendableBalance])
      }
    })
  }, [account, address, tokenContract, symbol, tokenManagerContract])

  useEffect(() => {
    // Always update the balance if updateBalance() has changed
    updateBalance()
    if ((!account && !address) || !tokenContract) {
      return
    }

    const onTransfer = (from, to, value) => {
      if (
        from === account ||
        to === account ||
        from === address ||
        to === address
      ) {
        updateBalance()
      }
    }
    tokenContract.on('Transfer', onTransfer)

    return () => {
      tokenContract.removeListener('Transfer', onTransfer)
    }
  }, [account, address, tokenContract, updateBalance])

  return [balance, spendableBalance]
}

function applyTribute(amount, tribute) {
  return amount.sub(amount.mul(tribute).div(PCT_BASE))
}

export function useBondingCurvePrice(amount, forwards = true) {
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState(bigNum(-1))
  const [pricePerUnit, setPricePerUnit] = useState(bigNum(-1))
  const bondedContract = useKnownContract('BONDED_TOKEN')
  const collateralContract = useKnownContract('COLLATERAL_TOKEN')
  const bancorContract = useKnownContract('BANCOR_FORMULA')

  const [treasuryAddress] = getKnownContract('BONDING_CURVE_RESERVE')
  // const [collateralTreasuryBalance] = useTokenBalance(collateral.symbol, treasuryAddress)
  const [entryTribute, exitTribute] = useTributePcts()
  const [virtualBalance, virtualSupply, reserveRatio] = useCollateral()
  const RETRY_EVERY = 5000

  useEffect(() => {
    let cancelled = false
    let retryTimer
    if (!bondedContract || !collateralContract || !bancorContract) {
      return
    }

    const getSalePrice = async () => {
      try {
        setLoading(true)
        const bondedTotalSupply = await bondedContract.totalSupply()
        const collateralTreasuryBalance = await collateralContract.balanceOf(treasuryAddress)
        const amountToCheck = amount.isZero() ? parseUnits('1') : amount
        const salePrice = (forwards
          ? await bancorContract.calculatePurchaseReturn(
              bondedTotalSupply.add(virtualSupply),
              collateralTreasuryBalance.add(virtualBalance).add(applyTribute(amountToCheck, entryTribute)),
              reserveRatio,
              applyTribute(amountToCheck, entryTribute)
            )
          : applyTribute(
              await bancorContract.calculateSaleReturn(
                bondedTotalSupply.add(virtualSupply).sub(amountToCheck),
                collateralTreasuryBalance.add(virtualBalance),
                reserveRatio,
                amountToCheck
              ),
              exitTribute
            )
        )

        if (!cancelled) {
          setLoading(false)
          if (amount.isZero()) {
            setPrice(bigNum(0))
            setPricePerUnit(salePrice)
          } else {
            setPrice(salePrice)
            setPricePerUnit(salePrice.mul(ONE).div(amount))
          }
        }
      } catch (err) {
        if (!cancelled) {
          retryTimer = setTimeout(getSalePrice, RETRY_EVERY)
        }
      }
    }

    getSalePrice()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [amount, bondedContract, bancorContract, reserveRatio, forwards, entryTribute, exitTribute, virtualSupply, virtualBalance, collateralContract, treasuryAddress])

  return useMemo(() => ({ loading, price, pricePerUnit, entryTribute, exitTribute }), [entryTribute, exitTribute, loading, price, pricePerUnit])
}

export function useAllowance() {
  const { account } = useWalletAugmented()
  const collateralContract = useKnownContract('COLLATERAL_TOKEN')
  const [bondingCurveAddress] = getKnownContract('BONDING_CURVE')

  return useCallback(async () => {
    try {
      if (!collateralContract) {
        throw new Error('Collateral token contract not loaded')
      }

      return await collateralContract.allowance(account, bondingCurveAddress)
    } catch (err) {
      throw new Error(err.message)
    }
  }, [account, collateralContract, bondingCurveAddress])
}

export function useApprove() {
  const collateralContract = useKnownContract('COLLATERAL_TOKEN')
  const [bondingCurveAddress] = getKnownContract('BONDING_CURVE')

  return useCallback(
    async amount => {
      try {
        if (!collateralContract) {
          throw new Error('Collateral token contract not loaded')
        }

        return await collateralContract.approve(bondingCurveAddress, amount)
      } catch (err) {
        throw new Error(err.message)
      }
    },
    [collateralContract, bondingCurveAddress]
  )
}

// Convert collateral to bonded token action
export function useMakeOrder() {
  const { account } = useWalletAugmented()
  const bondingCurveContract = useKnownContract('BONDING_CURVE')
  const [collateralAddress] = getKnownContract('COLLATERAL_TOKEN')

  return useCallback(
    async (amount, toBonded = true, minReturn = 0) => {
      try {
        if (!bondingCurveContract) {
          throw new Error('Fundraising contract not loaded')
        }

        return await (toBonded
          ? bondingCurveContract.makeBuyOrder(account, collateralAddress, amount, minReturn, {
              gasLimit: 650000,
              value: 0,
            })
          : bondingCurveContract.makeSellOrder(account, collateralAddress, amount, minReturn, {
              gasLimit: 850000,
            }))
      } catch (err) {
        throw new Error(err.message)
      }
    },
    [collateralAddress, bondingCurveContract, account]
  )
}

export function useOrderReceiptAmount() {
  const { ethersProvider } = useWalletAugmented()

  return useCallback(
    async hash => {
      const abi = getKnownAbi('BONDING_CURVE')
      const abiInterface = new EthersUtils.Interface(abi)

      try {
        const transactionReceipt = await ethersProvider.getTransactionReceipt(
          hash
        )

        const parsedTransferLog = abiInterface.parseLog(
          transactionReceipt.logs.slice(-1)[0] // last element
        )

        const amount = parsedTransferLog.values.returnedAmount

        return amount ? bigNum(amount) : null
      } catch (err) {
        throw new Error(err)
      }
    },
    [ethersProvider]
  )
}
