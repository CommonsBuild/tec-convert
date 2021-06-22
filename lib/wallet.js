import React, { useCallback, useContext, useMemo } from 'react'
import { providers } from 'ethers'
import { UnsupportedChainError, UseWalletProvider, useWallet } from 'use-wallet'
import env from './environment'
import { getNetworkName } from './web3-utils'
import { addEthereumChain, getNetwork } from './networks'

const CHAIN_ID = Number(env('CHAIN_ID'))

const WalletAugmentedContext = React.createContext()

function logError(err, ...messages) {
  // Check for presence of window to determine browser env before showing alert
  if (typeof window !== 'undefined') {
    window.alert(messages.join(' '))
  }
  console.error(...messages, err)
}

function useWalletAugmented() {
  return useContext(WalletAugmentedContext)
}

// Add Ethers.js, error handling to the useWallet() object
function WalletAugmented({ children }) {
  const wallet = useWallet()
  const { ethereum, activate } = wallet

  const ethersProvider = useMemo(
    () => (ethereum ? new providers.Web3Provider(ethereum) : null),
    [ethereum]
  )

  const augmentedActivate = useCallback(
    async type => {
      try {
        await addEthereumChain()
        await activate(type)
        return true
      } catch (error) {
        if (error instanceof UnsupportedChainError) {
          logError(
            error,
            `Unsupported chain: please connect to the network called ${getNetworkName(
              CHAIN_ID
            )} in your Ethereum Provider.`
          )

          return
        }
      }
    },
    [activate]
  )

  const contextValue = useMemo(
    () => ({
      ...wallet,
      activate: augmentedActivate,
      networkName: getNetworkName(CHAIN_ID),
      ethersProvider,
    }),
    [wallet, ethersProvider, augmentedActivate]
  )

  return (
    <WalletAugmentedContext.Provider value={contextValue}>
      {children}
    </WalletAugmentedContext.Provider>
  )
}

function WalletProvider({ children }) {
  return (
    <UseWalletProvider
      chainId={CHAIN_ID}
      
    >
      <WalletAugmented>{children}</WalletAugmented>
    </UseWalletProvider>
  )
}

export { useWalletAugmented, WalletProvider }
