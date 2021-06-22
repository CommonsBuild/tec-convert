import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Contract as EthersContract, utils as EthersUtils } from 'ethers'
import { getKnownContract, getKnownAbi } from './known-contracts'
import { useWalletAugmented } from './wallet'
import { bigNum } from './utils'

import { collateral, bonded } from '../config'

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

export function useConnectorWeight() {
  const marketMakerContract = useKnownContract('MARKET_MAKER')
  const [address] = getKnownContract('COLLATERAL_TOKEN')
  
  const [reserveRatio, setReserveRatio] = useState()
  const [collateralToken, setCollateralToken] = useState()

  const fetchCollateral = useCallback(async () => {
    try {
      if(!marketMakerContract) {
        return null
      }
      const collateralToken = await marketMakerContract.getCollateralToken(address)
  
      setCollateralToken(collateralToken)
  
      return setReserveRatio(collateralToken[collateralToken.length - 1])
    } catch (err) {
      console.log(err)
      throw new Error(err.message)
    }
  }, [address, marketMakerContract])

  useEffect(() => {
    fetchCollateral()
  }, [fetchCollateral])

  return [reserveRatio, collateralToken, marketMakerContract]
}

//returns the tribute percentages as a number between 0 an 100
export function useTributePcts(){
  const marketMakerContract = useKnownContract('MARKET_MAKER')

  const [entryTribute, setEntryTribute] = useState(0)
  const [exitTribute, setExitTribute] = useState(0)

  const getTribute = useCallback(async () => {
    try {
      if(!marketMakerContract) {
          return null
        }
      const buyFeePct = await marketMakerContract.buyFeePct()
      const sellFeePct = await marketMakerContract.sellFeePct()
      const PCT_BASE = await marketMakerContract.PCT_BASE() 
      setEntryTribute((buyFeePct/PCT_BASE)*100)
      setExitTribute((sellFeePct/PCT_BASE)*100)
      
      
    } catch (err) {
      console.log(err)
      throw new Error(err.message)
    }
  }, [marketMakerContract])
  
  useEffect(() => {
    getTribute()
  },[getTribute])
  
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

export function useBondingCurvePrice(amount, forwards = true) {
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState(bigNum(-1))
  const bondedContract = useKnownContract('BONDED_TOKEN')
  const bancorContract = useKnownContract('BANCOR_FORMULA')

  const [treasuryAddress] = getKnownContract('BONDING_CURVE_RESERVE')
  const [collateralTreasuryBalance] = useTokenBalance(collateral.symbol, treasuryAddress)
  const [connectorWeight] = useConnectorWeight()

  const RETRY_EVERY = 5000

  useEffect(() => {
    let cancelled = false
    let retryTimer

    if (!bondedContract || collateralTreasuryBalance.eq(-1) || !bancorContract) {
      return
    }

    const getSalePrice = async () => {
      try {
        setLoading(true)
        const bondedTotalSupply = await bondedContract.totalSupply()
        const salePrice = await (forwards
          ? bancorContract.calculatePurchaseReturn(
              bondedTotalSupply,
              collateralTreasuryBalance,
              connectorWeight,
              amount
            )
          : bancorContract.calculateSaleReturn(
              bondedTotalSupply,
              collateralTreasuryBalance,
              connectorWeight,
              amount
            ))
        if (!cancelled) {
          setLoading(false)
          setPrice(salePrice)
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
  }, [
    amount,
    bondedContract,
    collateralTreasuryBalance,
    bancorContract,
    connectorWeight,
    forwards,
  ])

  return useMemo(() => ({ loading, price }), [loading, price])
}

export function useAllowance() {
  const { account } = useWalletAugmented()
  const collateralContract = useKnownContract('COLLATERAL_TOKEN')
  const [marketMakerAddress] = getKnownContract('MARKET_MAKER')

  return useCallback(async () => {
    try {
      if (!collateralContract) {
        throw new Error('Collateral token contract not loaded')
      }

      return await collateralContract.allowance(account, marketMakerAddress)
    } catch (err) {
      throw new Error(err.message)
    }
  }, [account, collateralContract, marketMakerAddress])
}

export function useApprove() {
  const collateralContract = useKnownContract('COLLATERAL_TOKEN')
  const [marketMakerAddress] = getKnownContract('MARKET_MAKER')

  return useCallback(
    async amount => {
      try {
        if (!collateralContract) {
          throw new Error('Collateral token contract not loaded')
        }

        return await collateralContract.approve(marketMakerAddress, amount)
      } catch (err) {
        throw new Error(err.message)
      }
    },
    [collateralContract, marketMakerAddress]
  )
}

// Convert collateral to bonded token action
export function useMakeOrder() {
  const fundraisingContract = useKnownContract('MARKETPLACE')
  const [collateralAddress] = getKnownContract('COLLATERAL_TOKEN')

  return useCallback(
    async (amount, toBonded = true, minReturn = 0) => {
      try {
        if (!fundraisingContract) {
          throw new Error('Fundraising contract not loaded')
        }

        return await (toBonded
          ? fundraisingContract.makeBuyOrder(collateralAddress, amount, minReturn, {
              gasLimit: 650000,
              value: 0,
            })
          : fundraisingContract.makeSellOrder(collateralAddress, amount, minReturn, {
              gasLimit: 850000,
            }))
      } catch (err) {
        throw new Error(err.message)
      }
    },
    [collateralAddress, fundraisingContract]
  )
}

export function useOrderReceiptAmount() {
  const { ethersProvider } = useWalletAugmented()

  return useCallback(
    async hash => {
      const abi = getKnownAbi('COLLATERAL_TOKEN')
      const abiInterface = new EthersUtils.Interface(abi)

      try {
        const transactionReceipt = await ethersProvider.getTransactionReceipt(
          hash
        )

        const parsedTransferLog = abiInterface.parseLog(
          transactionReceipt.logs[1]
        )

        const amount = parsedTransferLog.values.amount

        return amount ? bigNum(amount) : null
      } catch (err) {
        throw new Error(err)
      }
    },
    [ethersProvider]
  )
}
